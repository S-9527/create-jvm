/**
 * Run orchestration: turn a {@link ProjectConfig} into files on disk, then
 * optionally initialise git and run a build.
 *
 * All progress reporting goes through the {@link Reporter} so the same flow can
 * emit human output or JSON.
 */

import { generateMaven } from './generators/maven.js';
import { generateGradle } from './generators/gradle-project.js';
import { fetchInitializrProject } from './generators/initializr.js';
import { fetchTemplate, restoreDotfiles } from './generators/remote.js';
import { addGradleWrapper } from './generators/wrapper.js';
import { addMavenWrapper } from './generators/maven-wrapper.js';
import { GRADLE_WRAPPER_VERSION } from './versions.js';
import { isDirectory, readdirSafe, remove } from './util/fsx.js';
import { run, which } from './util/exec.js';
import { contentLength, listFiles, materialize, type FileMap } from './writer.js';
import type { ProjectConfig } from './types.js';

export interface Reporter {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  /** Called once the file map is known and before anything is written. */
  files?(files: string[], config: ProjectConfig): void;
}

export interface RunResult {
  config: ProjectConfig;
  /** Relative paths that were written (or would have been, under --dry-run). */
  files: string[];
  dryRun: boolean;
  gitInitialised: boolean;
  buildRan: boolean;
  buildSucceeded?: boolean;
}

/** Build the file map for a configuration. */
export async function buildFileMap(config: ProjectConfig): Promise<FileMap> {
  switch (config.kind) {
    case 'springboot':
      return (await fetchInitializrProject(config)).files;
    case 'template': {
      if (!config.template) throw new Error('a template spec is required');
      const { files } = await fetchTemplate(config.template);
      return restoreDotfiles(files);
    }
    case 'gradle':
      return generateGradle(config);
    case 'maven':
    default:
      return generateMaven(config);
  }
}

/** Check the target directory and remove it when `--force` allows. */
async function prepareTarget(config: ProjectConfig, reporter: Reporter): Promise<void> {
  const { targetDir, force } = config;
  if (await isDirectory(targetDir)) {
    const entries = await readdirSafe(targetDir);
    if (entries.length > 0) {
      if (!force) {
        throw new Error(
          `${targetDir} already exists and is not empty — pass --force to overwrite it`,
        );
      }
      reporter.warn(`overwriting the existing directory ${targetDir}`);
      await remove(targetDir);
    }
  }
}

/** Initialise a git repository and stage everything. */
async function initGit(config: ProjectConfig, reporter: Reporter): Promise<boolean> {
  const git = await which('git');
  if (!git) {
    reporter.warn('git is not installed; skipping repository initialisation');
    return false;
  }

  const init = await run('git', ['init', '--quiet'], { cwd: config.targetDir, timeoutMs: 30_000 });
  if (init.spawnFailed || init.code !== 0) {
    reporter.warn(`git init failed: ${init.stderr.trim() || 'unknown error'}`);
    return false;
  }

  // `git add` is best effort: a missing identity should not fail generation.
  await run('git', ['add', '-A'], { cwd: config.targetDir, timeoutMs: 60_000 });

  const hasIdentity = await run('git', ['config', 'user.email'], {
    cwd: config.targetDir,
    timeoutMs: 15_000,
  });
  if (hasIdentity.code === 0 && hasIdentity.stdout.trim()) {
    const commit = await run('git', ['commit', '-m', 'Initial commit', '--quiet'], {
      cwd: config.targetDir,
      timeoutMs: 60_000,
    });
    if (commit.code !== 0) {
      reporter.warn('created the repository but could not create the initial commit');
    }
  } else {
    reporter.warn('git user.email is not configured; skipping the initial commit');
  }
  return true;
}

/** Command used to verify a generated project builds. */
export function buildCommand(config: ProjectConfig): { command: string; args: string[] } {
  if (config.buildTool === 'maven') {
    return { command: './mvnw', args: ['-q', '-B', 'package', '-DskipTests'] };
  }
  return { command: './gradlew', args: ['--quiet', 'build', '-x', 'test'] };
}

/** Run a post-generation build to verify the project. */
async function verifyBuild(config: ProjectConfig, reporter: Reporter): Promise<boolean> {
  const { command, args } = buildCommand(config);
  reporter.info(`running ${command} ${args.join(' ')}`);

  const result = await run(command, args, {
    cwd: config.targetDir,
    stdio: 'inherit',
    timeoutMs: 10 * 60 * 1000,
    // GRADLE_USER_HOME and the Maven repository are left at the user's
    // defaults: a generated project should behave exactly like a hand-written
    // one. Set them in the environment to redirect caches.
  });

  if (result.timedOut) {
    reporter.warn('the build timed out after 10 minutes');
    return false;
  }
  if (result.spawnFailed) {
    reporter.warn(`could not run ${command}; the project was still generated`);
    return false;
  }
  if (result.code !== 0) {
    reporter.warn(`the build exited with status ${result.code}`);
    return false;
  }
  return true;
}

/** Execute a full run. */
export async function execute(config: ProjectConfig, reporter: Reporter): Promise<RunResult> {
  const files = await buildFileMap(config);
  const paths = listFiles(files);

  // Build wrappers are fetched here rather than inside the generators, so that
  // a download failure is reported instead of being swallowed, and so the
  // generators stay pure (no network, no I/O).
  if (config.kind !== 'springboot' && config.kind !== 'template') {
    if (config.buildTool === 'maven') {
      const wrapper = await addMavenWrapper(files);
      if (!wrapper.ok && wrapper.message) reporter.warn(wrapper.message);
    } else if (!paths.includes('gradlew')) {
      const wrapper = await addGradleWrapper(files, GRADLE_WRAPPER_VERSION);
      if (wrapper.ok) {
        if (wrapper.message) reporter.warn(wrapper.message);
      } else if (wrapper.message) {
        reporter.warn(wrapper.message);
      }
    }
  }

  reporter.files?.(listFiles(files), config);

  if (config.dryRun) {
    return {
      config,
      files: listFiles(files),
      dryRun: true,
      gitInitialised: false,
      buildRan: false,
    };
  }

  await prepareTarget(config, reporter);
  const written = await materialize(config.targetDir, files);
  reporter.success(`created ${written.length} files in ${config.targetDir}`);

  const totalBytes = [...files.values()].reduce((sum, content) => sum + contentLength(content), 0);
  reporter.info(`generated ${(totalBytes / 1024).toFixed(1)} KiB`);

  let gitInitialised = false;
  if (config.git) gitInitialised = await initGit(config, reporter);

  let buildRan = false;
  let buildSucceeded: boolean | undefined;
  if (config.install) {
    buildRan = true;
    buildSucceeded = await verifyBuild(config, reporter);
  }

  return {
    config,
    files: written,
    dryRun: false,
    gitInitialised,
    buildRan,
    ...(buildSucceeded === undefined ? {} : { buildSucceeded }),
  };
}
