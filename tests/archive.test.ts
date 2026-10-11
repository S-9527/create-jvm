import { describe, expect, it } from 'vitest';
import { unzip, untarGz, extractArchive } from '../src/util/archive.js';
import { createFileMap, addFile, listFiles, contentLength } from '../src/writer.js';
import { commonPrefix, stripCommonPrefix } from '../src/generators/initializr.js';
import { parseTemplateSpec } from '../src/generators/remote.js';

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

/** Build a zip archive in memory, exercising both stored and deflated entries. */
function buildZip(entries: { name: string; data: string; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.from(entry.data, 'utf8');
    const method = entry.store ? 0 : 8;
    const payload = entry.store ? raw : zlib.deflateRawSync(raw);
    const crc = zlib.crc32 ? zlib.crc32(raw) : crc32Fallback(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local, payload);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + payload.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

/** CRC-32 for environments where `zlib.crc32` is unavailable. */
function crc32Fallback(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('unzip', () => {
  it('reads deflated and stored entries', () => {
    const zip = buildZip([
      { name: 'a.txt', data: 'hello' },
      { name: 'nested/b.txt', data: 'world', store: true },
    ]);
    const files = unzip(zip);
    expect(files.get('a.txt')?.toString()).toBe('hello');
    expect(files.get('nested/b.txt')?.toString()).toBe('world');
  });

  it('skips directory entries', () => {
    const zip = buildZip([{ name: 'dir/', data: '' }]);
    expect(unzip(zip).size).toBe(0);
  });

  it('rejects a non-zip buffer', () => {
    expect(() => unzip(Buffer.from('not a zip at all, definitely not'))).toThrow(/zip/);
  });
});

describe('untarGz', () => {
  it('reads a gzipped tar produced by the system tar', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-jvm-test-'));
    try {
      fs.mkdirSync(path.join(dir, 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'pkg', 'file.txt'), 'tar contents');
      execFileSync('tar', ['czf', path.join(dir, 'out.tgz'), '-C', dir, 'pkg']);
      const buffer = fs.readFileSync(path.join(dir, 'out.tgz'));

      const files = await untarGz(buffer);
      expect(files.get('pkg/file.txt')?.toString()).toBe('tar contents');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractArchive', () => {
  it('detects zip by magic bytes', async () => {
    const zip = buildZip([{ name: 'x.txt', data: 'z' }]);
    const files = await extractArchive(zip);
    expect(files.get('x.txt')?.toString()).toBe('z');
  });

  it('rejects an unknown format', async () => {
    await expect(extractArchive(Buffer.from('plain text'))).rejects.toThrow(/unrecognised/);
  });
});

describe('commonPrefix', () => {
  it('finds a shared leading directory', () => {
    expect(commonPrefix(['repo-main/a', 'repo-main/b'])).toBe('repo-main/');
  });

  it('returns empty when there is no shared directory', () => {
    expect(commonPrefix(['a', 'b'])).toBe('');
    expect(commonPrefix(['x/a', 'y/b'])).toBe('');
  });

  it('returns empty for a single root file', () => {
    expect(commonPrefix(['file.txt'])).toBe('');
  });
});

describe('stripCommonPrefix', () => {
  it('rebases paths onto the root', () => {
    const files = createFileMap();
    addFile(files, 'repo-main/src/a.ts', 'a');
    addFile(files, 'repo-main/readme.md', 'r');
    const stripped = stripCommonPrefix(files);
    expect(listFiles(stripped)).toEqual(['readme.md', 'src/a.ts']);
  });
});

describe('parseTemplateSpec', () => {
  it('parses gh:owner/repo', () => {
    const spec = parseTemplateSpec('gh:owner/repo');
    expect(spec.tarballUrl).toBe('https://codeload.github.com/owner/repo/tar.gz/HEAD');
    expect(spec.subdir).toBe('');
  });

  it('parses a subdirectory and ref', () => {
    const spec = parseTemplateSpec('gh:owner/repo/templates/api#v2');
    expect(spec.subdir).toBe('templates/api');
    expect(spec.ref).toBe('v2');
    expect(spec.tarballUrl).toContain('/tar.gz/v2');
  });

  it('parses gitlab and bitbucket hosts', () => {
    expect(parseTemplateSpec('gitlab:o/r').tarballUrl).toContain('gitlab.com');
    expect(parseTemplateSpec('bitbucket:o/r').tarballUrl).toContain('bitbucket.org');
  });

  it('parses a github https URL', () => {
    const spec = parseTemplateSpec('https://github.com/owner/repo');
    expect(spec.tarballUrl).toBe('https://codeload.github.com/owner/repo/tar.gz/HEAD');
  });

  it('falls back to git clone for other URLs', () => {
    const spec = parseTemplateSpec('https://git.example.com/team/repo.git');
    expect(spec.gitUrl).toBe('https://git.example.com/team/repo.git');
    expect(spec.tarballUrl).toBeUndefined();
  });

  it('rejects unparseable specs', () => {
    expect(() => parseTemplateSpec('nonsense')).toThrow(/unrecognised template/);
    expect(() => parseTemplateSpec('gh:onlyowner')).toThrow(/invalid template/);
    expect(() => parseTemplateSpec('')).toThrow(/empty/);
  });
});

describe('file map helpers', () => {
  it('reports byte length for text and binary content', () => {
    expect(contentLength('abc')).toBe(3);
    expect(contentLength(Buffer.from([1, 2, 3, 4]))).toBe(4);
  });

  it('sorts file listings', () => {
    const files = createFileMap();
    addFile(files, 'z.txt', 'z');
    addFile(files, 'a.txt', 'a');
    expect(listFiles(files)).toEqual(['a.txt', 'z.txt']);
  });
});
