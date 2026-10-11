/**
 * The interactive wizard.
 *
 * This mirrors the IntelliJ IDEA "New Project" dialog: project type, language,
 * build system, coordinates and dependencies, in that order. Any value already
 * supplied on the command line is skipped, so `--spring-boot --dep web` only
 * prompts for what is still missing.
 */

import * as p from '@clack/prompts';
import path from 'node:path';
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
import type { BuildTool, GradleDsl, Language, Packaging, ProjectConfig, ProjectKind } from './types.js';
import type { ParsedArgs } from './args.js';

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
    p.intro('create-jvm — new JVM project');

    // ------------------------------------------------------------ name
    let name = args.name;
    if (!name) {
      name = unwrap(
        await p.text({
          message: 'Project name',
          placeholder: 'demo',
          defaultValue: 'demo',
          validate: (value) => {
            const result = validateProjectName(value ?? '');
            return result.ok ? undefined : result.message;
          },
        }),
      );
    }
    const targetDir = name === '.' ? cwd : path.resolve(cwd, name);

    // ------------------------------------------------------------ kind
    let kind: ProjectKind;
    if (args.template) {
      kind = 'template';
    } else if (args.kind) {
      kind = args.kind;
    } else {
      kind = unwrap(
        await p.select<ProjectKind>({
          message: 'Project type',
          initialValue: 'springboot',
          options: [
            {
              value: 'springboot',
              label: 'Spring Boot',
              hint: 'start.spring.io — starters, auto-config, embedded server',
            },
            { value: 'maven', label: 'Maven', hint: 'plain Maven project (jar or war)' },
            { value: 'gradle', label: 'Gradle', hint: 'plain Gradle project, Groovy or Kotlin DSL' },
          ],
        }),
      );
    }

    // ---------------------------------------------------------- template
    if (kind === 'template') {
      let template = args.template;
      if (!template) {
        template = unwrap(
          await p.text({
            message: 'Template',
            placeholder: 'gh:owner/repo',
            validate: (value) => (value?.trim() ? undefined : 'a template spec is required'),
          }),
        );
      }
      const coordinates = await askCoordinates(args, name);
      p.note(summarise({ ...coordinates, kind, name, template }), 'Summary');
      const git = await askGit(args);
      const install = await askInstall(args);
      return buildConfig({
        kind,
        name,
        targetDir,
        args,
        coordinates,
        template,
        git,
        install,
      });
    }

    // -------------------------------------------------------- build tool
    let buildTool: BuildTool;
    if (kind === 'springboot') {
      buildTool = args.buildTool ?? 'maven';
      if (!args.buildTool) {
        buildTool = unwrap(
          await p.select<BuildTool>({
            message: 'Build system',
            initialValue: 'maven',
            options: [
              { value: 'maven', label: 'Maven', hint: 'pom.xml' },
              { value: 'gradle', label: 'Gradle', hint: 'build.gradle / build.gradle.kts' },
            ],
          }),
        );
      }
    } else if (kind === 'gradle') {
      buildTool = 'gradle';
    } else {
      buildTool = 'maven';
    }

    // ----------------------------------------------------------- language
    let language: Language;
    if (args.language) {
      language = args.language;
    } else if (kind === 'springboot') {
      language = unwrap(
        await p.select<Language>({
          message: 'Language',
          initialValue: 'java',
          options: [
            { value: 'java', label: 'Java' },
            { value: 'kotlin', label: 'Kotlin' },
            { value: 'groovy', label: 'Groovy' },
          ],
        }),
      );
    } else {
      language = unwrap(
        await p.select<Language>({
          message: 'Language',
          initialValue: 'java',
          options: [
            { value: 'java', label: 'Java' },
            { value: 'kotlin', label: 'Kotlin' },
            { value: 'groovy', label: 'Groovy' },
          ],
        }),
      );
    }

    // -------------------------------------------------------------- DSL
    let dsl: GradleDsl = args.dsl ?? 'groovy';
    if (buildTool === 'gradle' && !args.dsl) {
      dsl = unwrap(
        await p.select<GradleDsl>({
          message: 'Gradle DSL',
          initialValue: 'groovy',
          options: [
            { value: 'groovy', label: 'Groovy', hint: 'build.gradle' },
            { value: 'kotlin', label: 'Kotlin', hint: 'build.gradle.kts' },
          ],
        }),
      );
    }

    // -------------------------------------------------------- packaging
    let packaging: Packaging = args.packaging ?? 'jar';
    if (!args.packaging && kind !== 'springboot') {
      packaging = unwrap(
        await p.select<Packaging>({
          message: 'Packaging',
          initialValue: 'jar',
          options: [
            { value: 'jar', label: 'Jar', hint: 'library or executable application' },
            { value: 'war', label: 'War', hint: 'deploy to a servlet container' },
          ],
        }),
      );
    }

    // ------------------------------------------------------- java version
    let javaVersion = args.javaVersion;
    let metadata: InitializrMetadata | undefined;
    if (kind === 'springboot') {
      metadata = await loadMetadataQuietly();
    }
    if (!javaVersion) {
      const choices = metadata
        ? metadata.javaVersion.values.map((v) => v.id)
        : [...JAVA_VERSIONS];
      javaVersion = unwrap(
        await p.select<string>({
          message: 'Java version',
          initialValue: metadata?.javaVersion.default ?? '21',
          options: choices.map((value) => ({
            value,
            label: value,
            ...(value === '25' ? { hint: 'current LTS' } : {}),
          })),
        }),
      );
    }

    // ------------------------------------------------------- boot version
    let bootVersion: string;
    if (kind === 'springboot') {
      if (args.bootVersion) {
        bootVersion = args.bootVersion;
      } else if (metadata) {
        bootVersion = unwrap(
          await p.select<string>({
            message: 'Spring Boot version',
            initialValue: metadata.bootVersion.default,
            options: metadata.bootVersion.values.map((v) => ({ value: v.id, label: v.name })),
          }),
        );
      } else {
        bootVersion = DEFAULT_BOOT_VERSION;
      }
    } else {
      bootVersion = args.bootVersion ?? DEFAULT_BOOT_VERSION;
    }

    // -------------------------------------------------------- coordinates
    const coordinates = await askCoordinates(args, name);

    // ------------------------------------------------------- dependencies
    let bootDependencies: string[] = args.bootDependencies ?? [];
    let dependencies: string[] = args.dependencies ?? [];
    if (kind === 'springboot' && !args.bootDependencies) {
      bootDependencies = await askBootDependencies(metadata);
    } else if (kind !== 'springboot' && !args.dependencies) {
      dependencies = await askCatalogDependencies();
    }

    // ------------------------------------------------------- multi module
    let modules = args.modules ?? [];
    let multiModule = args.multiModule ?? false;
    if (!args.modules && !args.multiModule && kind !== 'springboot') {
      const wantsModules = unwrap(
        await p.confirm({
          message: 'Create a multi-module project?',
          initialValue: false,
        }),
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

    const git = await askGit(args);
    const install = await askInstall(args);

    const config = buildConfig({
      kind,
      name,
      targetDir,
      args,
      coordinates,
      buildTool,
      dsl,
      language,
      packaging,
      javaVersion,
      bootVersion,
      dependencies,
      bootDependencies,
      modules,
      multiModule,
      git,
      install,
    });

    p.note(summarise(config), 'Summary');
    return config;
  } catch (error) {
    if (error instanceof CancelledError) {
      p.cancel('Operation cancelled.');
      return undefined;
    }
    throw error;
  }
}

/** Prompt for groupId / artifactId, defaulting from the project name. */
async function askCoordinates(
  args: ParsedArgs,
  name: string,
): Promise<{ groupId: string; artifactId: string; packageName: string; version: string; description: string }> {
  const groupId =
    args.groupId ??
    unwrap(
      await p.text({
        message: 'Group id',
        placeholder: 'com.example',
        defaultValue: 'com.example',
        validate: (value) => {
          const result = validateGroupId(value ?? '');
          return result.ok ? undefined : result.message;
        },
      }),
    );

  const artifactId =
    args.artifactId ??
    unwrap(
      await p.text({
        message: 'Artifact id',
        placeholder: deriveArtifactId(name),
        defaultValue: deriveArtifactId(name),
        validate: (value) => {
          const result = validateArtifactId(value ?? '');
          return result.ok ? undefined : result.message;
        },
      }),
    );

  const packageName = args.packageName ?? derivePackageName(groupId, artifactId);

  return {
    groupId,
    artifactId,
    packageName,
    version: args.version ?? '0.0.1-SNAPSHOT',
    description: args.description ?? '',
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

/** Ask which Spring Boot starters to include. */
async function askBootDependencies(metadata: InitializrMetadata | undefined): Promise<string[]> {
  const groups: Record<string, { value: string; label: string; hint?: string }[]> = {};

  if (metadata) {
    for (const group of metadata.dependencies.values) {
      // Skip vendor-specific groups that are rarely wanted in a fresh project.
      if (/Tanzu|Azure|Google Cloud/i.test(group.name)) continue;
      const options = group.values.map((dep) => ({
        value: dep.id,
        label: dep.name,
        ...(dep.description ? { hint: dep.description.slice(0, 90) } : {}),
      }));
      if (options.length > 0) groups[group.name] = options;
    }
  } else {
    for (const group of FALLBACK_BOOT_GROUPS) {
      groups[group.name] = group.values.map((dep) => ({
        value: dep.id,
        label: dep.name,
        ...(dep.description ? { hint: dep.description } : {}),
      }));
    }
  }

  const selected = unwrap(
    await p.groupMultiselect<string>({
      message: 'Dependencies',
      options: groups,
      required: false,
      maxItems: 12,
    }),
  );

  for (const warning of persistenceWarnings(selected)) p.log.warn(warning);
  return selected;
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
      message: 'Dependencies',
      options: groups,
      required: false,
      initialValues: ['junit5'],
      maxItems: 12,
    }),
  );
  return selected;
}

/** Ask whether to initialise a git repository. */
async function askGit(args: ParsedArgs): Promise<boolean> {
  if (args.git !== undefined) return args.git;
  return unwrap(
    await p.confirm({
      message: 'Initialise a git repository?',
      initialValue: true,
    }),
  );
}

/** Ask whether to run a build after generating. */
async function askInstall(args: ParsedArgs): Promise<boolean> {
  if (args.install !== undefined) return args.install;
  return unwrap(
    await p.confirm({
      message: 'Run a build now to verify the project?',
      initialValue: false,
    }),
  );
}

interface BuildConfigInput {
  kind: ProjectKind;
  name: string;
  targetDir: string;
  args: ParsedArgs;
  coordinates: { groupId: string; artifactId: string; packageName: string; version: string; description: string };
  buildTool?: BuildTool;
  dsl?: GradleDsl;
  language?: Language;
  packaging?: Packaging;
  javaVersion?: string;
  bootVersion?: string;
  dependencies?: string[];
  bootDependencies?: string[];
  modules?: string[];
  multiModule?: boolean;
  template?: string;
  git: boolean;
  install: boolean;
}

/** Assemble a ProjectConfig from wizard answers. */
function buildConfig(input: BuildConfigInput): ProjectConfig {
  const { args, coordinates } = input;
  const kind = input.kind;
  const buildTool: BuildTool =
    input.buildTool ?? (kind === 'gradle' ? 'gradle' : kind === 'maven' ? 'maven' : 'maven');

  return {
    kind,
    name: input.name,
    targetDir: input.targetDir,
    buildTool,
    dsl: input.dsl ?? 'groovy',
    language: input.language ?? 'java',
    packaging: input.packaging ?? 'jar',
    groupId: coordinates.groupId,
    artifactId: coordinates.artifactId,
    version: coordinates.version,
    javaVersion: input.javaVersion ?? args.javaVersion ?? '21',
    kotlinVersion: args.kotlinVersion ?? VERSIONS.kotlin,
    bootVersion: input.bootVersion ?? args.bootVersion ?? '4.1.1',
    packageName: coordinates.packageName,
    description: coordinates.description,
    dependencies: input.dependencies ?? args.dependencies ?? [],
    bootDependencies: input.bootDependencies ?? args.bootDependencies ?? [],
    multiModule: input.multiModule ?? false,
    modules: input.modules ?? [],
    shade: false,
    ...(input.template ? { template: input.template } : {}),
    git: input.git,
    install: input.install,
    dryRun: args.dryRun ?? false,
    force: args.force ?? false,
  };
}

/** Human readable summary shown before generating. */
function summarise(config: Partial<ProjectConfig>): string {
  const lines: string[] = [];
  const push = (label: string, value: string | undefined): void => {
    if (value) lines.push(`${label.padEnd(14)} ${value}`);
  };
  push('Project', config.name);
  push('Type', config.kind);
  if (config.template) push('Template', config.template);
  if (config.kind !== 'template') {
    push('Build', config.buildTool === 'gradle' ? `Gradle (${config.dsl} DSL)` : 'Maven');
    push('Language', config.language);
    push('Java', config.javaVersion);
    if (config.kind === 'springboot') push('Spring Boot', config.bootVersion);
  }
  push('Group', config.groupId);
  push('Artifact', config.artifactId);
  push('Package', config.packageName);
  if (config.modules && config.modules.length > 0) push('Modules', config.modules.join(', '));
  if (config.bootDependencies && config.bootDependencies.length > 0) {
    push('Starters', config.bootDependencies.join(', '));
  }
  if (config.dependencies && config.dependencies.length > 0) {
    push('Dependencies', config.dependencies.join(', '));
  }
  return lines.join('\n');
}

/** Expose the catalog size for the wizard intro. */
export const wizardCatalogSize = CATALOG.length;
