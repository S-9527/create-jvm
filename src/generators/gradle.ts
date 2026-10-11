/**
 * Gradle build script generation for both the Groovy and Kotlin DSLs.
 *
 * Java compilation targets are expressed with `options.release` and Kotlin's
 * `jvmTarget` rather than a Java toolchain. A toolchain would force Gradle to
 * provision a matching JDK, which fails offline; this way a generated project
 * builds with whatever JDK is installed, as long as it is at least as new as
 * the chosen target.
 */

import { escapeGroovy, escapeKotlin } from '../util/naming.js';
import { junitFor } from '../versions.js';
import type { Dependency, ProjectConfig } from '../types.js';

/** Inputs for the Gradle renderers. */
export interface GradleOptions {
  config: ProjectConfig;
  dependencies: Dependency[];
  /** Module directory names, for a multi-module build. */
  modules?: string[];
  /** Fully qualified main class, for the `application` plugin. */
  mainClass?: string;
  /** True for a child module build script. */
  isModule?: boolean;
}

/** Map a Java release to the matching Kotlin `JvmTarget` enum constant. */
export function kotlinJvmTarget(javaVersion: string): string {
  const normalised = javaVersion === '8' ? '1.8' : javaVersion;
  const known = [
    '1.8', '9', '10', '11', '12', '13', '14', '15', '16', '17',
    '18', '19', '20', '21', '22', '23', '24', '25',
  ];
  if (known.includes(normalised)) return `JVM_${normalised.replace('.', '_')}`;
  // Newer than any JvmTarget this Kotlin release knows about.
  return 'JVM_25';
}

/** Gradle configuration name for a dependency scope. */
export function gradleConfiguration(dep: Dependency): string {
  switch (dep.scope) {
    case 'test':
      return 'testImplementation';
    case 'provided':
      return 'compileOnly';
    case 'runtime':
      return 'runtimeOnly';
    default:
      return 'implementation';
  }
}

/** `settings.gradle` / `settings.gradle.kts` contents. */
export function renderSettings(options: GradleOptions): string {
  const { config, modules } = options;
  const name = config.artifactId;
  if (config.dsl === 'kotlin') {
    const lines = [`rootProject.name = "${escapeKotlin(name)}"`];
    if (modules && modules.length > 0) {
      lines.push('');
      for (const module of modules) {
        lines.push(`include("${escapeKotlin(module)}")`);
      }
    }
    return `${lines.join('\n')}\n`;
  }
  const lines = [`rootProject.name = '${escapeGroovy(name)}'`];
  if (modules && modules.length > 0) {
    lines.push('');
    for (const module of modules) {
      lines.push(`include '${escapeGroovy(module)}'`);
    }
  }
  return `${lines.join('\n')}\n`;
}

interface PluginSpec {
  /** Plugin id, e.g. `java` or `org.jetbrains.kotlin.jvm`. */
  id: string;
  version?: string;
}

/** The `plugins { }` block contents for a project. */
export function pluginsFor(options: GradleOptions): PluginSpec[] {
  const { config, modules, mainClass } = options;
  const isRootAggregator = Boolean(modules && modules.length > 0 && !options.isModule);
  const plugins: PluginSpec[] = [];

  if (!isRootAggregator) {
    switch (config.language) {
      case 'kotlin':
        plugins.push({ id: 'org.jetbrains.kotlin.jvm', version: config.kotlinVersion });
        break;
      case 'groovy':
        plugins.push({ id: 'groovy' });
        break;
      default:
        plugins.push({ id: 'java' });
        break;
    }
    if (config.language === 'java' || config.language === 'kotlin' || config.language === 'groovy') {
      if (config.packaging === 'war') plugins.push({ id: 'war' });
      if (mainClass && config.packaging !== 'war') plugins.push({ id: 'application' });
    }
  }

  return plugins;
}

function groovyPluginBlock(plugins: PluginSpec[], level: number): string[] {
  if (plugins.length === 0) return [];
  const pad = '  '.repeat(level);
  const lines = [`${pad}plugins {`];
  for (const plugin of plugins) {
    lines.push(
      plugin.version
        ? `${pad}    id '${plugin.id}' version '${plugin.version}'`
        : `${pad}    id '${plugin.id}'`,
    );
  }
  lines.push(`${pad}}`);
  return lines;
}

function kotlinPluginBlock(plugins: PluginSpec[], level: number): string[] {
  if (plugins.length === 0) return [];
  const pad = '  '.repeat(level);
  const lines = [`${pad}plugins {`];
  for (const plugin of plugins) {
    if (plugin.id.startsWith('org.jetbrains.kotlin')) {
      const short = plugin.id.replace('org.jetbrains.kotlin.', '');
      lines.push(`${pad}    kotlin("${short}") version "${plugin.version}"`);
    } else if (plugin.version) {
      lines.push(`${pad}    id("${plugin.id}") version "${plugin.version}"`);
    } else {
      lines.push(`${pad}    \`${plugin.id}\``);
    }
  }
  lines.push(`${pad}}`);
  return lines;
}

function groovyDependencyLine(dep: Dependency): string {
  const coord = dep.version
    ? `${dep.groupId}:${dep.artifactId}:${dep.version}`
    : `${dep.groupId}:${dep.artifactId}`;
  return `    ${gradleConfiguration(dep)} '${escapeGroovy(coord)}'`;
}

function kotlinDependencyLine(dep: Dependency): string {
  const coord = dep.version
    ? `${dep.groupId}:${dep.artifactId}:${dep.version}`
    : `${dep.groupId}:${dep.artifactId}`;
  return `    ${gradleConfiguration(dep)}("${escapeKotlin(coord)}")`;
}

/** Render a Groovy DSL `build.gradle`. */
export function renderBuildGradle(options: GradleOptions): string {
  const { config, dependencies, modules, mainClass } = options;
  const isRootAggregator = Boolean(modules && modules.length > 0 && !options.isModule);
  const junit = junitFor(config.javaVersion);
  const blocks: string[] = [];

  if (config.language === 'kotlin') {
    blocks.push(`import org.jetbrains.kotlin.gradle.dsl.JvmTarget`);
  }

  const plugins = pluginsFor(options);
  const pluginBlock = groovyPluginBlock(plugins, 0);
  if (pluginBlock.length > 0) blocks.push(pluginBlock.join('\n'));

  if (isRootAggregator) {
    // Aggregator: share coordinates and repositories with every module.
    blocks.push(`allprojects {
    group = '${escapeGroovy(config.groupId)}'
    version = '${escapeGroovy(config.version)}'

    repositories {
        mavenCentral()
    }
}`);

    const subLines = [
      'subprojects {',
      '    apply plugin: \'java\'',
      '',
      `    java {`,
      `        withSourcesJar()`,
      `    }`,
      '',
      '    tasks.withType(JavaCompile).configureEach {',
      `        options.release = ${config.javaVersion}`,
      '        options.encoding = \'UTF-8\'',
      '    }',
      '',
      '    tasks.withType(Test).configureEach {',
      '        useJUnitPlatform()',
      '    }',
      '}',
    ];
    blocks.push(subLines.join('\n'));
    return `${blocks.join('\n\n')}\n`;
  }

  blocks.push(`group = '${escapeGroovy(config.groupId)}'
version = '${escapeGroovy(config.version)}'

repositories {
    mavenCentral()
}`);

  if (config.language === 'kotlin') {
    // Both compilers must agree on the target: Gradle validates that the Java
    // and Kotlin tasks produce the same bytecode level. Setting only the Kotlin
    // `jvmTarget` would leave `compileJava` on the running JDK's default and
    // fail the build with "Inconsistent JVM Target Compatibility".
    blocks.push(`tasks.withType(JavaCompile).configureEach {
    options.release = ${config.javaVersion}
    options.encoding = 'UTF-8'
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.${kotlinJvmTarget(config.javaVersion)}
    }
}`);
  } else {
    blocks.push(`tasks.withType(JavaCompile).configureEach {
    options.release = ${config.javaVersion}
    options.encoding = 'UTF-8'
}`);
  }

  if (mainClass && config.packaging !== 'war') {
    blocks.push(`application {
    mainClass = '${escapeGroovy(mainClass)}'
}`);
  }

  if (dependencies.length > 0) {
    const lines = ['dependencies {'];
    for (const dep of dependencies) lines.push(groovyDependencyLine(dep));
    // The JUnit Platform launcher is required by Gradle's JUnit 6 support.
    if (junit.major === 6 && dependencies.some((d) => d.scope === 'test')) {
      lines.push(`    testRuntimeOnly 'org.junit.platform:junit-platform-launcher:${junit.launcher}'`);
    }
    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  blocks.push(`tasks.withType(Test).configureEach {
    useJUnitPlatform()
}`);

  return `${blocks.join('\n\n')}\n`;
}

/** Render a Kotlin DSL `build.gradle.kts`. */
export function renderBuildGradleKts(options: GradleOptions): string {
  const { config, dependencies, modules, mainClass } = options;
  const isRootAggregator = Boolean(modules && modules.length > 0 && !options.isModule);
  const junit = junitFor(config.javaVersion);
  const blocks: string[] = [];

  if (config.language === 'kotlin') {
    blocks.push(`import org.jetbrains.kotlin.gradle.dsl.JvmTarget`);
  }

  const plugins = pluginsFor(options);
  const pluginBlock = kotlinPluginBlock(plugins, 0);
  if (pluginBlock.length > 0) blocks.push(pluginBlock.join('\n'));

  if (isRootAggregator) {
    blocks.push(`allprojects {
    group = "${escapeKotlin(config.groupId)}"
    version = "${escapeKotlin(config.version)}"

    repositories {
        mavenCentral()
    }
}`);

    const subLines = [
      'subprojects {',
      '    apply(plugin = "java")',
      '',
      '    configure<JavaPluginExtension> {',
      '        withSourcesJar()',
      '    }',
      '',
      '    tasks.withType<JavaCompile>().configureEach {',
      `        options.release.set(${config.javaVersion})`,
      '        options.encoding = "UTF-8"',
      '    }',
      '',
      '    tasks.withType<Test>().configureEach {',
      '        useJUnitPlatform()',
      '    }',
      '}',
    ];
    blocks.push(subLines.join('\n'));
    return `${blocks.join('\n\n')}\n`;
  }

  blocks.push(`group = "${escapeKotlin(config.groupId)}"
version = "${escapeKotlin(config.version)}"

repositories {
    mavenCentral()
}`);

  if (config.language === 'kotlin') {
    // See the Groovy DSL renderer: the Java and Kotlin targets must match.
    blocks.push(`tasks.withType<JavaCompile>().configureEach {
    options.release.set(${config.javaVersion})
    options.encoding = "UTF-8"
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.${kotlinJvmTarget(config.javaVersion)}
    }
}`);
  } else {
    blocks.push(`tasks.withType<JavaCompile>().configureEach {
    options.release.set(${config.javaVersion})
    options.encoding = "UTF-8"
}`);
  }

  if (mainClass && config.packaging !== 'war') {
    blocks.push(`application {
    mainClass = "${escapeKotlin(mainClass)}"
}`);
  }

  if (dependencies.length > 0) {
    const lines = ['dependencies {'];
    for (const dep of dependencies) lines.push(kotlinDependencyLine(dep));
    if (junit.major === 6 && dependencies.some((d) => d.scope === 'test')) {
      lines.push(`    testRuntimeOnly("org.junit.platform:junit-platform-launcher:${junit.launcher}")`);
    }
    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  blocks.push(`tasks.withType<Test>().configureEach {
    useJUnitPlatform()
}`);

  return `${blocks.join('\n\n')}\n`;
}

/** Render a `build.gradle` or `build.gradle.kts` for the configured DSL. */
export function renderBuildScript(options: GradleOptions): { filename: string; content: string } {
  return options.config.dsl === 'kotlin'
    ? { filename: 'build.gradle.kts', content: renderBuildGradleKts(options) }
    : { filename: 'build.gradle', content: renderBuildGradle(options) };
}

/** Render a `gradle.properties` with sensible JVM settings. */
export function renderGradleProperties(): string {
  return `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.caching=true
`;
}

/** Contents of `gradle/wrapper/gradle-wrapper.properties`. */
export function renderWrapperProperties(gradleVersion: string): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

