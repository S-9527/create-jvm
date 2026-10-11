/**
 * `create-jvm` entry point.
 *
 * Responsibilities are deliberately narrow: parse arguments, decide between the
 * wizard and a non-interactive run, build a {@link ProjectConfig}, and hand it
 * to {@link execute}. Everything else lives in its own module — flag parsing in
 * `args.ts`, flag-to-config translation in `config.ts`, presentation in
 * `reporters.ts`, and the run itself in `run.ts`.
 */

import path from 'node:path';
import process from 'node:process';
import { parseArgs } from './args.js';
import { configFromArgs, resolveTargetDir, VERSION } from './config.js';
import { helpText, usageText } from './help.js';
import { runWizard, persistenceWarnings } from './wizard.js';
import { execute } from './run.js';
import { isEmptyDir, exists } from './util/fsx.js';
import { humanReporter, jsonReporter, makeColors, readCliOptions } from './reporters.js';
import type { ProjectConfig } from './types.js';

/**
 * Decide whether to run the wizard.
 *
 * The wizard is the default experience, matching `pnpm create vite`: it runs
 * whenever the user is on a TTY and has not already pinned the decisions it
 * would ask about.
 */
function shouldRunWizard(argv: string[], noInput: boolean): boolean {
  if (noInput || !process.stdout.isTTY || !process.stdin.isTTY) return false;
  const { args } = parseArgs(argv);
  return (
    args.kind === undefined &&
    args.template === undefined &&
    args.dependencies === undefined &&
    args.bootDependencies === undefined &&
    args.multiModule !== true &&
    (args.modules === undefined || args.modules.length === 0)
  );
}

/** Warn about combinations that generate but fail at runtime. */
function reportConfigWarnings(config: ProjectConfig, reporter: ReturnType<typeof humanReporter>): void {
  if (config.kind !== 'springboot') return;
  // Initializr accepts a persistence starter without a driver, but the app then
  // fails at startup, so flag it before the user finds out the hard way.
  for (const warning of persistenceWarnings(config.bootDependencies)) {
    reporter.warn(warning);
  }
}

/** Print the "next steps" block after a successful generation. */
function printNextSteps(
  config: ProjectConfig,
  cwd: string,
  colors: ReturnType<typeof makeColors>,
): void {
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

  if (parsed.args.help) {
    console.log(helpText());
    return 0;
  }
  if (parsed.args.version_) {
    console.log(VERSION);
    return 0;
  }

  const cwd = process.cwd();

  try {
    const config = shouldRunWizard(argv, options.noInput)
      ? await runWizardOrExit(parsed.args)
      : configFromArgs(cwd, parsed);
    if (!config) return 1;

    // Guard against silently generating into a populated directory.
    if (!config.force && !config.dryRun) {
      if ((await exists(config.targetDir)) && !(await isEmptyDir(config.targetDir))) {
        humanReporter(colors, options.quiet).error(
          `${config.targetDir} is not empty — pass --force to overwrite it`,
        );
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
    reportConfigWarnings(config, reporter);

    const result = await execute(config, reporter);

    if (config.dryRun) {
      reporter.success(
        `dry run: ${result.files.length} files would be written to ${config.targetDir}`,
      );
      return 0;
    }

    if (config.install && result.buildSucceeded === false) {
      reporter.warn('the project was generated but the verification build failed');
      return 1;
    }

    if (!options.quiet) printNextSteps(config, cwd, colors);
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

/** Run the wizard, returning `undefined` when the user cancelled. */
async function runWizardOrExit(args: ReturnType<typeof parseArgs>['args']): Promise<ProjectConfig | undefined> {
  return runWizard({ args, cwd: process.cwd() });
}

export { configFromArgs, resolveTargetDir, VERSION };
