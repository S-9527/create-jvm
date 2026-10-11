/**
 * The interactive wizard.
 *
 * Shaped like `create-vite`: ask for a name, present one flat list of project
 * types, then walk the "Project Metadata" panel start.spring.io shows — build
 * system, language, group, artifact, package name, packaging, configuration
 * format, Java and Boot version — and finally the dependencies.
 *
 * Every metadata prompt is pre-filled with the value that would have been
 * derived anyway, so the defaults are one Enter press each. Anything already
 * supplied on the command line is skipped, so `--spring-boot --dep web` only
 * prompts for what is still missing.
 */

import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { CATALOG, catalogGroups } from './catalog.js';
import {
  deriveArtifactId,
  derivePackageName,
  validateArtifactId,
  validateGroupId,
  validateModuleName,
  validateProjectName,
} from './util/naming.js';
import { JAVA_VERSIONS, DEFAULT_BOOT_VERSION, VERSIONS } from './versions.js';
import { fetchMetadata, type InitializrMetadata } from './generators/initializr.js';
import type {
  BuildTool,
  ConfigFormat,
  GradleDsl,
  Language,
  Packaging,
  ProjectConfig,
  ProjectKind,
} from './types.js';
import type { ParsedArgs } from './args.js';

/** One entry in the project-type list. */
export interface ProjectTemplate {
  value: string;
  label: string;
  hint: string;
  /** Which generator produces the project. */
  kind: ProjectKind;
  /** Build tools this framework supports, in preference order. */
  buildTools: BuildTool[];
  /** Source languages this framework supports, in preference order. */
  languages: Language[];
}

/**
 * The project types offered up front.
 *
 * Only the framework is chosen here; the build system is a separate question,
 * which is the order the IntelliJ IDEA wizard uses. Keeping them apart avoids
 * an explosion of entries ("Spring Boot > Gradle > Kotlin DSL > ...") and means
 * adding a language never doubles the length of this list.
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    value: 'spring-boot',
    label: pc.green('Spring Boot'),
    hint: 'start.spring.io — starters, auto-config, embedded server',
    kind: 'springboot',
    buildTools: ['maven', 'gradle'],
    languages: ['java', 'kotlin', 'groovy'],
  },
  {
    value: 'maven',
    label: pc.yellow('Maven'),
    hint: 'no framework, jar or war',
    kind: 'maven',
    buildTools: ['maven'],
    languages: ['java', 'kotlin', 'groovy'],
  },
  {
    value: 'gradle',
    label: pc.blue('Gradle'),
    hint: 'no framework, Groovy or Kotlin DSL',
    kind: 'gradle',
    buildTools: ['gradle'],
    languages: ['java', 'kotlin', 'groovy'],
  },
  {
    value: 'template',
    label: pc.magenta('Git template'),
    hint: 'gh:owner/repo, gitlab:, bitbucket: or a git URL',
    kind: 'template',
    buildTools: ['maven'],
    languages: ['java'],
  },
];

/** Human label for a source language. */
function languageLabel(language: Language): string {
  switch (language) {
    case 'kotlin':
      return pc.magenta('Kotlin');
    case 'groovy':
      return pc.green('Groovy');
    default:
      return pc.yellow('Java');
  }
}

/** Fallback Spring Boot starters used when Initializr is unreachable. */
const FALLBACK_BOOT_GROUPS: { name: string; values: { id: string; name: string; description?: string }[] }[] = [
  {
    name: 'Developer Tools',
    values: [
      { id: 'devtools', name: 'Spring Boot DevTools', description: 'Automatic restart and live reload' },
      { id: 'lombok', name: 'Lombok', description: 'Boilerplate reduction' },
      { id: 'configuration-processor', name: 'Spring Configuration Processor', description: 'Metadata for custom properties' },
      { id: 'docker-compose', name: 'Docker Compose Support', description: 'Manage services with Docker Compose' },
    ],
  },
  {
    name: 'Web',
    values: [
      { id: 'web', name: 'Spring Web', description: 'Build web applications with Spring MVC' },
      { id: 'webflux', name: 'Spring Reactive Web', description: 'Reactive web applications with WebFlux' },
      { id: 'graphql', name: 'Spring for GraphQL', description: 'Build GraphQL services' },
    ],
  },
  {
    name: 'Template Engines',
    values: [
      { id: 'thymeleaf', name: 'Thymeleaf', description: 'Server side template engine' },
      { id: 'freemarker', name: 'Apache FreeMarker', description: 'Template engine' },
      { id: 'mustache', name: 'Mustache', description: 'Logic-less templates' },
    ],
  },
  {
    name: 'Security',
    values: [
      { id: 'security', name: 'Spring Security', description: 'Authentication and access control' },
      { id: 'oauth2-client', name: 'OAuth2 Client', description: 'OAuth2 / OIDC login' },
      { id: 'oauth2-resource-server', name: 'OAuth2 Resource Server', description: 'Protect APIs with JWT' },
    ],
  },
  {
    name: 'SQL',
    values: [
      { id: 'data-jpa', name: 'Spring Data JPA', description: 'Persist data with JPA and Hibernate' },
      { id: 'jdbc', name: 'JDBC API', description: 'Plain JDBC access' },
      { id: 'flyway', name: 'Flyway Migration', description: 'Versioned database migrations' },
      { id: 'liquibase', name: 'Liquibase Migration', description: 'Database schema change management' },
      { id: 'h2', name: 'H2 Database', description: 'Embedded in-memory database' },
      { id: 'postgresql', name: 'PostgreSQL Driver', description: 'PostgreSQL JDBC driver' },
      { id: 'mysql', name: 'MySQL Driver', description: 'MySQL JDBC driver' },
    ],
  },
  {
    name: 'NoSQL',
    values: [
      { id: 'data-redis', name: 'Spring Data Redis', description: 'Redis key-value store' },
      { id: 'data-mongodb', name: 'Spring Data MongoDB', description: 'MongoDB document store' },
      { id: 'elasticsearch', name: 'Elasticsearch Client', description: 'Search and analytics engine' },
    ],
  },
  {
    name: 'Messaging',
    values: [
      { id: 'kafka', name: 'Spring for Apache Kafka', description: 'Publish and consume Kafka messages' },
      { id: 'rabbitmq', name: 'Spring for RabbitMQ', description: 'AMQP messaging' },
      { id: 'amqp', name: 'Spring AMQP', description: 'Advanced Message Queuing Protocol' },
      { id: 'websocket', name: 'WebSocket', description: 'Bidirectional communication' },
    ],
  },
  {
    name: 'I/O',
    values: [
      { id: 'validation', name: 'Validation', description: 'Bean validation with Hibernate Validator' },
      { id: 'batch', name: 'Spring Batch', description: 'Batch processing' },
      { id: 'mail', name: 'Java Mail Sender', description: 'Send email' },
      { id: 'quartz', name: 'Quartz Scheduler', description: 'Schedule jobs' },
      { id: 'cache', name: 'Spring Cache Abstraction', description: 'Caching support' },
    ],
  },
  {
    name: 'Ops',
    values: [
      { id: 'actuator', name: 'Spring Boot Actuator', description: 'Production ready features' },
      { id: 'sbom-cyclone-dx', name: 'CycloneDX SBOM support', description: 'Generate a software bill of materials' },
    ],
  },
  {
    name: 'Observability',
    values: [
      { id: 'prometheus', name: 'Prometheus', description: 'Export metrics to Prometheus' },
      { id: 'zipkin', name: 'Zipkin', description: 'Distributed tracing' },
    ],
  },
  {
    name: 'Testing',
    values: [
      { id: 'testcontainers', name: 'Testcontainers', description: 'Docker containers in tests' },
      { id: 'restdocs', name: 'Spring REST Docs', description: 'Document RESTful services' },
    ],
  },
];

/** Abort the wizard because the user pressed Ctrl-C. */
class CancelledError extends Error {
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
function unwrap<T>(value: T | typeof p.CANCEL_SYMBOL): T {
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
function defaultable(
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

export interface WizardInput {
  args: ParsedArgs;
  /** Working directory the project directory is resolved against. */
  cwd: string;
}

/**
 * Run the wizard and produce a complete configuration.
 *
 * @returns the configuration, or `undefined` when the user cancelled.
 */
export async function runWizard(input: WizardInput): Promise<ProjectConfig | undefined> {
  const { args, cwd } = input;
  try {
    p.intro(pc.bgCyan(pc.black(' create-jvm ')) + pc.dim(' the JVM project scaffolder'));

    // --------------------------------------------------------------- name
    const name =
      args.name ??
      unwrap(
        await p.text({
          message: 'Project name',
          placeholder: 'demo',
          defaultValue: 'demo',
          validate: defaultable((value) => validateProjectName(value)),
        }),
      );

    // --------------------------------------------------------------- type
    const template =
      args.template !== undefined
        ? PROJECT_TEMPLATES.find((t) => t.value === 'template')!
        : args.kind !== undefined
          ? matchTemplateFromArgs(args)
          : unwrap(
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

    // ------------------------------------------------------------- target
    const targetDir = name === '.' ? cwd : path.resolve(cwd, name);

    // ------------------------------------------------------ template spec
    let templateSpec = args.template;
    if (template.kind === 'template' && !templateSpec) {
      templateSpec = unwrap(
        await p.text({
          message: 'Template',
          placeholder: 'gh:owner/repo',
          validate: (value) => (value?.trim() ? undefined : 'a template spec is required'),
        }),
      );
    }

    // --------------------------------------------------------- boot setup
    let metadata: InitializrMetadata | undefined;
    if (template.kind === 'springboot') metadata = await loadMetadataQuietly();

    // ---------------------------------------------------------- build tool
    // Asked separately from the project type, matching the IDE wizard. Skipped
    // when the framework only supports one build system.
    let buildTool: BuildTool;
    if (template.buildTools.length === 1) {
      buildTool = template.buildTools[0]!;
    } else if (args.buildTool) {
      buildTool = args.buildTool;
    } else {
      buildTool = unwrap(
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

    // ---------------------------------------------------------------- DSL
    let dsl: GradleDsl = args.dsl ?? 'groovy';
    if (buildTool === 'gradle' && !args.dsl) {
      dsl = unwrap(
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

    // ------------------------------------------------------------ language
    let language: Language;
    if (template.kind === 'template') {
      language = args.language ?? 'java';
    } else if (template.languages.length === 1) {
      language = template.languages[0]!;
    } else if (args.language) {
      language = args.language;
    } else {
      language = unwrap(
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

    // ------------------------------------------------------- project metadata
    // Mirrors start.spring.io's "Project Metadata" panel: group, artifact,
    // package name, packaging, configuration format, Java and Boot version.
    // Every prompt carries the value that would have been derived anyway, so
    // accepting the defaults is a plain sequence of Enter presses — but the
    // choice is always available rather than hidden behind "Others".
    // A git template is copied verbatim, so its build coordinates come from the
    // template itself. Asking for them would be pure noise, so the prompts are
    // skipped and the values are derived for the summary only.
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

    const coordinates = {
      groupId,
      artifactId,
      packageName,
      version: args.version ?? '0.0.1-SNAPSHOT',
      description: args.description ?? '',
    };

    // Packaging applies to Boot and plain builds alike.
    let packaging: Packaging = args.packaging ?? 'jar';
    if (!args.packaging && template.kind !== 'template') {
      packaging = unwrap(
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

    // Configuration format only exists for Spring Boot; it selects between
    // application.properties and application.yaml.
    let configFormat: ConfigFormat = args.configFormat ?? 'properties';
    if (template.kind === 'springboot' && !args.configFormat) {
      configFormat = unwrap(
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

    // Java release. For Boot projects the choices come from Initializr so they
    // always match what the service will accept.
    let javaVersion = args.javaVersion ?? metadata?.javaVersion.default ?? '21';
    if (!args.javaVersion && template.kind !== 'template') {
      const choices = metadata ? metadata.javaVersion.values.map((v) => v.id) : [...JAVA_VERSIONS];
      javaVersion = unwrap(
        await p.select<string>({
          message: 'Select a Java version',
          initialValue: metadata?.javaVersion.default ?? '21',
          options: choices.map((value) => ({
            value,
            label: value,
            ...(value === '25' ? { hint: 'current LTS' } : {}),
          })),
        }),
      );
    }

    // Spring Boot release, including milestones and snapshots when Initializr
    // advertises them.
    let bootVersion = args.bootVersion ?? metadata?.bootVersion.default ?? DEFAULT_BOOT_VERSION;
    if (template.kind === 'springboot' && !args.bootVersion && metadata) {
      bootVersion = unwrap(
        await p.select<string>({
          message: 'Select a Spring Boot version',
          initialValue: metadata.bootVersion.default,
          options: metadata.bootVersion.values.map((v) => ({ value: v.id, label: v.name })),
        }),
      );
    }

    // --------------------------------------------------------- dependencies
    let bootDependencies: string[] = args.bootDependencies ?? [];
    let dependencies: string[] = args.dependencies ?? [];
    if (template.kind === 'springboot' && args.bootDependencies === undefined) {
      bootDependencies = await askBootDependencies(metadata);
    } else if (template.kind !== 'springboot' && template.kind !== 'template' && args.dependencies === undefined) {
      dependencies = await askCatalogDependencies();
    }

    // ------------------------------------------------------------- modules
    let modules = args.modules ?? [];
    let multiModule = args.multiModule ?? false;
    if (template.kind !== 'springboot' && template.kind !== 'template' && args.modules === undefined && !args.multiModule) {
      const wantsModules = unwrap(
        await p.confirm({ message: 'Create a multi-module project?', initialValue: false }),
      );
      if (wantsModules) {
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
        modules = raw.split(',').map((s) => s.trim()).filter(Boolean);
        multiModule = true;
      }
    }

    // ------------------------------------------------------- git / install
    const git = args.git ?? true;
    const install = args.install ?? false;

    const kind: ProjectKind = template.kind;

    const config: ProjectConfig = {
      kind,
      name,
      targetDir,
      buildTool,
      dsl,
      language,
      packaging,
      configFormat,
      groupId: coordinates.groupId,
      artifactId: coordinates.artifactId,
      version: coordinates.version,
      javaVersion,
      kotlinVersion: args.kotlinVersion ?? VERSIONS.kotlin,
      bootVersion,
      packageName: coordinates.packageName,
      description: coordinates.description,
      dependencies,
      bootDependencies,
      multiModule,
      modules,
      shade: false,
      ...(templateSpec ? { template: templateSpec } : {}),
      git,
      install,
      dryRun: args.dryRun ?? false,
      force: args.force ?? false,
    };

    p.note(summarise(config), 'Summary');
    p.outro(
      `${pc.green('Ready.')} ${pc.dim('Generating')} ${pc.cyan(config.name)}${pc.dim('…')}`,
    );
    return config;
  } catch (error) {
    if (error instanceof CancelledError) {
      p.cancel('Operation cancelled.');
      return undefined;
    }
    throw error;
  }
}

/** Pick the template entry matching flags already supplied. */
function matchTemplateFromArgs(args: ParsedArgs): ProjectTemplate {
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

/** Fetch Initializr metadata, returning `undefined` instead of throwing. */
async function loadMetadataQuietly(): Promise<InitializrMetadata | undefined> {
  try {
    return await fetchMetadata();
  } catch {
    p.log.warn('Could not reach Spring Initializr; falling back to a built-in starter list.');
    return undefined;
  }
}

/**
 * Preferred display order for Initializr dependency groups.
 *
 * Initializr lists "Developer Tools" first, whose first entry is GraalVM Native
 * Support. Since the picker opens on the first option of the first group, that
 * makes the most likely accidental selection an exotic one. Ordering the groups
 * by how often they are actually wanted puts Spring Web under the cursor.
 */
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

/** Sort dependency groups into the preferred order, unknown groups last. */
function orderGroups<T>(groups: [string, T][]): [string, T][] {
  const rank = (name: string): number => {
    const index = GROUP_ORDER.indexOf(name);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...groups].sort((a, b) => {
    const diff = rank(a[0]) - rank(b[0]);
    // Preserve Initializr's own ordering within the same rank.
    return diff !== 0 ? diff : groups.findIndex((g) => g[0] === a[0]) - groups.findIndex((g) => g[0] === b[0]);
  });
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

  const selected = unwrap(
    await p.groupMultiselect<string>({
      message: 'Select dependencies',
      options: groups,
      required: false,
      initialValues: ['junit5'],
      maxItems: 12,
    }),
  );
  return selected;
}

/** Human readable summary shown before generating. */
function summarise(config: ProjectConfig): string {
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

/** Expose the catalog size for callers that report on it. */
export const wizardCatalogSize = CATALOG.length;
