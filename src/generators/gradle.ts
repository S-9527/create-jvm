/**
 * Gradle build script generation for both the Groovy and Kotlin DSLs.
 *
 * The two DSLs produce structurally identical scripts — the same plugins, the
 * same blocks, in the same order — and differ only in syntax. Rather than
 * maintain two near-identical renderers, the structure is walked once and a
 * {@link GradleDialect} supplies the syntax-specific fragments. Fixing a bug in
 * the shared walk therefore fixes both DSLs at once.
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

/** Plugin to apply, with an optional version for the `plugins { }` block. */
interface PluginSpec {
  /** Plugin id, e.g. `java` or `org.jetbrains.kotlin.jvm`. */
  id: string;
  version?: string;
}

/** The syntax-specific pieces that differ between the Groovy and Kotlin DSLs. */
interface GradleDialect {
  /** Quote a string literal in this DSL. */
  quote(value: string): string;
  /** The `import` line needed for the Kotlin JVM target enum. */
  jvmTargetImport: string | null;
  /** Render one `plugins { }` entry. */
  pluginLine(plugin: PluginSpec): string;
  /** `apply plugin: 'java'` vs `apply(plugin = "java")`. */
  applyJava: string;
  /** The full `withType(...)` receiver for a task type. */
  withType(taskType: string): string;
  /** Setting a `release` value on the compile options, at the given indent. */
  setRelease(version: string, indent: string): string;
  /** `options.encoding = 'UTF-8'` in this DSL, at the given indent. */
  setEncoding(indent: string): string;
  /** A dependency declaration line. */
  dependencyLine(dep: Dependency): string;
  /** A `testRuntimeOnly` declaration line. */
  testRuntimeOnly(coordinate: string): string;
  /** The Kotlin compiler options block. */
  kotlinJvmTargetBlock(javaVersion: string): string;
  /** The `application { mainClass = ... }` block. */
  applicationBlock(mainClass: string): string;
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

/** `groupId:artifactId[:version]` for a dependency. */
function coordinate(dep: Dependency): string {
  return dep.version
    ? `${dep.groupId}:${dep.artifactId}:${dep.version}`
    : `${dep.groupId}:${dep.artifactId}`;
}

const GROOVY: GradleDialect = {
  quote: (value) => `'${escapeGroovy(value)}'`,
  jvmTargetImport: `import org.jetbrains.kotlin.gradle.dsl.JvmTarget`,
  pluginLine: (plugin) =>
    plugin.version ? `    id '${plugin.id}' version '${plugin.version}'` : `    id '${plugin.id}'`,
  applyJava: `    apply plugin: 'java'`,
  withType: (taskType) => `withType(${taskType})`,
  setRelease: (version, indent) => `${indent}options.release = ${version}`,
  setEncoding: (indent) => `${indent}options.encoding = 'UTF-8'`,
  dependencyLine: (dep) => `    ${gradleConfiguration(dep)} '${escapeGroovy(coordinate(dep))}'`,
  testRuntimeOnly: (coord) => `    testRuntimeOnly '${escapeGroovy(coord)}'`,
  kotlinJvmTargetBlock: (javaVersion) => `kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.${kotlinJvmTarget(javaVersion)}
    }
}`,
  applicationBlock: (mainClass) => `application {
    mainClass = '${escapeGroovy(mainClass)}'
}`,
};

const KOTLIN_DSL: GradleDialect = {
  quote: (value) => `"${escapeKotlin(value)}"`,
  jvmTargetImport: `import org.jetbrains.kotlin.gradle.dsl.JvmTarget`,
  pluginLine: (plugin) => {
    if (plugin.id.startsWith('org.jetbrains.kotlin')) {
      // Kotlin plugins use the `kotlin("jvm")` accessor form.
      const short = plugin.id.replace('org.jetbrains.kotlin.', '');
      return `    kotlin("${short}") version "${plugin.version}"`;
    }
    if (plugin.version) return `    id("${plugin.id}") version "${plugin.version}"`;
    // Core plugins must be backtick-escaped in the Kotlin DSL.
    return `    \`${plugin.id}\``;
  },
  applyJava: `    apply(plugin = "java")`,
  withType: (taskType) => `withType<${taskType}>()`,
  setRelease: (version, indent) => `${indent}options.release.set(${version})`,
  setEncoding: (indent) => `${indent}options.encoding = "UTF-8"`,
  dependencyLine: (dep) =>
    `    ${gradleConfiguration(dep)}("${escapeKotlin(coordinate(dep))}")`,
  testRuntimeOnly: (coord) => `    testRuntimeOnly("${escapeKotlin(coord)}")`,
  kotlinJvmTargetBlock: (javaVersion) => `kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.${kotlinJvmTarget(javaVersion)}
    }
}`,
  applicationBlock: (mainClass) => `application {
    mainClass = "${escapeKotlin(mainClass)}"
}`,
};

/** `settings.gradle` / `settings.gradle.kts` contents. */
export function renderSettings(options: GradleOptions): string {
  const { config, modules } = options;
  const dialect = config.dsl === 'kotlin' ? KOTLIN_DSL : GROOVY;
  const lines = [`rootProject.name = ${dialect.quote(config.artifactId)}`];
  if (modules && modules.length > 0) {
    lines.push('');
    for (const module of modules) {
      lines.push(
        config.dsl === 'kotlin'
          ? `include("${escapeKotlin(module)}")`
          : `include '${escapeGroovy(module)}'`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
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
    if (config.packaging === 'war') plugins.push({ id: 'war' });
    else if (mainClass) plugins.push({ id: 'application' });
  }

  return plugins;
}

/** Render the `plugins { }` block, or `[]` when there are no plugins. */
function pluginBlock(plugins: PluginSpec[], dialect: GradleDialect): string[] {
  if (plugins.length === 0) return [];
  return ['plugins {', ...plugins.map((p) => dialect.pluginLine(p)), '}'];
}

/** The `allprojects { }` block of a multi-module aggregator. */
function allProjectsBlock(config: ProjectConfig, dialect: GradleDialect): string {
  return `allprojects {
    group = ${dialect.quote(config.groupId)}
    version = ${dialect.quote(config.version)}

    repositories {
        mavenCentral()
    }
}`;
}

/** The `subprojects { }` block of a multi-module aggregator. */
function subProjectsBlock(config: ProjectConfig, dialect: GradleDialect): string {
  return [
    'subprojects {',
    dialect.applyJava,
    '',
    '    java {',
    '        withSourcesJar()',
    '    }',
    '',
    `    tasks.${dialect.withType('JavaCompile')}.configureEach {`,
    dialect.setRelease(config.javaVersion, '        '),
    dialect.setEncoding('        '),
    '    }',
    '',
    `    tasks.${dialect.withType('Test')}.configureEach {`,
    '        useJUnitPlatform()',
    '    }',
    '}',
  ].join('\n');
}

/** The `group` / `version` / `repositories` preamble of a build script. */
function preamble(config: ProjectConfig, dialect: GradleDialect): string {
  return `group = ${dialect.quote(config.groupId)}
version = ${dialect.quote(config.version)}

repositories {
    mavenCentral()
}`;
}

/**
 * The compile-target block.
 *
 * For Kotlin both compilers must agree on the target: Gradle validates that the
 * Java and Kotlin tasks produce the same bytecode level. Setting only the Kotlin
 * `jvmTarget` would leave `compileJava` on the running JDK's default and fail
 * the build with "Inconsistent JVM Target Compatibility".
 */
function compileTargetBlock(config: ProjectConfig, dialect: GradleDialect): string {
  const javaCompile = `tasks.${dialect.withType('JavaCompile')}.configureEach {
${dialect.setRelease(config.javaVersion, '    ')}
${dialect.setEncoding('    ')}
}`;
  if (config.language !== 'kotlin') return javaCompile;
  return `${javaCompile}\n\n${dialect.kotlinJvmTargetBlock(config.javaVersion)}`;
}

/** The `dependencies { }` block, including the JUnit launcher when needed. */
function dependenciesBlock(
  config: ProjectConfig,
  dependencies: Dependency[],
  dialect: GradleDialect,
): string | undefined {
  if (dependencies.length === 0) return undefined;
  const junit = junitFor(config.javaVersion);
  const lines = ['dependencies {'];
  for (const dep of dependencies) lines.push(dialect.dependencyLine(dep));
  // Gradle's JUnit 6 support needs the platform launcher on the test runtime.
  if (junit.major === 6 && dependencies.some((d) => d.scope === 'test')) {
    lines.push(dialect.testRuntimeOnly(`org.junit.platform:junit-platform-launcher:${junit.launcher}`));
  }
  lines.push('}');
  return lines.join('\n');
}

/** The trailing `test { useJUnitPlatform() }` block. */
function testBlock(dialect: GradleDialect): string {
  return `tasks.${dialect.withType('Test')}.configureEach {
    useJUnitPlatform()
}`;
}

/** Render a build script in the given dialect. */
function renderBuildScriptFor(options: GradleOptions, dialect: GradleDialect): string {
  const { config, dependencies, modules, mainClass } = options;
  const isRootAggregator = Boolean(modules && modules.length > 0 && !options.isModule);
  const blocks: string[] = [];

  if (config.language === 'kotlin' && dialect.jvmTargetImport) {
    blocks.push(dialect.jvmTargetImport);
  }

  const plugins = pluginBlock(pluginsFor(options), dialect);
  if (plugins.length > 0) blocks.push(plugins.join('\n'));

  if (isRootAggregator) {
    // An aggregator carries no sources of its own; it only shares settings.
    blocks.push(allProjectsBlock(config, dialect));
    blocks.push(subProjectsBlock(config, dialect));
    return `${blocks.join('\n\n')}\n`;
  }

  blocks.push(preamble(config, dialect));
  blocks.push(compileTargetBlock(config, dialect));

  if (mainClass && config.packaging !== 'war') {
    blocks.push(dialect.applicationBlock(mainClass));
  }

  const deps = dependenciesBlock(config, dependencies, dialect);
  if (deps) blocks.push(deps);

  blocks.push(testBlock(dialect));
  return `${blocks.join('\n\n')}\n`;
}

/** Render a Groovy DSL `build.gradle`. */
export function renderBuildGradle(options: GradleOptions): string {
  return renderBuildScriptFor(options, GROOVY);
}

/** Render a Kotlin DSL `build.gradle.kts`. */
export function renderBuildGradleKts(options: GradleOptions): string {
  return renderBuildScriptFor(options, KOTLIN_DSL);
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
