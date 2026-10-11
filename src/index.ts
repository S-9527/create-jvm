/**
 * `create-jvm` entry point.
 *
 * Responsibilities are deliberately narrow: parse arguments, decide between the
 * wizard and a non-interactive run, build a {@link ProjectConfig}, and hand it
 * to {@link execute}. Everything else lives in its own module.
 */

import path from 'node:path';
import process from 'node:process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { applyDefaults, isNonInteractive, parseArgs } from './args.js';
import { helpText, usageText } from './help.js';
import { runWizard, persistenceWarnings } from './wizard.js';
import { execute, type Reporter } from './run.js';
import { isEmptyDir, exists } from './util/fsx.js';
import { resolveDependencies } from './catalog.js';
import { validateGroupId } from './util/naming.js';
import { DEFAULT_BOOT_VERSION, VERSIONS } from './versions.js';
import type { ProjectConfig } from './types.js';

/** Read the package version without importing JSON (keeps the bundle simple). */
const VERSION = '0.1.0';

/** Colours disabled when the terminal cannot handle them. */
function makeColors(noColor: boolean): typeof pc {
  if (noColor || !process.stdout.isTTY) {
    const identity = (s: string): string => s;
    return new Proxy(pc, {
      get: (target, prop) => {
        if (prop === 'createColors') return target.createColors.bind(target);
        return identity;
      },
    }) as typeof pc;
  }
  return pc;
}

interface CliOptions {
  json: boolean;
  noInput: boolean;
  noColor: boolean;
  quiet: boolean;
}

function readCliOptions(argv: string[]): CliOptions {
  return {
    json: argv.includes('--json'),
    noInput: isNonInteractive(argv),
    noColor: argv.includes('--no-color'),
    quiet: argv.includes('--quiet') || argv.includes('-q'),
  };
}

/** Human-readable reporter. */
function humanReporter(colors: typeof pc, quiet: boolean): Reporter {
  return {
    info: (message) => {
      if (!quiet) console.log(`${colors.dim('•')} ${message}`);
    },
    warn: (message) => console.log(`${colors.yellow('!')} ${message}`),
    error: (message) => console.error(`${colors.red('✖')} ${message}`),
    success: (message) => {
      if (!quiet) console.log(`${colors.green('✔')} ${message}`);
    },
    files: (files) => {
      if (quiet) return;
      for (const file of files) console.log(`  ${colors.dim('+')} ${file}`);
    },
  };
}

/** JSON reporter: emits a single document at the end. */
function jsonReporter(): { reporter: Reporter; flush: (payload: unknown) => void } {
  const events: { level: string; message: string }[] = [];
  let collectedFiles: string[] = [];
  const reporter: Reporter = {
    info: (message) => events.push({ level: 'info', message }),
    warn: (message) => events.push({ level: 'warn', message }),
    error: (message) => events.push({ level: 'error', message }),
    success: (message) => events.push({ level: 'success', message }),
    files: (files) => {
      collectedFiles = files;
    },
  };
  return {
    reporter,
    flush: (payload) => {
      console.log(JSON.stringify({ ...(payload as object), files: collectedFiles, events }, null, 2));
    },
  };
}

/**
 * Resolve the target directory for a project name.
 *
 * `.` means "generate into the current directory"; any other name becomes a
 * subdirectory of the working directory.
 */
function resolveTargetDir(cwd: string, name: string): string {
  if (name === '.') return cwd;
  return path.resolve(cwd, name);
}

/** Build a config directly from flags, without prompting. */
function configFromArgs(
  argv: string[],
  cwd: string,
  parsed: ReturnType<typeof parseArgs>,
): ProjectConfig {
  const { args } = parsed;
  const defaults = applyDefaults(args);
  const name = args.name ?? 'demo';
  const targetDir = resolveTargetDir(cwd, name);

  const kind =
    args.kind ??
    (args.template ? 'template' : args.buildTool === 'gradle' ? 'gradle' : 'maven');
  const buildTool = args.buildTool ?? (kind === 'gradle' ? 'gradle' : 'maven');

  // Validate eagerly so bad flags fail before any network or disk activity.
  if (args.groupId && !validateGroupId(args.groupId).ok) {
    throw new Error(`invalid --group-id "${args.groupId}"`);
  }
  const dependencies = args.dependencies ? resolveDependencies(args.dependencies) : [];

  return {
    kind,
    name,
    targetDir,
    buildTool,
    dsl: args.dsl ?? 'groovy',
    language: args.language ?? 'java',
    packaging: args.packaging ?? 'jar',
    configFormat: args.configFormat ?? 'properties',
    groupId: defaults.groupId,
    artifactId: defaults.artifactId,
    version: defaults.version,
    javaVersion: defaults.javaVersion,
    kotlinVersion: defaults.kotlinVersion,
    bootVersion: args.bootVersion ?? DEFAULT_BOOT_VERSION,
    packageName: defaults.packageName,
    description: defaults.description,
    dependencies: dependencies.map((d) => d.id),
    bootDependencies: args.bootDependencies ?? [],
    multiModule: args.multiModule ?? false,
    modules: args.modules ?? [],
    shade: false,
    ...(args.template ? { template: args.template } : {}),
    git: args.git ?? true,
    install: args.install ?? false,
    dryRun: args.dryRun ?? false,
    force: args.force ?? false,
  };
}

/** Main entry point. Returns the process exit code. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = readCliOptions(argv);
  const colors = makeColors(options.noColor);
  const parsed = parseArgs(argv);

  if (parsed.error) {
    console.error(`${colors.red('✖')} ${parsed.error}`);
    console.error(colors.dim(usageText()));
    return 2;
  }

  const { args } = parsed;
  if (args.help) {
    console.log(helpText());
    return 0;
  }
  if (args.version_) {
    console.log(VERSION);
    return 0;
  }

  const cwd = process.cwd();

  try {
    let config: ProjectConfig;

    // The wizard is the default experience, matching `pnpm create vite`: it
    // runs whenever the user is on a TTY and has not already pinned the
    // decisions it would ask about.
    const wizardBlockedBy =
      options.noInput ||
      !process.stdout.isTTY ||
      !process.stdin.isTTY ||
      args.kind !== undefined ||
      args.template !== undefined ||
      args.dependencies !== undefined ||
      args.bootDependencies !== undefined ||
      args.multiModule === true ||
      (args.modules !== undefined && args.modules.length > 0);

    if (!wizardBlockedBy) {
      const wizardResult = await runWizard({ args, cwd });
      if (!wizardResult) return 1;
      config = wizardResult;
    } else {
      config = configFromArgs(argv, cwd, parsed);
    }

    // Guard against silently generating into a populated directory.
    if (!config.force && !config.dryRun) {
      if ((await exists(config.targetDir)) && !(await isEmptyDir(config.targetDir))) {
        const reporter = humanReporter(colors, options.quiet);
        reporter.error(`${config.targetDir} is not empty — pass --force to overwrite it`);
        return 1;
      }
    }

    if (options.json) {
      const { reporter, flush } = jsonReporter();
      const result = await execute(config, reporter);
      flush({
        ok: true,
        project: {
          name: result.config.name,
          kind: result.config.kind,
          buildTool: result.config.buildTool,
          language: result.config.language,
          groupId: result.config.groupId,
          artifactId: result.config.artifactId,
          packageName: result.config.packageName,
          javaVersion: result.config.javaVersion,
          targetDir: result.config.targetDir,
        },
        dryRun: result.dryRun,
        gitInitialised: result.gitInitialised,
        buildRan: result.buildRan,
        ...(result.buildSucceeded === undefined ? {} : { buildSucceeded: result.buildSucceeded }),
      });
      return 0;
    }

    const reporter = humanReporter(colors, options.quiet);

    // Flag the confusing "persistence without a driver" combination that
    // Initializr itself accepts but that fails at application startup.
    if (config.kind === 'springboot') {
      for (const warning of persistenceWarnings(config.bootDependencies)) {
        reporter.warn(warning);
      }
    }

    if (config.dryRun) {
      const result = await execute(config, reporter);
      reporter.success(`dry run: ${result.files.length} files would be written to ${config.targetDir}`);
      return 0;
    }

    const result = await execute(config, reporter);

    if (config.install && result.buildSucceeded === false) {
      reporter.warn('the project was generated but the verification build failed');
      return 1;
    }

    if (!options.quiet) {
      console.log();
      console.log(`${colors.green('Done.')} Next steps:`);
      console.log(`  ${colors.cyan(`cd ${path.relative(cwd, config.targetDir) || '.'}`)}`);
      if (config.buildTool === 'maven') {
        console.log(`  ${colors.cyan('./mvnw package')}`);
        if (config.kind === 'springboot') console.log(`  ${colors.cyan('./mvnw spring-boot:run')}`);
      } else {
        console.log(`  ${colors.cyan('./gradlew build')}`);
        if (config.kind === 'springboot') console.log(`  ${colors.cyan('./gradlew bootRun')}`);
      }
      console.log();
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(`${colors.red('✖')} ${message}`);
    }
    return 1;
  }
}

/** Exported for tests: derive a full config from flags without side effects. */
export { configFromArgs, resolveTargetDir, VERSION, VERSIONS };
