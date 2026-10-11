/**
 * Filesystem helpers used by the generators.
 *
 * Everything goes through `node:fs/promises`; there is no dependency on a
 * templating engine so generated projects are byte-for-byte predictable.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Recursively create a directory (like `mkdir -p`). */
export async function mkdirp(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Test whether a path exists. */
export async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Test whether a path exists and is a directory. */
export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Test whether a path exists and is a regular file. */
export async function isFile(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isFile();
  } catch {
    return false;
  }
}

/** Return the directory entries, or `[]` when the directory is absent. */
export async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** True when the path is absent or an empty directory. */
export async function isEmptyDir(dir: string): Promise<boolean> {
  if (!(await exists(dir))) return true;
  if (!(await isDirectory(dir))) return false;
  return (await fs.readdir(dir)).length === 0;
}

/** Create a directory and write a UTF-8 file into it. */
export async function writeFile(
  file: string,
  content: string,
  options: { executable?: boolean } = {},
): Promise<void> {
  await mkdirp(path.dirname(file));
  await fs.writeFile(file, content, 'utf8');
  if (options.executable) await fs.chmod(file, 0o755);
}

/** Read a UTF-8 file, returning `undefined` when it does not exist. */
export async function readFileSafe(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Remove a file or directory tree, ignoring a missing target. */
export async function remove(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
}

/** Recursively list every file below `dir`, as paths relative to `dir`. */
export async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        out.push(path.relative(dir, absolute));
      }
    }
  }
  if (await isDirectory(dir)) await visit(dir);
  return out.sort();
}

/** SHA-256 digest of a string, used to detect generated-file drift. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Write a file only when its content differs, returning whether it changed. */
export async function writeFileIfChanged(
  file: string,
  content: string,
): Promise<boolean> {
  const current = await readFileSafe(file);
  if (current === content) return false;
  await writeFile(file, content);
  return true;
}
