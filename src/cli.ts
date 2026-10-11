#!/usr/bin/env node
/**
 * Executable shim.
 *
 * Kept separate from `index.ts` so the library can be imported by tests without
 * triggering a run, and so the shebang survives compilation.
 */

import process from 'node:process';
import { main } from './index.js';

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`create-jvm: ${message}`);
    process.exitCode = 1;
  });
