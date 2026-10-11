/**
 * Plain Maven project generation: single module and multi-module.
 */

import { hasDependency, resolveDependencies, dedupeDependencies } from '../catalog.js';
import { deriveMainClassName, packageToPath } from '../util/naming.js';
import { addFile, type FileMap } from '../writer.js';
import type { Dependency, ProjectConfig } from '../types.js';
import { junitFor, VERSIONS } from '../versions.js';
import { renderGitignore, renderMavenJvmConfig, renderReadme } from './common.js';
import { renderPom } from './pom.js';
import { addMavenWrapper } from './maven-wrapper.js';
import {
  mainClassFqn,
  mainSourcePath,
  renderApplicationProperties,
  renderLog4jConfig,
  renderLogbackConfig,
  renderMain,
  renderTest,
  testSourcePath,
  type SourceOptions,
} from './sources.js';

/** Source roots used by a Maven project. */
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
    return [
      {
        id: 'groovy',
        name: 'Apache Groovy',
        group: 'Languages',
        groupId: 'org.apache.groovy',
        artifactId: 'groovy',
        // Without a parent POM the version must be explicit.
        version: VERSIONS.groovy,
      },
    ];
  }
  return [];
}

/** Assemble the shared test dependencies. */
function testDependencies(config: ProjectConfig): Dependency[] {
  const junit = junitFor(config.javaVersion);
  const base: Dependency[] = [
    {
      id: 'junit5',
      name: 'JUnit',
      group: 'Testing',
      groupId: 'org.junit.jupiter',
      artifactId: 'junit-jupiter',
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

/**
 * Generate a Maven project.
 *
 * Multi-module projects get an aggregator POM plus one child module per entry in
 * `config.modules`; single-module projects get the source tree directly.
 */
export async function generateMaven(config: ProjectConfig): Promise<FileMap> {
  const files: FileMap = new Map();
  const selected = resolveDependencies(config.dependencies);
  const testDeps = testDependencies(config);
  const langDeps = languageDependencies(config);
  const mainClassName = deriveMainClassName(config.artifactId);

  const sourceOptions = (packageName: string): SourceOptions => ({
    config,
    packageName,
    mainClassName,
    sourceRoot: MAIN_ROOT,
    testRoot: TEST_ROOT,
  });

  if (config.multiModule && config.modules.length > 0) {
    const aggregatorDeps = dedupeDependencies([...langDeps, ...testDeps, ...selected]);
    addFile(
      files,
      'pom.xml',
      renderPom({
        config,
        dependencies: aggregatorDeps,
        modules: config.modules,
      }),
    );
    addFile(files, '.gitignore', renderGitignore('maven'));
    addFile(files, 'README.md', renderReadme(config, 'maven'));

    for (const module of config.modules) {
      const packageName = `${config.packageName}.${module.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`;
      const moduleConfig: ProjectConfig = { ...config, artifactId: module, packageName };
      const moduleDeps = dedupeDependencies([...langDeps, ...testDeps, ...selected]);
      const moduleMainClass = deriveMainClassName(module);
      const moduleMainFqn = mainClassFqn(packageName, moduleMainClass);

      addFile(
        files,
        `${module}/pom.xml`,
        renderPom({
          config: moduleConfig,
          dependencies: moduleDeps,
          parent: {
            groupId: config.groupId,
            artifactId: config.artifactId,
            version: config.version,
          },
          mainClass: config.packaging === 'war' ? undefined : moduleMainFqn,
        }),
      );

      const opts: SourceOptions = {
        config,
        packageName,
        mainClassName: moduleMainClass,
        sourceRoot: `${module}/${MAIN_ROOT}`,
        testRoot: `${module}/${TEST_ROOT}`,
      };
      addFile(files, mainSourcePath(opts), renderMain(opts));
      addFile(files, testSourcePath(opts), renderTest(opts));
      addFile(files, `${module}/src/main/resources/application.properties`, renderApplicationProperties(moduleConfig));
      addFile(files, `${module}/.gitignore`, renderGitignore('maven'));
    }

    await addMavenWrapper(files);
    return files;
  }

  const opts = sourceOptions(config.packageName);
  const mainFqn = mainClassFqn(config.packageName, mainClassName);
  const allDeps = dedupeDependencies([...langDeps, ...testDeps, ...selected]);

  addFile(
    files,
    'pom.xml',
    renderPom({
      config,
      dependencies: allDeps,
      ...(config.packaging === 'war' ? {} : { mainClass: mainFqn }),
    }),
  );
  addFile(files, '.gitignore', renderGitignore('maven'));
  addFile(files, 'README.md', renderReadme(config, 'maven'));
  addFile(files, '.mvn/jvm.config', renderMavenJvmConfig());
  addFile(files, mainSourcePath(opts), renderMain(opts));
  addFile(files, testSourcePath(opts), renderTest(opts));
  addFile(files, 'src/main/resources/application.properties', renderApplicationProperties(config));

  if (hasDependency(selected, 'logback')) {
    addFile(files, 'src/main/resources/logback.xml', renderLogbackConfig(config.packageName));
  }
  if (hasDependency(selected, 'log4j')) {
    addFile(files, 'src/main/resources/log4j2.xml', renderLog4jConfig(config.packageName));
  }

  await addMavenWrapper(files);
  return files;
}

/** The package directory path for the project, used by tests and callers. */
export function mavenPackageDir(packageName: string): string {
  return `${MAIN_ROOT}/java/${packageToPath(packageName)}`;
}
