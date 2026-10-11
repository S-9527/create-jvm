/**
 * Turning parsed flags into a {@link ProjectConfig}, with no prompting.
 *
 * Kept separate from the wizard: this is the path taken when the user has
 * already decided everything on the command line, so it must be deterministic
 * and must fail before any network or disk activity.
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyDefaults, type ParseResult } from './args.js';
import { resolveDependencies } from './catalog.js';
import { validateGroupId } from './util/naming.js';
import { DEFAULT_BOOT_VERSION } from './versions.js';
import type { ProjectConfig, ProjectKind } from './types.js';

/**
 * Resolve the target directory for a project name.
 *
 * `.` means "generate into the current directory"; any other name becomes a
 * subdirectory of the working directory.
 */
export function resolveTargetDir(cwd: string, name: string): string {
  if (name === '.') return cwd;
  return path.resolve(cwd, name);
}

/**
 * Read the CLI version from the installed package.json.
 *
 * This must not be hardcoded: a literal drifts from the published version on
 * every release, and `create-jvm --version` then reports the wrong number. The
 * path is resolved relative to this module so it works from `dist/` and from
 * `src/` under tsx alike.
 */
export function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(here, '..', 'package.json'),
      path.resolve(here, '..', '..', 'package.json'),
    ];
    for (const candidate of candidates) {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (parsed.name === 'create-jvm' && parsed.version) return parsed.version;
    }
  } catch {
    // Fall through to the placeholder below.
  }
  return '0.0.0-unknown';
}

/** The CLI version, resolved once at load time. */
export const VERSION = readVersion();

/** Build a config directly from flags, without prompting. */
export function configFromArgs(cwd: string, parsed: ParseResult): ProjectConfig {
  const { args } = parsed;
  const defaults = applyDefaults(args);
  const name = args.name ?? 'demo';

  const kind: ProjectKind =
    args.kind ??
    (args.template ? 'template' : args.buildTool === 'gradle' ? 'gradle' : 'maven');
  const buildTool = args.buildTool ?? (kind === 'gradle' ? 'gradle' : 'maven');

  // Validate eagerly so bad flags fail before any network or disk activity.
  if (args.groupId && !validateGroupId(args.groupId).ok) {
    throw new Error(`invalid --group-id "${args.groupId}"`);
  }
  const dependencies = args.dependencies ? resolveDependencies(args.dependencies) : [];
  const modules = args.modules ?? [];
  const multiModule = args.multiModule ?? false;

  // Spring Initializr produces a single-module project and has no parameter for
  // extra modules, so asking for both would silently drop the modules.
  if (kind === 'springboot' && (multiModule || modules.length > 0)) {
    throw new Error(
      'Spring Boot projects cannot be generated as multi-module — Initializr only produces a single module. Generate the parent with --maven or --gradle and add the Boot module separately.',
    );
  }

  return {
    kind,
    name,
    targetDir: resolveTargetDir(cwd, name),
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
    multiModule,
    modules,
    shade: false,
    ...(args.template ? { template: args.template } : {}),
    git: args.git ?? true,
    install: args.install ?? false,
    dryRun: args.dryRun ?? false,
    force: args.force ?? false,
  };
}
