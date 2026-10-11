/**
 * Plain Gradle project generation: single module and multi-module, in either
 * the Groovy or the Kotlin DSL.
 */

import { dedupeDependencies, hasDependency, resolveDependencies } from '../catalog.js';
import { deriveMainClassName } from '../util/naming.js';
import { addFile, type FileMap } from '../writer.js';
import type { Dependency, ProjectConfig } from '../types.js';
import { renderGitignore, renderReadme } from './common.js';
import {
  gradleConfiguration,
  renderBuildScript,
  renderGradleProperties,
  renderSettings,
  type GradleOptions,
} from './gradle.js';
import {
  mainClassFqn,
  mainSourcePath,
  renderBootConfig,
  renderLog4jConfig,
  renderLogbackConfig,
  renderMain,
  renderTest,
  testSourcePath,
  type SourceOptions,
} from './sources.js';
import { VERSIONS, junitFor } from '../versions.js';

const MAIN_ROOT = 'src/main';
const TEST_ROOT = 'src/test';

/** Dependencies implied by the language selection. */
function languageDependencies(config: ProjectConfig): Dependency[] {
  if (config.language === 'kotlin') {
    return [
      {
        id: 'kotlin-stdlib',
        name: 'Kotlin Standard Library',
        group: 'Languages',
        groupId: 'org.jetbrains.kotlin',
        artifactId: 'kotlin-stdlib',
        version: config.kotlinVersion,
      },
    ];
  }
  if (config.language === 'groovy') {
    // Gradle 9's `groovy` plugin no longer puts a Groovy runtime on the
    // compile classpath, so `compileGroovy` fails with "Cannot infer Groovy
    // class path" unless the dependency is declared explicitly.
    return [
      {
        id: 'groovy',
        name: 'Apache Groovy',
        group: 'Languages',
        groupId: 'org.apache.groovy',
        artifactId: 'groovy',
        version: VERSIONS.groovy,
      },
    ];
  }
  return [];
}

/** Test dependencies shared by every generated Gradle project. */
function testDependencies(config: ProjectConfig): Dependency[] {
  const junit = junitFor(config.javaVersion);
  const base: Dependency[] = [
    {
      id: 'junit5',
      name: 'JUnit',
      group: 'Testing',
      groupId: 'org.junit.jupiter',
      artifactId: 'junit-jupiter',
      // Gradle applies no dependency management, so the version is explicit.
      version: junit.jupiter,
      scope: 'test',
    },
  ];
  if (config.language === 'kotlin') {
    base.push({
      id: 'kotlin-test-junit5',
      name: 'Kotlin Test (JUnit 5)',
      group: 'Languages',
      groupId: 'org.jetbrains.kotlin',
      artifactId: 'kotlin-test-junit5',
      version: config.kotlinVersion,
      scope: 'test',
    });
  }
  return base;
}

/** Merge the language runtime, test stack and user selection without duplicates. */
function allDependencies(config: ProjectConfig, selected: Dependency[]): Dependency[] {
  return dedupeDependencies([...languageDependencies(config), ...testDependencies(config), ...selected]);
}

/** Source options for one module of a Gradle project. */
function sourceOptionsFor(
  config: ProjectConfig,
  packageName: string,
  mainClassName: string,
  prefix = '',
): SourceOptions {
  const base = prefix ? `${prefix}/` : '';
  return {
    config,
    packageName,
    mainClassName,
    sourceRoot: `${base}${MAIN_ROOT}`,
    testRoot: `${base}${TEST_ROOT}`,
  };
}

/** Generate a Gradle project, including a wrapper when it can be fetched. */
export async function generateGradle(config: ProjectConfig): Promise<FileMap> {
  const files: FileMap = new Map();
  const selected = resolveDependencies(config.dependencies);
  const mainClassName = deriveMainClassName(config.artifactId);
  const settingsOptions: GradleOptions = {
    config,
    dependencies: [],
    ...(config.multiModule && config.modules.length > 0 ? { modules: config.modules } : {}),
  };

  addFile(files, config.dsl === 'kotlin' ? 'settings.gradle.kts' : 'settings.gradle', renderSettings(settingsOptions));
  addFile(files, '.gitignore', renderGitignore('gradle'));
  addFile(files, 'README.md', renderReadme(config, 'gradle'));
  addFile(files, 'gradle.properties', renderGradleProperties());

  if (config.multiModule && config.modules.length > 0) {
    const rootOptions: GradleOptions = {
      config,
      dependencies: [],
      modules: config.modules,
    };
    const script = renderBuildScript(rootOptions);
    addFile(files, script.filename, script.content);

    for (const module of config.modules) {
      const packageName = `${config.packageName}.${module.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;
      const moduleMainClass = deriveMainClassName(module);
      const moduleMainFqn = mainClassFqn(packageName, moduleMainClass);
      const moduleOptions: GradleOptions = {
        config,
        dependencies: allDependencies(config, selected),
        isModule: true,
        ...(config.packaging === 'war' ? {} : { mainClass: moduleMainFqn }),
      };
      const moduleScript = renderBuildScript(moduleOptions);
      addFile(files, `${module}/${moduleScript.filename}`, moduleScript.content);

      const opts = sourceOptionsFor(config, packageName, moduleMainClass, module);
      addFile(files, mainSourcePath(opts), renderMain(opts));
      addFile(files, testSourcePath(opts), renderTest(opts));
      const moduleConfigFile = renderBootConfig(config);
      addFile(files, `${module}/src/main/resources/${moduleConfigFile.filename}`, moduleConfigFile.content);
    }
  } else {
    const mainFqn = mainClassFqn(config.packageName, mainClassName);
    const buildOptions: GradleOptions = {
      config,
      dependencies: allDependencies(config, selected),
      ...(config.packaging === 'war' ? {} : { mainClass: mainFqn }),
    };
    const script = renderBuildScript(buildOptions);
    addFile(files, script.filename, script.content);

    const opts = sourceOptionsFor(config, config.packageName, mainClassName);
    addFile(files, mainSourcePath(opts), renderMain(opts));
    addFile(files, testSourcePath(opts), renderTest(opts));
    const configFile = renderBootConfig(config);
  addFile(files, `src/main/resources/${configFile.filename}`, configFile.content);

    if (hasDependency(selected, 'logback')) {
      addFile(files, 'src/main/resources/logback.xml', renderLogbackConfig(config.packageName));
    }
    if (hasDependency(selected, 'log4j')) {
      addFile(files, 'src/main/resources/log4j2.xml', renderLog4jConfig(config.packageName));
    }
  }

  return files;
}

/** Configuration name Gradle uses for a catalog dependency. */
export { gradleConfiguration };
