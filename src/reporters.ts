/**
 * Presentation layer: colour handling, CLI flags that affect output, and the
 * two reporters.
 *
 * Kept apart from the entry point so `index.ts` reads as control flow rather
 * than a mix of orchestration and console formatting.
 */

import process from 'node:process';
import pc from 'picocolors';
import { isNonInteractive } from './args.js';
import type { Reporter } from './run.js';

/** Flags that change how output is presented rather than what is generated. */
export interface CliOptions {
  /** Emit a single machine-readable document instead of human output. */
  json: boolean;
  /** Never prompt; fail when required input is missing. */
  noInput: boolean;
  /** Disable coloured output. */
  noColor: boolean;
  /** Only report warnings and errors. */
  quiet: boolean;
}

/** Read the output-related flags from `argv`. */
export function readCliOptions(argv: string[]): CliOptions {
  return {
    json: argv.includes('--json'),
    noInput: isNonInteractive(argv),
    noColor: argv.includes('--no-color'),
    quiet: argv.includes('--quiet') || argv.includes('-q'),
  };
}

/**
 * Colours disabled when the terminal cannot handle them.
 *
 * Returning an identity function for every colour keeps the reporter code free
 * of `if (noColor)` branches.
 */
export function makeColors(noColor: boolean): typeof pc {
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

/** Reporter that writes human-readable progress to the console. */
export function humanReporter(colors: typeof pc, quiet: boolean): Reporter {
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

/**
 * Reporter that buffers everything and emits one JSON document at the end.
 *
 * A machine consumer gets a single parseable object rather than interleaved
 * progress lines.
 */
export function jsonReporter(): { reporter: Reporter; flush: (payload: unknown) => void } {
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
      console.log(
        JSON.stringify({ ...(payload as object), files: collectedFiles, events }, null, 2),
      );
    },
  };
}
