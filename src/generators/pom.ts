/**
 * `pom.xml` generation.
 *
 * The emitted POM is deliberately explicit — plugin versions are pinned rather
 * than inherited from a parent, so a generated project builds identically on
 * any machine without surprise plugin upgrades.
 */

import { escapeXml } from '../util/naming.js';
import { junitFor, VERSIONS } from '../versions.js';
import type { Dependency, ProjectConfig } from '../types.js';
import { hasDependency } from '../catalog.js';

/** Inputs for {@link renderPom}. */
export interface PomOptions {
  config: ProjectConfig;
  dependencies: Dependency[];
  /** Coordinates of the parent POM, for a multi-module child. */
  parent?: { groupId: string; artifactId: string; version: string };
  /** Module directory names, for an aggregator POM. */
  modules?: string[];
  /** Fully qualified name of the entry point class. */
  mainClass?: string;
}

const indent = (level: number): string => '  '.repeat(level);

function dependenciesXml(deps: Dependency[], level: number): string {
  const pad = indent(level);
  return deps
    .map((dep) => {
      const lines = [
        `${pad}<dependency>`,
        `${pad}  <groupId>${escapeXml(dep.groupId)}</groupId>`,
        `${pad}  <artifactId>${escapeXml(dep.artifactId)}</artifactId>`,
      ];
      if (dep.version) lines.push(`${pad}  <version>${escapeXml(dep.version)}</version>`);
      if (dep.scope) lines.push(`${pad}  <scope>${dep.scope}</scope>`);
      lines.push(`${pad}</dependency>`);
      return lines.join('\n');
    })
    .join('\n');
}

/**
 * Build the `maven-compiler-plugin` block.
 *
 * Lombok and MapStruct both run as annotation processors, so they are added to
 * the processor path when selected. MapStruct additionally needs its processor
 * artifact, which is a separate coordinate from the runtime library.
 */
function compilerPluginXml(options: PomOptions, level: number): string {
  const { config, dependencies } = options;
  const pad = indent(level);
  const processors: string[] = [];
  if (hasDependency(dependencies, 'lombok')) {
    processors.push(`org.projectlombok:lombok:${VERSIONS.lombok}`);
  }
  if (hasDependency(dependencies, 'mapstruct')) {
    processors.push(`org.mapstruct:mapstruct-processor:${VERSIONS.mapstruct}`);
  }

  const lines = [
    `${pad}<plugin>`,
    `${pad}  <groupId>org.apache.maven.plugins</groupId>`,
    `${pad}  <artifactId>maven-compiler-plugin</artifactId>`,
    `${pad}  <version>${VERSIONS.mavenCompilerPlugin}</version>`,
    `${pad}  <configuration>`,
  ];

  if (config.language === 'kotlin') {
    // The Kotlin plugin drives compilation; javac only compiles Java sources.
    lines.push(`${pad}    <release>${escapeXml(config.javaVersion)}</release>`);
  } else {
    lines.push(`${pad}    <release>${escapeXml(config.javaVersion)}</release>`);
  }

  if (processors.length > 0) {
    lines.push(`${pad}    <annotationProcessorPaths>`);
    for (const processor of processors) {
      const [groupId, artifactId, version] = processor.split(':');
      lines.push(`${pad}      <path>`);
      lines.push(`${pad}        <groupId>${escapeXml(groupId ?? '')}</groupId>`);
      lines.push(`${pad}        <artifactId>${escapeXml(artifactId ?? '')}</artifactId>`);
      lines.push(`${pad}        <version>${escapeXml(version ?? '')}</version>`);
      lines.push(`${pad}      </path>`);
    }
    lines.push(`${pad}    </annotationProcessorPaths>`);
  }

  lines.push(`${pad}  </configuration>`);
  lines.push(`${pad}</plugin>`);
  return lines.join('\n');
}

/** Build the `kotlin-maven-plugin` block for Kotlin sources. */
function kotlinPluginXml(level: number): string {
  const pad = indent(level);
  return [
    `${pad}<plugin>`,
    `${pad}  <groupId>org.jetbrains.kotlin</groupId>`,
    `${pad}  <artifactId>kotlin-maven-plugin</artifactId>`,
    `${pad}  <version>\${kotlin.version}</version>`,
    `${pad}  <executions>`,
    `${pad}    <execution>`,
    `${pad}      <id>compile</id>`,
    `${pad}      <phase>process-sources</phase>`,
    `${pad}      <goals>`,
    `${pad}        <goal>compile</goal>`,
    `${pad}      </goals>`,
    `${pad}    </execution>`,
    `${pad}    <execution>`,
    `${pad}      <id>test-compile</id>`,
    `${pad}      <phase>process-test-sources</phase>`,
    `${pad}      <goals>`,
    `${pad}        <goal>test-compile</goal>`,
    `${pad}      </goals>`,
    `${pad}    </execution>`,
    `${pad}  </executions>`,
    `${pad}  <configuration>`,
    `${pad}    <jvmTarget>${'${java.version}'}</jvmTarget>`,
    `${pad}  </configuration>`,
    `${pad}</plugin>`,
  ].join('\n');
}

/** Build the `gmavenplus-plugin` block for Groovy sources. */
function groovyPluginXml(config: ProjectConfig, level: number): string {
  const pad = indent(level);
  // Groovy 5 refuses to compile to the 1.8 bytecode level it defaults to, so
  // the target must be stated explicitly.
  const bytecode = config.javaVersion === '8' ? '1.8' : config.javaVersion;
  return [
    `${pad}<plugin>`,
    `${pad}  <groupId>org.codehaus.gmavenplus</groupId>`,
    `${pad}  <artifactId>gmavenplus-plugin</artifactId>`,
    `${pad}  <version>${VERSIONS.gmavenplusPlugin}</version>`,
    `${pad}  <executions>`,
    `${pad}    <execution>`,
    `${pad}      <goals>`,
    `${pad}        <goal>compile</goal>`,
    `${pad}        <goal>compileTests</goal>`,
    `${pad}      </goals>`,
    `${pad}    </execution>`,
    `${pad}  </executions>`,
    `${pad}  <configuration>`,
    `${pad}    <targetBytecode>${escapeXml(bytecode)}</targetBytecode>`,
    `${pad}  </configuration>`,
    `${pad}</plugin>`,
  ].join('\n');
}

/** Build the `maven-surefire-plugin` block, aligned with the JUnit generation. */
function surefirePluginXml(config: ProjectConfig, level: number): string {
  const pad = indent(level);
  const junit = junitFor(config.javaVersion);
  const lines = [
    `${pad}<plugin>`,
    `${pad}  <groupId>org.apache.maven.plugins</groupId>`,
    `${pad}  <artifactId>maven-surefire-plugin</artifactId>`,
    `${pad}  <version>${VERSIONS.mavenSurefirePlugin}</version>`,
  ];
  if (junit.major === 6) {
    // Surefire picks the JUnit Platform provider from the test classpath; the
    // launcher must be present for JUnit 6.
    lines.push(`${pad}  <dependencies>`);
    lines.push(`${pad}    <dependency>`);
    lines.push(`${pad}      <groupId>org.junit.platform</groupId>`);
    lines.push(`${pad}      <artifactId>junit-platform-launcher</artifactId>`);
    lines.push(`${pad}      <version>${junit.launcher}</version>`);
    lines.push(`${pad}    </dependency>`);
    lines.push(`${pad}  </dependencies>`);
  }
  lines.push(`${pad}</plugin>`);
  return lines.join('\n');
}

/** Build the `maven-jar-plugin` block that records the main class. */
function jarPluginXml(mainClass: string, level: number): string {
  const pad = indent(level);
  return [
    `${pad}<plugin>`,
    `${pad}  <groupId>org.apache.maven.plugins</groupId>`,
    `${pad}  <artifactId>maven-jar-plugin</artifactId>`,
    `${pad}  <version>${VERSIONS.mavenJarPlugin}</version>`,
    `${pad}  <configuration>`,
    `${pad}    <archive>`,
    `${pad}      <manifest>`,
    `${pad}        <mainClass>${escapeXml(mainClass)}</mainClass>`,
    `${pad}      </manifest>`,
    `${pad}    </archive>`,
    `${pad}  </configuration>`,
    `${pad}</plugin>`,
  ].join('\n');
}

/** Build the `maven-shade-plugin` block producing a self-contained jar. */
function shadePluginXml(mainClass: string, level: number): string {
  const pad = indent(level);
  return [
    `${pad}<plugin>`,
    `${pad}  <groupId>org.apache.maven.plugins</groupId>`,
    `${pad}  <artifactId>maven-shade-plugin</artifactId>`,
    `${pad}  <version>${VERSIONS.mavenShadePlugin}</version>`,
    `${pad}  <executions>`,
    `${pad}    <execution>`,
    `${pad}      <phase>package</phase>`,
    `${pad}      <goals>`,
    `${pad}        <goal>shade</goal>`,
    `${pad}      </goals>`,
    `${pad}      <configuration>`,
    `${pad}        <createDependencyReducedPom>false</createDependencyReducedPom>`,
    `${pad}        <transformers>`,
    `${pad}          <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">`,
    `${pad}            <mainClass>${escapeXml(mainClass)}</mainClass>`,
    `${pad}          </transformer>`,
    `${pad}        </transformers>`,
    `${pad}      </configuration>`,
    `${pad}    </execution>`,
    `${pad}  </executions>`,
    `${pad}</plugin>`,
  ].join('\n');
}

/** Build the `maven-war-plugin` block. */
function warPluginXml(level: number): string {
  const pad = indent(level);
  return [
    `${pad}<plugin>`,
    `${pad}  <groupId>org.apache.maven.plugins</groupId>`,
    `${pad}  <artifactId>maven-war-plugin</artifactId>`,
    `${pad}  <version>${VERSIONS.mavenWarPlugin}</version>`,
    `${pad}  <configuration>`,
    `${pad}    <failOnMissingWebXml>false</failOnMissingWebXml>`,
    `${pad}  </configuration>`,
    `${pad}</plugin>`,
  ].join('\n');
}

/** Render a complete `pom.xml`. */
export function renderPom(options: PomOptions): string {
  const { config, dependencies, parent, modules, mainClass } = options;

  const properties: [string, string][] = [
    ['project.build.sourceEncoding', 'UTF-8'],
    ['project.reporting.outputEncoding', 'UTF-8'],
    ['java.version', config.javaVersion],
  ];
  if (config.language === 'kotlin') properties.push(['kotlin.version', config.kotlinVersion]);
  if (config.language === 'groovy') properties.push(['groovy.version', VERSIONS.groovy]);

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<project xmlns="http://maven.apache.org/POM/4.0.0"',
    '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">',
    '  <modelVersion>4.0.0</modelVersion>',
    '',
  ];

  if (parent) {
    // A child module inherits groupId and version from its parent, but must
    // still declare its own artifactId.
    lines.push('  <parent>');
    lines.push(`    <groupId>${escapeXml(parent.groupId)}</groupId>`);
    lines.push(`    <artifactId>${escapeXml(parent.artifactId)}</artifactId>`);
    lines.push(`    <version>${escapeXml(parent.version)}</version>`);
    lines.push('    <relativePath>../pom.xml</relativePath>');
    lines.push('  </parent>');
    lines.push('');
    lines.push(`  <artifactId>${escapeXml(config.artifactId)}</artifactId>`);
    lines.push('');
  } else {
    lines.push('  <groupId>' + escapeXml(config.groupId) + '</groupId>');
    lines.push('  <artifactId>' + escapeXml(config.artifactId) + '</artifactId>');
    lines.push('  <version>' + escapeXml(config.version) + '</version>');
    lines.push('');
  }

  if (config.description) {
    lines.push(`  <name>${escapeXml(config.name)}</name>`);
    lines.push(`  <description>${escapeXml(config.description)}</description>`);
    lines.push('');
  }

  lines.push(`  <packaging>${config.multiModule && !parent ? 'pom' : config.packaging}</packaging>`);
  lines.push('');

  if (modules && modules.length > 0) {
    lines.push('  <modules>');
    for (const module of modules) lines.push(`    <module>${escapeXml(module)}</module>`);
    lines.push('  </modules>');
    lines.push('');
  }

  lines.push('  <properties>');
  for (const [key, value] of properties) {
    lines.push(`    <${key}>${escapeXml(value)}</${key}>`);
  }
  lines.push('  </properties>');
  lines.push('');

  // An aggregator POM declares no dependencies of its own.
  const isAggregator = Boolean(modules && modules.length > 0);
  if (!isAggregator && dependencies.length > 0) {
    lines.push('  <dependencies>');
    lines.push(dependenciesXml(dependencies, 2));
    lines.push('  </dependencies>');
    lines.push('');
  }

  if (!isAggregator) {
    const plugins: string[] = [];
    if (config.language === 'kotlin') {
      plugins.push(compilerPluginXml(options, 4));
      plugins.push(kotlinPluginXml(4));
    } else if (config.language === 'groovy') {
      plugins.push(compilerPluginXml(options, 4));
      plugins.push(groovyPluginXml(config, 4));
    } else {
      plugins.push(compilerPluginXml(options, 4));
    }

    plugins.push(surefirePluginXml(config, 4));

    if (config.packaging === 'war') {
      plugins.push(warPluginXml(4));
    } else if (mainClass && config.shade) {
      plugins.push(shadePluginXml(mainClass, 4));
    } else if (mainClass) {
      plugins.push(jarPluginXml(mainClass, 4));
    }

    lines.push('  <build>');
    lines.push('    <plugins>');
    lines.push(plugins.join('\n'));
    lines.push('    </plugins>');
    lines.push('  </build>');
    lines.push('');
  } else {
    // Aggregators still pin plugin versions so modules inherit them.
    lines.push('  <build>');
    lines.push('    <pluginManagement>');
    lines.push('      <plugins>');
    lines.push(compilerPluginXml(options, 4));
    lines.push(surefirePluginXml(config, 4));
    lines.push('      </plugins>');
    lines.push('    </pluginManagement>');
    lines.push('  </build>');
    lines.push('');
  }

  lines.push('</project>');
  return `${lines.join('\n')}\n`;
}
