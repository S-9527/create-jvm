/**
 * The individual prompts the wizard asks.
 *
 * Each function owns one question: it decides whether the question is needed at
 * all (a flag may already answer it), asks it, and returns the answer. Keeping
 * them separate from {@link runWizard} means the flow reads as a list of
 * decisions rather than several hundred lines of interleaved prompting.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { catalogGroups } from '../catalog.js';
import {
  deriveArtifactId,
  derivePackageName,
  validateArtifactId,
  validateGroupId,
  validateModuleName,
} from '../util/naming.js';
import { JAVA_VERSIONS, DEFAULT_BOOT_VERSION, initialJavaVersion } from '../versions.js';
import type { InitializrMetadata } from '../generators/initializr.js';
import type {
  BuildTool,
  ConfigFormat,
  GradleDsl,
  Language,
  Packaging,
  ProjectKind,
} from '../types.js';
import type { ParsedArgs } from '../args.js';
import { FALLBACK_BOOT_GROUPS } from './fallback-starters.js';
import { PROJECT_TEMPLATES, languageLabel, type ProjectTemplate } from './templates.js';

/** Abort the wizard because the user pressed Ctrl-C. */
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * Unwrap a prompt result, aborting when the user cancels.
 *
 * The parameter is typed against clack's own `CANCEL_SYMBOL` rather than the
 * wider `symbol`, so `T` infers as the prompt's value type instead of being
 * widened to `T | symbol`.
 */
export function unwrap<T>(value: T | typeof p.CANCEL_SYMBOL): T {
  if (p.isCancel(value)) throw new CancelledError();
  return value as T;
}

/**
 * Wrap a validator so that submitting an empty value is accepted.
 *
 * clack applies `defaultValue` in its `finalize` handler, which runs *after*
 * `validate`. A plain required-field check therefore rejects an empty
 * submission even though a default is configured — pressing Enter on the
 * "Project name" prompt would report "project name is required" instead of
 * accepting "demo". Passing an empty value through lets the default apply.
 */
export function defaultable(
  validator: (value: string) => { ok: boolean; message?: string },
): (value: string | undefined) => string | undefined {
  return (value) => {
    if (value === undefined || value.trim() === '') return undefined;
    const result = validator(value);
    return result.ok ? undefined : result.message;
  };
}

/** Starters that need a JDBC driver on the classpath to start up. */
const PERSISTENCE_STARTERS = [
  'data-jpa',
  'jdbc',
  'data-jdbc',
  'data-r2dbc',
  'r2dbc',
  'mybatis',
  'batch',
];

/** JDBC drivers Initializr can add. */
const JDBC_DRIVERS = [
  'h2',
  'postgresql',
  'mysql',
  'mariadb',
  'sqlserver',
  'oracle',
  'db2',
  'derby',
  'hsqldb',
];

/**
 * Warn when a persistence starter is selected without a driver.
 *
 * Initializr happily generates such a project, but it fails at startup with
 * "Failed to determine a suitable driver class" — a confusing first run, so it
 * is worth flagging up front.
 */
export function persistenceWarnings(selected: string[]): string[] {
  const usesPersistence = selected.some((id) => PERSISTENCE_STARTERS.includes(id));
  const hasDriver = selected.some((id) => JDBC_DRIVERS.includes(id));
  if (usesPersistence && !hasDriver) {
    return [
      'a persistence starter was selected without a database driver — the app will fail to start. Add one (for example "h2" for local development) or configure a datasource.',
    ];
  }
  return [];
}

/** Preferred display order for Initializr dependency groups. */
const GROUP_ORDER = [
  'Web',
  'SQL',
  'Security',
  'NoSQL',
  'I/O',
  'Messaging',
  'Ops',
  'Observability',
  'Template Engines',
  'Testing',
  'Developer Tools',
];

/**
 * Sort dependency groups into the preferred order, unknown groups last.
 *
 * Initializr lists "Developer Tools" first, whose first entry is GraalVM Native
 * Support. Since the picker opens on the first option of the first group, that
 * makes the most likely accidental selection an exotic one. Ordering by how
 * often a group is actually wanted puts Spring Web under the cursor.
 */
function orderGroups<T>(groups: [string, T][]): [string, T][] {
  const rank = (name: string): number => {
    const index = GROUP_ORDER.indexOf(name);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** Ask for the project name, unless a flag supplied it. */
export async function askProjectName(args: ParsedArgs): Promise<string> {
  if (args.name) return args.name;
  return unwrap(
    await p.text({
      message: 'Project name',
      placeholder: 'demo',
      defaultValue: 'demo',
      validate: (value) => {
        if (value === undefined || value.trim() === '') return undefined;
        if (value === '.' || value === '..') return 'project name cannot be "." or ".."';
        if (value.includes('/') || value.includes('\\')) {
          return 'project name cannot contain path separators';
        }
        return undefined;
      },
    }),
  );
}

/** Ask which project type to generate, unless a flag decided it. */
export async function askProjectType(args: ParsedArgs): Promise<ProjectTemplate> {
  if (args.template !== undefined) {
    return PROJECT_TEMPLATES.find((t) => t.value === 'template')!;
  }
  if (args.kind !== undefined) return templateFromArgs(args);
  return unwrap(
    await p.select<ProjectTemplate>({
      message: 'Select a project type',
      initialValue: PROJECT_TEMPLATES[0]!,
      options: PROJECT_TEMPLATES.map((t) => ({
        value: t,
        label: t.label,
        hint: t.hint,
      })),
      maxItems: PROJECT_TEMPLATES.length + 2,
    }),
  );
}

/** Pick the template entry matching flags already supplied. */
export function templateFromArgs(args: ParsedArgs): ProjectTemplate {
  const kind = args.kind ?? 'maven';
  const found = PROJECT_TEMPLATES.find((t) => t.kind === kind);
  if (found) return found;
  return {
    value: `custom-${kind}`,
    label: kind,
    hint: '',
    kind,
    buildTools: args.buildTool ? [args.buildTool] : ['maven', 'gradle'],
    languages: ['java', 'kotlin', 'groovy'],
  };
}

/** Ask for the remote template spec. */
export async function askTemplateSpec(args: ParsedArgs): Promise<string> {
  if (args.template) return args.template;
  return unwrap(
    await p.text({
      message: 'Template',
      placeholder: 'gh:owner/repo',
      validate: (value) => (value?.trim() ? undefined : 'a template spec is required'),
    }),
  );
}

/** Ask which build system to use, when the framework supports more than one. */
export async function askBuildTool(
  args: ParsedArgs,
  template: ProjectTemplate,
): Promise<BuildTool> {
  if (template.buildTools.length === 1) return template.buildTools[0]!;
  if (args.buildTool) return args.buildTool;
  return unwrap(
    await p.select<BuildTool>({
      message: 'Select a build system',
      initialValue: template.buildTools[0]!,
      options: template.buildTools.map((tool) => ({
        value: tool,
        label: tool === 'maven' ? pc.yellow('Maven') : pc.blue('Gradle'),
        hint: tool === 'maven' ? 'pom.xml' : 'build.gradle / build.gradle.kts',
      })),
    }),
  );
}

/** Ask which Gradle DSL to use. */
export async function askGradleDsl(args: ParsedArgs, buildTool: BuildTool): Promise<GradleDsl> {
  if (buildTool !== 'gradle' || args.dsl) return args.dsl ?? 'groovy';
  return unwrap(
    await p.select<GradleDsl>({
      message: 'Select a Gradle DSL',
      initialValue: 'groovy',
      options: [
        { value: 'groovy', label: 'Groovy', hint: 'build.gradle' },
        { value: 'kotlin', label: 'Kotlin', hint: 'build.gradle.kts' },
      ],
    }),
  );
}

/** Ask which source language to use. */
export async function askLanguage(
  args: ParsedArgs,
  template: ProjectTemplate,
): Promise<Language> {
  // A git template is copied verbatim, so its language comes from the template.
  if (template.kind === 'template') return args.language ?? 'java';
  if (template.languages.length === 1) return template.languages[0]!;
  if (args.language) return args.language;
  return unwrap(
    await p.select<Language>({
      message: 'Select a language',
      initialValue: template.languages[0]!,
      options: template.languages.map((value) => ({
        value,
        label: languageLabel(value),
        ...(value === 'java' ? { hint: 'the default choice' } : {}),
      })),
    }),
  );
}

/** The build coordinates shown on start.spring.io's Project Metadata panel. */
export interface Coordinates {
  groupId: string;
  artifactId: string;
  packageName: string;
  version: string;
  description: string;
}

/**
 * Ask for the build coordinates.
 *
 * A git template is copied verbatim, so its coordinates come from the template
 * itself; asking would be pure noise, and the values are derived for the summary
 * only.
 */
export async function askCoordinates(
  args: ParsedArgs,
  name: string,
  template: ProjectTemplate,
): Promise<Coordinates> {
  const isTemplate = template.kind === 'template';

  const artifactId =
    args.artifactId ??
    (isTemplate
      ? deriveArtifactId(name)
      : unwrap(
          await p.text({
            message: 'Artifact id',
            placeholder: deriveArtifactId(name),
            defaultValue: deriveArtifactId(name),
            validate: defaultable((value) => validateArtifactId(value)),
          }),
        ));

  const groupId =
    args.groupId ??
    (isTemplate
      ? 'com.example'
      : unwrap(
          await p.text({
            message: 'Group id',
            placeholder: 'com.example',
            defaultValue: 'com.example',
            validate: defaultable((value) => validateGroupId(value)),
          }),
        ));

  const packageName =
    args.packageName ??
    (isTemplate
      ? derivePackageName(groupId, artifactId)
      : unwrap(
          await p.text({
            message: 'Package name',
            placeholder: derivePackageName(groupId, artifactId),
            defaultValue: derivePackageName(groupId, artifactId),
            validate: defaultable((value) => validateGroupId(value)),
          }),
        ));

  return {
    groupId,
    artifactId,
    packageName,
    version: args.version ?? '0.0.1-SNAPSHOT',
    description: args.description ?? '',
  };
}

/** Ask for the archive type. */
export async function askPackaging(
  args: ParsedArgs,
  template: ProjectTemplate,
): Promise<Packaging> {
  if (args.packaging) return args.packaging;
  if (template.kind === 'template') return 'jar';
  return unwrap(
    await p.select<Packaging>({
      message: 'Select packaging',
      initialValue: 'jar',
      options: [
        { value: 'jar', label: 'Jar', hint: 'library or executable application' },
        { value: 'war', label: 'War', hint: 'deploy to a servlet container' },
      ],
    }),
  );
}

/** Ask for the Spring Boot configuration file format. */
export async function askConfigFormat(
  args: ParsedArgs,
  template: ProjectTemplate,
): Promise<ConfigFormat> {
  if (args.configFormat) return args.configFormat;
  if (template.kind !== 'springboot') return 'properties';
  return unwrap(
    await p.select<ConfigFormat>({
      message: 'Select a configuration file format',
      initialValue: 'properties',
      options: [
        { value: 'properties', label: 'Properties', hint: 'application.properties' },
        { value: 'yaml', label: 'YAML', hint: 'application.yaml' },
      ],
    }),
  );
}

/** Ask for the Java release. */
export async function askJavaVersion(
  args: ParsedArgs,
  template: ProjectTemplate,
  metadata: InitializrMetadata | undefined,
): Promise<string> {
  // For Boot projects the choices come from Initializr, so they always match
  // what the service will accept.
  const available = metadata?.javaVersion.values.map((v) => v.id);
  if (args.javaVersion) return args.javaVersion;
  if (template.kind === 'template') return initialJavaVersion(available, metadata?.javaVersion.default);

  const choices = available ?? [...JAVA_VERSIONS];
  return unwrap(
    await p.select<string>({
      message: 'Select a Java version',
      initialValue: initialJavaVersion(available, metadata?.javaVersion.default),
      options: choices.map((value) => ({
        value,
        label: value,
        ...(value === '25' ? { hint: 'current LTS' } : {}),
      })),
    }),
  );
}

/** Ask for the Spring Boot release, including milestones when offered. */
export async function askBootVersion(
  args: ParsedArgs,
  template: ProjectTemplate,
  metadata: InitializrMetadata | undefined,
): Promise<string> {
  if (args.bootVersion) return args.bootVersion;
  if (template.kind !== 'springboot' || !metadata) return DEFAULT_BOOT_VERSION;
  return unwrap(
    await p.select<string>({
      message: 'Select a Spring Boot version',
      initialValue: metadata.bootVersion.default,
      options: metadata.bootVersion.values.map((v) => ({ value: v.id, label: v.name })),
    }),
  );
}

/** Ask which dependencies to include. */
export async function askDependencies(
  args: ParsedArgs,
  template: ProjectTemplate,
  metadata: InitializrMetadata | undefined,
): Promise<{ bootDependencies: string[]; dependencies: string[] }> {
  if (template.kind === 'springboot') {
    if (args.bootDependencies !== undefined) {
      return { bootDependencies: args.bootDependencies, dependencies: args.dependencies ?? [] };
    }
    return { bootDependencies: await askBootDependencies(metadata), dependencies: args.dependencies ?? [] };
  }
  if (template.kind === 'template') {
    return { bootDependencies: [], dependencies: args.dependencies ?? [] };
  }
  if (args.dependencies !== undefined) {
    return { bootDependencies: [], dependencies: args.dependencies };
  }
  return { bootDependencies: [], dependencies: await askCatalogDependencies() };
}

/** Ask which Spring Boot starters to include. */
async function askBootDependencies(metadata: InitializrMetadata | undefined): Promise<string[]> {
  const collected: [string, { value: string; label: string; hint?: string }[]][] = [];

  if (metadata) {
    for (const group of metadata.dependencies.values) {
      // Skip vendor-specific groups that are rarely wanted in a fresh project.
      if (/Tanzu|Azure|Google Cloud/i.test(group.name)) continue;
      const options = group.values.map((dep) => ({
        value: dep.id,
        label: dep.name,
        ...(dep.description ? { hint: dep.description.slice(0, 90) } : {}),
      }));
      if (options.length > 0) collected.push([group.name, options]);
    }
  } else {
    for (const group of FALLBACK_BOOT_GROUPS) {
      collected.push([
        group.name,
        group.values.map((dep) => ({
          value: dep.id,
          label: dep.name,
          ...(dep.description ? { hint: dep.description } : {}),
        })),
      ]);
    }
  }

  const groups: Record<string, { value: string; label: string; hint?: string }[]> = {};
  for (const [groupName, options] of orderGroups(collected)) groups[groupName] = options;

  const selected = unwrap(
    await p.groupMultiselect<string>({
      message: 'Select dependencies',
      options: groups,
      required: false,
      maxItems: 12,
      // Off by default: space on a group header would otherwise select every
      // starter in the group, which for "Web" picks several mutually
      // incompatible starters and makes Initializr reject the request.
      selectableGroups: false,
    }),
  );

  for (const warning of persistenceWarnings(selected)) p.log.warn(warning);
  return selected;
}

/** Ask which catalog dependencies to include in a plain Maven/Gradle project. */
async function askCatalogDependencies(): Promise<string[]> {
  const groups: Record<string, { value: string; label: string; hint?: string }[]> = {};
  for (const { group, items } of catalogGroups()) {
    groups[group] = items.map((dep) => ({
      value: dep.id,
      label: dep.name,
      ...(dep.hint ? { hint: dep.hint } : {}),
    }));
  }

  return unwrap(
    await p.groupMultiselect<string>({
      message: 'Select dependencies',
      options: groups,
      required: false,
      initialValues: ['junit5'],
      maxItems: 12,
      selectableGroups: false,
    }),
  );
}

/** Ask whether to create a multi-module project, and for the module names. */
export async function askModules(
  args: ParsedArgs,
  template: ProjectTemplate,
): Promise<{ modules: string[]; multiModule: boolean }> {
  if (args.modules !== undefined && args.modules.length > 0) {
    return { modules: args.modules, multiModule: true };
  }
  if (args.multiModule) return { modules: args.modules ?? [], multiModule: true };
  if (template.kind === 'springboot' || template.kind === 'template') {
    return { modules: [], multiModule: false };
  }

  const wantsModules = unwrap(
    await p.confirm({ message: 'Create a multi-module project?', initialValue: false }),
  );
  if (!wantsModules) return { modules: [], multiModule: false };

  const raw = unwrap(
    await p.text({
      message: 'Module names',
      placeholder: 'core, web',
      validate: (value) => {
        const names = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (names.length === 0) return 'enter at least one module name';
        for (const candidate of names) {
          const result = validateModuleName(candidate);
          if (!result.ok) return `${candidate}: ${result.message}`;
        }
        return undefined;
      },
    }),
  );
  return { modules: raw.split(',').map((s) => s.trim()).filter(Boolean), multiModule: true };
}

/** Human readable summary shown before generating. */
export function summarise(config: {
  name: string;
  kind: ProjectKind;
  template?: string;
  buildTool: BuildTool;
  dsl: GradleDsl;
  language: Language;
  javaVersion: string;
  bootVersion: string;
  groupId: string;
  artifactId: string;
  packageName: string;
  modules: string[];
  bootDependencies: string[];
  dependencies: string[];
}): string {
  const lines: string[] = [];
  const push = (label: string, value: string | undefined): void => {
    if (value) lines.push(`${label.padEnd(14)} ${value}`);
  };
  push('Project', config.name);
  if (config.template) {
    push('Template', config.template);
  } else {
    push('Type', config.kind);
    push('Build', config.buildTool === 'gradle' ? `Gradle (${config.dsl} DSL)` : 'Maven');
    push('Language', config.language);
    push('Java', config.javaVersion);
    if (config.kind === 'springboot') push('Spring Boot', config.bootVersion);
  }
  push('Group', config.groupId);
  push('Artifact', config.artifactId);
  push('Package', config.packageName);
  if (config.modules.length > 0) push('Modules', config.modules.join(', '));
  if (config.bootDependencies.length > 0) push('Starters', config.bootDependencies.join(', '));
  if (config.dependencies.length > 0) push('Dependencies', config.dependencies.join(', '));
  return lines.join('\n');
}
