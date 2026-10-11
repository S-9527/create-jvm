/**
 * Remote template support ("degit" style).
 *
 * Templates are fetched as tarballs rather than cloned, which avoids shipping a
 * `.git` directory and keeps generation pure. Supported specs:
 *
 * - `gh:owner/repo`
 * - `gh:owner/repo/sub/dir`
 * - `gh:owner/repo#branch`
 * - `gitlab:owner/repo`, `bitbucket:owner/repo`
 * - any `https://` git URL, cloned via the `git` binary as a fallback
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { extractArchive } from '../util/archive.js';
import { normalizePath, type FileMap } from '../writer.js';
import { run } from '../util/exec.js';

/** A parsed template reference. */
export interface TemplateSpec {
  /** Resolved tarball URL, when the host offers one. */
  tarballUrl?: string;
  /** Git URL, used when no tarball endpoint is known. */
  gitUrl?: string;
  /** Branch, tag or commit. */
  ref: string;
  /** Subdirectory inside the repository to use as the project root. */
  subdir: string;
  /** Human readable description for logging. */
  label: string;
}

const HOSTS: Record<string, { tarball: (o: string, r: string, ref: string) => string; web: (o: string, r: string) => string }> = {
  gh: {
    tarball: (o, r, ref) => `https://codeload.github.com/${o}/${r}/tar.gz/${ref}`,
    web: (o, r) => `https://github.com/${o}/${r}`,
  },
  github: {
    tarball: (o, r, ref) => `https://codeload.github.com/${o}/${r}/tar.gz/${ref}`,
    web: (o, r) => `https://github.com/${o}/${r}`,
  },
  gitlab: {
    tarball: (o, r, ref) => `https://gitlab.com/${o}/${r}/-/archive/${ref}/${r}-${ref}.tar.gz`,
    web: (o, r) => `https://gitlab.com/${o}/${r}`,
  },
  bitbucket: {
    tarball: (o, r, ref) => `https://bitbucket.org/${o}/${r}/get/${ref}.tar.gz`,
    web: (o, r) => `https://bitbucket.org/${o}/${r}`,
  },
};

/**
 * Parse a template spec.
 *
 * @throws when the spec cannot be understood.
 */
export function parseTemplateSpec(spec: string): TemplateSpec {
  const trimmed = spec.trim();
  if (!trimmed) throw new Error('template spec is empty');

  // Split off `#ref`.
  const hashIndex = trimmed.indexOf('#');
  const withoutRef = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const ref = hashIndex === -1 ? 'HEAD' : trimmed.slice(hashIndex + 1) || 'HEAD';

  const colonIndex = withoutRef.indexOf(':');
  const scheme = colonIndex === -1 ? '' : withoutRef.slice(0, colonIndex);
  const host = HOSTS[scheme];

  if (host) {
    const rest = withoutRef.slice(colonIndex + 1).replace(/^\/+/, '');
    const segments = rest.split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new Error(`invalid template "${spec}" — expected ${scheme}:owner/repo[/subdir]`);
    }
    const owner = segments[0] ?? '';
    const repo = segments[1] ?? '';
    const subdir = segments.slice(2).join('/');
    return {
      tarballUrl: host.tarball(owner, repo, ref),
      ref,
      subdir,
      label: `${host.web(owner, repo)}${subdir ? `/${subdir}` : ''}${ref === 'HEAD' ? '' : `#${ref}`}`,
    };
  }

  // GitHub/GitLab/Bitbucket HTTPS URLs.
  for (const [key, value] of Object.entries(HOSTS)) {
    if (key === 'gh' || key === 'github') continue;
    if (withoutRef.startsWith(value.web('', '').replace(/\/$/, ''))) {
      const rest = withoutRef.slice(value.web('', '').length).replace(/^\/+/, '');
      const segments = rest.split('/').filter(Boolean);
      if (segments.length >= 2) {
        const owner = segments[0] ?? '';
        const repo = (segments[1] ?? '').replace(/\.git$/, '');
        const subdir = segments.slice(2).join('/');
        return {
          tarballUrl: value.tarball(owner, repo, ref),
          ref,
          subdir,
          label: `${value.web(owner, repo)}${subdir ? `/${subdir}` : ''}`,
        };
      }
    }
  }
  if (withoutRef.startsWith('https://github.com/')) {
    const rest = withoutRef.slice('https://github.com/'.length).replace(/^\/+/, '');
    const segments = rest.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const owner = segments[0] ?? '';
      const repo = (segments[1] ?? '').replace(/\.git$/, '');
      const subdir = segments.slice(2).join('/');
      return {
        tarballUrl: HOSTS.gh!.tarball(owner, repo, ref),
        ref,
        subdir,
        label: `${HOSTS.gh!.web(owner, repo)}${subdir ? `/${subdir}` : ''}`,
      };
    }
  }

  // Fall back to cloning any other git URL.
  if (/^(https?|git|ssh):\/\//.test(withoutRef) || withoutRef.startsWith('git@')) {
    return { gitUrl: withoutRef, ref, subdir: '', label: withoutRef };
  }

  throw new Error(
    `unrecognised template "${spec}" — use gh:owner/repo, gitlab:owner/repo, bitbucket:owner/repo, or a git URL`,
  );
}

/** Download and unpack a template into a file map. */
export async function fetchTemplate(
  spec: string,
  options: { timeoutMs?: number } = {},
): Promise<{ files: FileMap; spec: TemplateSpec }> {
  const parsed = parseTemplateSpec(spec);
  const files = parsed.tarballUrl
    ? await fetchTarball(parsed.tarballUrl, options.timeoutMs ?? 60_000)
    : await cloneRepository(parsed);

  const stripped = stripPrefix(files);
  const scoped = parsed.subdir ? scopeToSubdir(stripped, parsed.subdir) : stripped;
  if (scoped.size === 0) {
    throw new Error(
      `template "${spec}" produced no files${parsed.subdir ? ` under "${parsed.subdir}"` : ''}`,
    );
  }
  return { files: scoped, spec: parsed };
}

/** Fetch a tarball URL and unpack it. */
async function fetchTarball(url: string, timeoutMs: number): Promise<FileMap> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return await extractArchive(buffer);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`could not download template (${reason})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Clone a repository with the `git` binary and read it into a file map. */
async function cloneRepository(spec: TemplateSpec): Promise<FileMap> {
  if (!spec.gitUrl) throw new Error('template has no resolvable source');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-jvm-'));
  try {
    const args = ['clone', '--depth', '1'];
    if (spec.ref !== 'HEAD') args.push('--branch', spec.ref);
    args.push(spec.gitUrl, dir);
    const result = await run('git', args, { timeoutMs: 180_000 });
    if (result.spawnFailed) {
      throw new Error('git is not installed; install git or use a gh:/gitlab:/bitbucket: spec');
    }
    if (result.code !== 0) {
      const detail = result.stderr.trim().split('\n').slice(-2).join(' ');
      throw new Error(`git clone failed${detail ? `: ${detail}` : ''}`);
    }
    return await readDirectoryIntoMap(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Read a directory tree into a file map, skipping `.git`. */
async function readDirectoryIntoMap(root: string): Promise<FileMap> {
  const files: FileMap = new Map();
  async function visit(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.set(normalizePath(path.relative(root, absolute)), await fs.readFile(absolute));
      }
    }
  }
  await visit(root);
  return files;
}

/** Remove the `<repo>-<ref>/` prefix GitHub and GitLab tarballs add. */
function stripPrefix(files: FileMap): FileMap {
  const paths = [...files.keys()];
  if (paths.length === 0) return files;
  const first = paths[0] ?? '';
  const slash = first.indexOf('/');
  if (slash === -1) return files;
  const candidate = first.slice(0, slash + 1);
  if (!paths.every((p) => p.startsWith(candidate))) return files;
  const out: FileMap = new Map();
  for (const [entryPath, content] of files) {
    const relative = entryPath.slice(candidate.length);
    if (relative) out.set(relative, content);
  }
  return out;
}

/** Restrict a file map to a subdirectory, rebasing paths onto the root. */
function scopeToSubdir(files: FileMap, subdir: string): FileMap {
  const prefix = `${subdir.replace(/^\/+|\/+$/g, '')}/`;
  const out: FileMap = new Map();
  for (const [entryPath, content] of files) {
    if (entryPath.startsWith(prefix)) {
      out.set(entryPath.slice(prefix.length), content);
    }
  }
  return out;
}

/**
 * Undo the renames package publishers apply to dotfiles.
 *
 * npm strips `.gitignore` from published packages, so templates that travel
 * through npm use `gitignore` or `_gitignore` instead.
 */
export function restoreDotfiles(files: FileMap): FileMap {
  const renames: Record<string, string> = {
    gitignore: '.gitignore',
    _gitignore: '.gitignore',
    npmrc: '.npmrc',
    _npmrc: '.npmrc',
  };
  const out: FileMap = new Map();
  for (const [entryPath, content] of files) {
    const segments = entryPath.split('/');
    const base = segments[segments.length - 1] ?? '';
    const replacement = renames[base];
    if (replacement) {
      segments[segments.length - 1] = replacement;
      out.set(segments.join('/'), content);
    } else {
      out.set(entryPath, content);
    }
  }
  return out;
}
