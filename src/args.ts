/**
 * Command line argument parsing.
 *
 * The parser is hand written rather than pulled from a library so that
 * `create-jvm --help` output, error messages and exit codes stay fully under
 * this project's control.
 */

import { deriveArtifactId, derivePackageName, validateGroupId } from './util/naming.js';
import { DEFAULT_BOOT_VERSION } from './versions.js';
import type { BuildTool, GradleDsl, Language, Packaging, ProjectKind } from './types.js';

/** Raw, still-unvalidated options produced by the parser. */
export interface ParsedArgs {
  kind?: ProjectKind;
  buildTool?: BuildTool;
  dsl?: GradleDsl;
  language?: Language;
  packaging?: Packaging;
  name?: string;
  groupId?: string;
  artifactId?: string;
  version?: string;
  javaVersion?: string;
  kotlinVersion?: string;
  bootVersion?: string;
  packageName?: string;
  description?: string;
  dependencies?: string[];
  bootDependencies?: string[];
  modules?: string[];
  multiModule?: boolean;
  template?: string;
  git?: boolean;
  install?: boolean;
  dryRun?: boolean;
  force?: boolean;
  help?: boolean;
  version_?: boolean;
  /** Positional project name. */
  positional?: string;
  /** Non-fatal problems, reported before running. */
  warnings: string[];
}

export interface ParseResult {
  args: ParsedArgs;
  /** Set when parsing failed; the caller prints this and exits non-zero. */
  error?: string;
}

/** Options that take a value. */
const VALUE_FLAGS = new Set([
  '--template',
  '-t',
  '--group-id',
  '--artifact-id',
  // `--version` is reserved for the CLI's own version, so the project version
  // needs a distinct spelling.
  '--project-version',
  '--app-version',
  '--java',
  '--java-version',
  '--kotlin-version',
  '--boot-version',
  '--package',
  '--description',
  '--dep',
  '--dependencies',
  '--boot-dep',
  '--boot-dependencies',
  '--module',
  '--modules',
  '--language',
  '--lang',
  '--build',
  '--build-tool',
  '--dsl',
  '--packaging',
  '--name',
]);

/** Boolean flags. */
const BOOLEAN_FLAGS = new Set([
  '--help',
  '-h',
  '--version',
  '-v',
  '--git',
  '--no-git',
  '--install',
  '--no-install',
  '--dry-run',
  '--force',
  '-f',
  '--multi-module',
  '--maven',
  '--gradle',
  '--spring-boot',
  '--springboot',
  '--boot',
  '--java-only',
  '--yes',
  '-y',
  '--no-input',
  '--json',
  '--no-color',
  '--quiet',
  '-q',
]);

/** Split `--flag=value` and collect repeated flags. */
function splitFlag(token: string): { flag: string; inlineValue?: string } {
  const eq = token.indexOf('=');
  if (eq === -1 || !token.startsWith('--')) return { flag: token };
  return { flag: token.slice(0, eq), inlineValue: token.slice(eq + 1) };
}

/**
 * Parse `argv` (without the leading `node` and script path).
 */
export function parseArgs(argv: string[]): ParseResult {
  const args: ParsedArgs = { warnings: [] };
  const dependencies: string[] = [];
  const bootDependencies: string[] = [];
  const modules: string[] = [];
  let seenDoubleDash = false;

  const takeValue = (flag: string, inline: string | undefined, index: number): [string | undefined, number] => {
    if (inline !== undefined) return [inline, index];
    const next = argv[index + 1];
    if (next === undefined || (next.startsWith('-') && next !== '-')) {
      return [undefined, index];
    }
    return [next, index + 1];
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    if (token === '--') {
      seenDoubleDash = true;
      continue;
    }
    if (seenDoubleDash) {
      args.positional ??= token;
      continue;
    }

    // A bare `-` or a value that is not a flag becomes the project name.
    if (!token.startsWith('-') || token === '-') {
      if (args.positional === undefined) args.positional = token;
      else args.warnings.push(`ignoring extra argument "${token}"`);
      continue;
    }

    const { flag, inlineValue } = splitFlag(token);

    if (!VALUE_FLAGS.has(flag) && !BOOLEAN_FLAGS.has(flag)) {
      return { args, error: `unknown option "${flag}" — run create-jvm --help` };
    }

    if (VALUE_FLAGS.has(flag)) {
      const [value, consumedIndex] = takeValue(flag, inlineValue, i);
      i = consumedIndex;
      if (value === undefined) return { args, error: `option "${flag}" requires a value` };

      switch (flag) {
        case '--template':
        case '-t':
          args.template = value;
          break;
        case '--group-id':
          args.groupId = value;
          break;
        case '--artifact-id':
          args.artifactId = value;
          break;
        case '--project-version':
        case '--app-version':
          args.version = value;
          break;
        case '--java':
        case '--java-version':
          args.javaVersion = value;
          break;
        case '--kotlin-version':
          args.kotlinVersion = value;
          break;
        case '--boot-version':
          args.bootVersion = value;
          break;
        case '--package':
          args.packageName = value;
          break;
        case '--description':
          args.description = value;
          break;
        case '--dep':
        case '--dependencies':
          dependencies.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
          break;
        case '--boot-dep':
        case '--boot-dependencies':
          bootDependencies.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
          break;
        case '--module':
        case '--modules':
          modules.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
          break;
        case '--name':
          args.name = value;
          break;
        case '--language':
        case '--lang': {
          const language = normaliseLanguage(value);
          if (!language) return { args, error: `unsupported language "${value}" — use java, kotlin or groovy` };
          args.language = language;
          break;
        }
        case '--build':
        case '--build-tool': {
          const tool = normaliseBuildTool(value);
          if (!tool) return { args, error: `unsupported build tool "${value}" — use maven or gradle` };
          args.buildTool = tool;
          break;
        }
        case '--dsl': {
          const dsl = normaliseDsl(value);
          if (!dsl) return { args, error: `unsupported Gradle DSL "${value}" — use groovy or kotlin` };
          args.dsl = dsl;
          break;
        }
        case '--packaging': {
          const packaging = normalisePackaging(value);
          if (!packaging) return { args, error: `unsupported packaging "${value}" — use jar or war` };
          args.packaging = packaging;
          break;
        }
        default:
          return { args, error: `unhandled option "${flag}"` };
      }
      continue;
    }

    // Boolean flags.
    switch (flag) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--version':
      case '-v':
        args.version_ = true;
        break;
      case '--git':
        args.git = true;
        break;
      case '--no-git':
        args.git = false;
        break;
      case '--install':
        args.install = true;
        break;
      case '--no-install':
        args.install = false;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--force':
      case '-f':
        args.force = true;
        break;
      case '--multi-module':
        args.multiModule = true;
        break;
      case '--maven':
        args.kind = 'maven';
        args.buildTool = 'maven';
        break;
      case '--gradle':
        args.buildTool = 'gradle';
        if (args.kind === undefined || args.kind === 'maven') args.kind = 'gradle';
        break;
      case '--spring-boot':
      case '--springboot':
      case '--boot':
        args.kind = 'springboot';
        break;
      case '--java-only':
        if (args.kind === 'springboot') args.kind = args.buildTool === 'gradle' ? 'gradle' : 'maven';
        break;
      case '--yes':
      case '-y':
      case '--no-input':
        // Handled by the caller through RunContext.
        break;
      case '--json':
      case '--no-color':
      case '--quiet':
      case '-q':
        // Handled by the caller through RunContext.
        break;
      default:
        return { args, error: `unhandled option "${flag}"` };
    }
  }

  if (dependencies.length > 0) args.dependencies = dependencies;
  if (bootDependencies.length > 0) args.bootDependencies = bootDependencies;
  if (modules.length > 0) {
    args.modules = modules;
    args.multiModule = true;
  }
  if (args.positional !== undefined && args.name === undefined) args.name = args.positional;
  if (args.name === undefined) args.name = args.positional;

  return { args };
}

/** Normalise a language spelling. */
export function normaliseLanguage(value: string): Language | undefined {
  const lower = value.toLowerCase();
  if (lower === 'java') return 'java';
  if (lower === 'kotlin' || lower === 'kt') return 'kotlin';
  if (lower === 'groovy') return 'groovy';
  return undefined;
}

/** Normalise a build tool spelling. */
export function normaliseBuildTool(value: string): BuildTool | undefined {
  const lower = value.toLowerCase();
  if (lower === 'maven' || lower === 'mvn') return 'maven';
  if (lower === 'gradle' || lower === 'gradlew') return 'gradle';
  return undefined;
}

/** Normalise a Gradle DSL spelling. */
export function normaliseDsl(value: string): GradleDsl | undefined {
  const lower = value.toLowerCase();
  if (lower === 'groovy' || lower === 'groovy-dsl') return 'groovy';
  if (lower === 'kotlin' || lower === 'kts' || lower === 'kotlin-dsl') return 'kotlin';
  return undefined;
}

/** Normalise a packaging spelling. */
export function normalisePackaging(value: string): Packaging | undefined {
  const lower = value.toLowerCase();
  if (lower === 'jar') return 'jar';
  if (lower === 'war') return 'war';
  return undefined;
}

/** Apply flag defaults that depend on other flags. */
export function applyDefaults(args: ParsedArgs): {
  groupId: string;
  artifactId: string;
  packageName: string;
  version: string;
  javaVersion: string;
  kotlinVersion: string;
  bootVersion: string;
  description: string;
} {
  const name = args.name ?? 'demo';
  const artifactId = args.artifactId ?? deriveArtifactId(name);
  const groupId = args.groupId ?? 'com.example';
  const packageName =
    args.packageName ??
    (validateGroupId(groupId).ok ? derivePackageName(groupId, artifactId) : 'com.example.app');

  return {
    groupId,
    artifactId,
    packageName,
    version: args.version ?? '0.0.1-SNAPSHOT',
    javaVersion: args.javaVersion ?? '21',
    kotlinVersion: args.kotlinVersion ?? '2.4.21',
    bootVersion: args.bootVersion ?? DEFAULT_BOOT_VERSION,
    description: args.description ?? '',
  };
}

/** Whether any flag forces non-interactive behaviour. */
export function isNonInteractive(argv: string[]): boolean {
  return argv.some((a) => ['--yes', '-y', '--no-input', '--json'].includes(a));
}
