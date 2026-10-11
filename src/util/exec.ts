/**
 * Minimal process helpers.
 *
 * `run` never throws on a non-zero exit status; callers decide whether a
 * failure is fatal. This keeps the "generate then optionally build" flow
 * simple: a failing build is reported, not thrown.
 */

import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Forward stdout/stderr to the parent terminal. */
  stdio?: 'inherit' | 'pipe';
  /** Kill the process after this many milliseconds. */
  timeoutMs?: number;
  /** Input written to stdin when `stdio` is `pipe`. */
  input?: string;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  /** True when the executable could not be spawned at all. */
  spawnFailed: boolean;
  /** Set when the process exceeded `timeoutMs`. */
  timedOut: boolean;
}

/**
 * Run a command to completion.
 *
 * A missing executable yields `{ code: null, spawnFailed: true }` rather than
 * an exception so callers can probe for optional tools such as `git`.
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const { cwd, env, stdio = 'pipe', timeoutMs, input } = options;

  return new Promise<RunResult>((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: env ?? process.env,
        stdio: stdio === 'inherit' ? 'inherit' : ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
    } catch {
      resolve({ code: null, signal: null, stdout: '', stderr: '', spawnFailed: true, timedOut: false });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, timeoutMs);

    if (stdio === 'pipe') {
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });
      if (input !== undefined) child.stdin?.end(input);
      else child.stdin?.end();
    }

    const finish = (result: RunResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    child.on('error', () => {
      finish({ code: null, signal: null, stdout, stderr, spawnFailed: true, timedOut });
    });
    child.on('close', (code, signal) => {
      finish({ code, signal, stdout, stderr, spawnFailed: false, timedOut });
    });
  });
}

/** Resolve the absolute path of a command, or `undefined` when absent. */
export async function which(command: string): Promise<string | undefined> {
  const result = await run(process.platform === 'win32' ? 'where' : 'which', [command], {
    timeoutMs: 10_000,
  });
  if (result.code !== 0) return undefined;
  const first = result.stdout.split('\n').map((l) => l.trim()).filter(Boolean)[0];
  return first || undefined;
}
