/**
 * Collecting generated files in memory and writing them to disk.
 *
 * Generators never touch the filesystem directly. They return a {@link FileMap}
 * which the writer materialises, which keeps generation pure and testable and
 * makes `--dry-run` a matter of simply not calling the writer.
 *
 * Values may be strings or Buffers: wrapper jars and files extracted from
 * Initializr archives are binary.
 */

import path from 'node:path';
import { mkdirp } from './util/fsx.js';
import fs from 'node:fs/promises';

/** File contents: UTF-8 text, or raw bytes for binary assets. */
export type FileContent = string | Buffer;

/** Relative path (POSIX separators) to file contents. */
export type FileMap = Map<string, FileContent>;

/** Create an empty file map. */
export function createFileMap(): FileMap {
  return new Map<string, FileContent>();
}

/** Normalise a relative path to POSIX separators. */
export function normalizePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/').replace(/^\.\//, '');
}

/** Add a file to the map. */
export function addFile(map: FileMap, relativePath: string, content: FileContent): void {
  map.set(normalizePath(relativePath), content);
}

/** Merge `other` into `map`; later entries win. */
export function mergeFileMaps(map: FileMap, other: FileMap): FileMap {
  for (const [key, value] of other) map.set(key, value);
  return map;
}

/** Sorted relative paths in a file map. */
export function listFiles(map: FileMap): string[] {
  return [...map.keys()].sort();
}

/** Byte length of an entry, for reporting generated output size. */
export function contentLength(content: FileContent): number {
  return typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.byteLength;
}

/** True when the path should be marked executable after writing. */
export function isExecutable(relativePath: string): boolean {
  const base = relativePath.split('/').pop() ?? '';
  return base === 'mvnw' || base === 'gradlew';
}

/** Write every entry of the map below `root`, returning the written paths. */
export async function materialize(root: string, map: FileMap): Promise<string[]> {
  const written: string[] = [];
  const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [relativePath, content] of entries) {
    const absolute = path.join(root, relativePath);
    await mkdirp(path.dirname(absolute));
    await fs.writeFile(absolute, content);
    if (isExecutable(relativePath)) await fs.chmod(absolute, 0o755);
    written.push(relativePath);
  }
  return written;
}
