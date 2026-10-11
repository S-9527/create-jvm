import { describe, expect, it } from 'vitest';
import { generateMaven } from '../src/generators/maven.js';
import { generateGradle } from '../src/generators/gradle-project.js';
import { listFiles } from '../src/writer.js';
import type { ProjectConfig } from '../src/types.js';

/** Build a config with sensible defaults for a generator test. */
function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    kind: 'maven',
    name: 'demo',
    targetDir: '/tmp/demo',
    buildTool: 'maven',
    dsl: 'groovy',
    language: 'java',
    packaging: 'jar',
    groupId: 'com.example',
    artifactId: 'demo',
    version: '0.0.1-SNAPSHOT',
    javaVersion: '21',
    kotlinVersion: '2.4.21',
    bootVersion: '4.1.1',
    packageName: 'com.example.demo',
    description: '',
    dependencies: [],
    bootDependencies: [],
    multiModule: false,
    modules: [],
    shade: false,
    git: false,
    install: false,
    dryRun: true,
    force: false,
    ...overrides,
  };
}

/** Read a file from the map as text, asserting that it exists. */
function text(files: Map<string, string | Buffer>, path: string): string {
  const content = files.get(path);
  expect(content, `expected ${path} to exist`).toBeDefined();
  return content!.toString();
}

describe('generateMaven (single module)', () => {
  it('produces the expected layout', async () => {
    const files = await generateMaven(config());
    const paths = listFiles(files);
    expect(paths).toContain('pom.xml');
    expect(paths).toContain('src/main/java/com/example/demo/DemoApplication.java');
    expect(paths).toContain('src/test/java/com/example/demo/DemoApplicationTest.java');
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('README.md');
  });

  it('writes a valid POM header with the right coordinates', async () => {
    const pom = text(await generateMaven(config()), 'pom.xml');
    expect(pom).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(pom).toContain('<groupId>com.example</groupId>');
    expect(pom).toContain('<artifactId>demo</artifactId>');
    expect(pom).toContain('<packaging>jar</packaging>');
    expect(pom).toContain('<java.version>21</java.version>');
    expect(pom.trimEnd().endsWith('</project>')).toBe(true);
  });

  it('declares a version for every dependency', async () => {
    const pom = text(await generateMaven(config({ dependencies: ['junit5', 'lombok', 'guava'] })), 'pom.xml');
    // Every <dependency> must carry a <version> since there is no parent POM.
    const blocks = pom.split('<dependency>').slice(1);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const body = block.split('</dependency>')[0] ?? '';
      expect(body, `dependency missing version:\n${body}`).toContain('<version>');
    }
  });

  it('does not emit duplicate dependency coordinates', async () => {
    // junit5 is added both by the test stack and the explicit selection.
    const pom = text(await generateMaven(config({ dependencies: ['junit5'] })), 'pom.xml');
    const occurrences = pom.match(/<artifactId>junit-jupiter<\/artifactId>/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('registers the main class on the jar manifest', async () => {
    const pom = text(await generateMaven(config()), 'pom.xml');
    expect(pom).toContain('<mainClass>com.example.demo.DemoApplication</mainClass>');
    expect(pom).toContain('maven-jar-plugin');
  });

  it('emits a war build without the jar plugin when packaging is war', async () => {
    const pom = text(await generateMaven(config({ packaging: 'war' })), 'pom.xml');
    expect(pom).toContain('<packaging>war</packaging>');
    expect(pom).toContain('maven-war-plugin');
    expect(pom).not.toContain('maven-jar-plugin');
  });

  it('adds annotation processor paths for Lombok', async () => {
    const pom = text(await generateMaven(config({ dependencies: ['lombok'] })), 'pom.xml');
    expect(pom).toContain('<annotationProcessorPaths>');
    expect(pom).toContain('org.projectlombok:lombok'.split(':')[1]);
  });

  it('wires the Kotlin plugin for Kotlin sources', async () => {
    const files = await generateMaven(config({ language: 'kotlin' }));
    const pom = text(files, 'pom.xml');
    expect(pom).toContain('kotlin-maven-plugin');
    expect(pom).toContain('<kotlin.version>');
    expect(listFiles(files)).toContain('src/main/kotlin/com/example/demo/DemoApplication.kt');
    expect(text(files, 'src/main/kotlin/com/example/demo/DemoApplication.kt')).toContain('fun main()');
  });

  it('wires the Groovy plugin for Groovy sources', async () => {
    const files = await generateMaven(config({ language: 'groovy' }));
    expect(text(files, 'pom.xml')).toContain('gmavenplus-plugin');
    expect(listFiles(files)).toContain('src/main/groovy/com/example/demo/DemoApplication.groovy');
  });

  it('pins a JUnit version matching the Java target', async () => {
    const modern = text(await generateMaven(config({ javaVersion: '21' })), 'pom.xml');
    expect(modern).toContain('<artifactId>junit-jupiter</artifactId>');
    expect(modern).toMatch(/<artifactId>junit-jupiter<\/artifactId>\s*<version>6\./);
  });

  it('generates a runnable main class and a matching test', async () => {
    const files = await generateMaven(config());
    const main = text(files, 'src/main/java/com/example/demo/DemoApplication.java');
    const test = text(files, 'src/test/java/com/example/demo/DemoApplicationTest.java');
    expect(main).toContain('package com.example.demo;');
    expect(main).toContain('public static void main(String[] args)');
    expect(test).toContain('class DemoApplicationTest');
    expect(test).toContain('DemoApplication.greeting()');
  });
});

describe('generateMaven (multi module)', () => {
  const multi = config({ multiModule: true, modules: ['core', 'web'] });

  it('creates an aggregator POM listing the modules', async () => {
    const pom = text(await generateMaven(multi), 'pom.xml');
    expect(pom).toContain('<packaging>pom</packaging>');
    expect(pom).toContain('<module>core</module>');
    expect(pom).toContain('<module>web</module>');
  });

  it('creates a child POM per module inheriting the parent', async () => {
    const files = await generateMaven(multi);
    const corePom = text(files, 'core/pom.xml');
    expect(corePom).toContain('<artifactId>demo</artifactId>');
    expect(corePom).toContain('<relativePath>../pom.xml</relativePath>');
    expect(corePom).toContain('<artifactId>core</artifactId>');
  });

  it('places sources under each module', async () => {
    const paths = listFiles(await generateMaven(multi));
    expect(paths).toContain('core/src/main/java/com/example/demo/core/CoreApplication.java');
    expect(paths).toContain('web/src/main/java/com/example/demo/web/WebApplication.java');
  });
});

describe('generateGradle', () => {
  it('emits Groovy DSL files by default', async () => {
    const files = await generateGradle(config({ kind: 'gradle', buildTool: 'gradle' }));
    const paths = listFiles(files);
    expect(paths).toContain('build.gradle');
    expect(paths).toContain('settings.gradle');
    expect(paths).toContain('gradle.properties');
    expect(paths).not.toContain('build.gradle.kts');
  });

  it('emits Kotlin DSL files when requested', async () => {
    const files = await generateGradle(config({ kind: 'gradle', buildTool: 'gradle', dsl: 'kotlin' }));
    const paths = listFiles(files);
    expect(paths).toContain('build.gradle.kts');
    expect(paths).toContain('settings.gradle.kts');
    expect(text(files, 'settings.gradle.kts')).toContain('rootProject.name = "demo"');
  });

  it('applies the java plugin and an application main class', async () => {
    const build = text(
      await generateGradle(config({ kind: 'gradle', buildTool: 'gradle' })),
      'build.gradle',
    );
    expect(build).toContain("id 'java'");
    expect(build).toContain("id 'application'");
    expect(build).toContain("mainClass = 'com.example.demo.DemoApplication'");
    expect(build).toContain('options.release = 21');
  });

  it('gives every dependency an explicit version', async () => {
    const build = text(
      await generateGradle(config({ kind: 'gradle', buildTool: 'gradle', dependencies: ['junit5', 'guava'] })),
      'build.gradle',
    );
    const depLines = build
      .split('\n')
      .filter((line) => /^\s+(implementation|testImplementation|compileOnly|runtimeOnly)\s/.test(line));
    expect(depLines.length).toBeGreaterThanOrEqual(2);
    for (const line of depLines) {
      // Coordinates must be "group:artifact:version" — Gradle has no BOM here.
      const coord = line.match(/'([^']+)'/)?.[1] ?? '';
      expect(coord.split(':').length, `no version in: ${line}`).toBe(3);
    }
  });

  it('applies the kotlin plugin and stdlib for Kotlin', async () => {
    const build = text(
      await generateGradle(config({ kind: 'gradle', buildTool: 'gradle', language: 'kotlin' })),
      'build.gradle',
    );
    expect(build).toContain("id 'org.jetbrains.kotlin.jvm'");
    expect(build).toContain('kotlin-stdlib');
    expect(build).toContain('jvmTarget = JvmTarget.JVM_21');
  });

  it('uses the war plugin instead of application for war packaging', async () => {
    const build = text(
      await generateGradle(config({ kind: 'gradle', buildTool: 'gradle', packaging: 'war' })),
      'build.gradle',
    );
    expect(build).toContain("id 'war'");
    expect(build).not.toContain("id 'application'");
  });

  it('writes a multi-module aggregator with includes', async () => {
    const files = await generateGradle(
      config({ kind: 'gradle', buildTool: 'gradle', multiModule: true, modules: ['core', 'web'] }),
    );
    expect(text(files, 'settings.gradle')).toContain("include 'core'");
    expect(text(files, 'build.gradle')).toContain('subprojects {');
    expect(listFiles(files)).toContain('core/build.gradle');
  });

  it('uses Kotlin DSL syntax when the DSL is kotlin', async () => {
    const build = text(
      await generateGradle(
        config({ kind: 'gradle', buildTool: 'gradle', dsl: 'kotlin', dependencies: ['guava'] }),
      ),
      'build.gradle.kts',
    );
    expect(build).toContain('implementation("com.google.guava:guava:');
    expect(build).toContain('options.release.set(21)');
  });
});

describe('language build wiring (regression guards)', () => {
  it('gives Groovy Maven builds an explicit version and bytecode target', async () => {
    const pom = text(await generateMaven(config({ language: 'groovy' })), 'pom.xml');
    // Maven rejects a versionless dependency without a parent POM.
    expect(pom).toMatch(/<artifactId>groovy<\/artifactId>\s*<version>/);
    // Groovy 5 refuses to target the 1.8 bytecode it defaults to.
    expect(pom).toContain('<targetBytecode>21</targetBytecode>');
  });

  it('gives Groovy Gradle builds a Groovy runtime on the compile classpath', async () => {
    const build = text(
      await generateGradle(config({ kind: 'gradle', buildTool: 'gradle', language: 'groovy' })),
      'build.gradle',
    );
    expect(build).toMatch(/implementation 'org\.apache\.groovy:groovy:/);
  });

  it('aligns the Java and Kotlin JVM targets so Gradle validation passes', async () => {
    for (const dsl of ['groovy', 'kotlin'] as const) {
      const files = await generateGradle(
        config({ kind: 'gradle', buildTool: 'gradle', dsl, language: 'kotlin' }),
      );
      const build = text(files, dsl === 'kotlin' ? 'build.gradle.kts' : 'build.gradle');
      // compileJava must be pinned too, otherwise it inherits the running JDK.
      expect(build).toContain('JavaCompile');
      expect(build).toContain('21');
      expect(build).toContain('JvmTarget.JVM_21');
    }
  });

  it('declares the kotlin stdlib with a version for Maven', async () => {
    const pom = text(await generateMaven(config({ language: 'kotlin' })), 'pom.xml');
    expect(pom).toMatch(/<artifactId>kotlin-stdlib<\/artifactId>\s*<version>/);
  });
});
