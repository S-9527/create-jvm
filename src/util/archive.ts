/**
 * In-memory archive readers.
 *
 * Initializr returns a zip and GitHub returns a tar.gz. Both are unpacked
 * without touching the filesystem so generation stays pure and works under
 * `--dry-run`.
 */

import zlib from 'node:zlib';
import * as tar from 'tar';
import { Readable } from 'node:stream';
import type { FileMap } from '../writer.js';
import { normalizePath } from '../writer.js';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/** Locate the End Of Central Directory record, scanning back over any comment. */
function findEocd(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('not a zip archive: end of central directory record not found');
}

/** Read the central directory of a zip archive. */
function readCentralDirectory(buffer: Buffer): ZipEntry[] {
  const eocd = findEocd(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error('corrupt zip archive: bad central directory entry');
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Decompress one zip entry's payload. */
function readEntryData(buffer: Buffer, entry: ZipEntry): Buffer {
  const { localHeaderOffset } = entry;
  if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`corrupt zip archive: bad local header for ${entry.name}`);
  }
  // The local header's own name/extra lengths can differ from the central
  // directory's, so the data offset must be computed from the local header.
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const start = localHeaderOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) {
    throw new Error(`corrupt zip archive: truncated data for ${entry.name}`);
  }
  const raw = buffer.subarray(start, end);

  switch (entry.method) {
    case 0:
      return Buffer.from(raw);
    case 8:
      return zlib.inflateRawSync(raw);
    default:
      throw new Error(`unsupported zip compression method ${entry.method} for ${entry.name}`);
  }
}

/** Unpack a zip archive into a file map. Directory entries are skipped. */
export function unzip(buffer: Buffer): FileMap {
  const files: FileMap = new Map();
  for (const entry of readCentralDirectory(buffer)) {
    if (entry.name.endsWith('/')) continue;
    if (entry.compressedSize === 0 && entry.uncompressedSize === 0) continue;
    files.set(normalizePath(entry.name), readEntryData(buffer, entry));
  }
  return files;
}

/**
 * Unpack a gzip-compressed tar archive into a file map.
 *
 * @throws when the archive cannot be parsed.
 */
export async function untarGz(buffer: Buffer): Promise<FileMap> {
  const files: FileMap = new Map();
  const pending: Promise<void>[] = [];

  const parser = tar.t({
    onentry(entry) {
      if (entry.type !== 'File') {
        entry.resume();
        return;
      }
      const chunks: Buffer[] = [];
      const done = new Promise<void>((resolve, reject) => {
        entry.on('data', (chunk: Buffer) => chunks.push(chunk));
        entry.on('end', () => {
          files.set(normalizePath(entry.path), Buffer.concat(chunks));
          resolve();
        });
        entry.on('error', reject);
      });
      pending.push(done);
    },
  });

  const finished = new Promise<void>((resolve, reject) => {
    parser.on('end', resolve);
    parser.on('error', reject);
  });

  Readable.from(buffer).pipe(parser);
  await Promise.all([finished, ...pending]);
  return files;
}

/** Unpack a zip or gzip-compressed tar archive, choosing by magic bytes. */
export async function extractArchive(buffer: Buffer): Promise<FileMap> {
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return unzip(buffer);
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return untarGz(buffer);
  throw new Error('unrecognised archive format: expected a zip or tar.gz payload');
}
