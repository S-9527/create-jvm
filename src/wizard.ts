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
 * supplied on the command line is skipped, so `--spring-boot --boot-dep web`
 * only prompts for what is still missing.
 *
 * This module only sequences the questions; the questions themselves live in
 * `./wizard/prompts.ts`.
 */

import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { fetchMetadata, type InitializrMetadata } from './generators/initializr.js';
import { VERSIONS } from './versions.js';
import type { ProjectConfig } from './types.js';
import type { ParsedArgs } from './args.js';
import {
  CancelledError,
  askBootVersion,
  askBuildTool,
  askConfigFormat,
  askCoordinates,
  askDependencies,
  askGradleDsl,
  askJavaVersion,
  askLanguage,
  askModules,
  askPackaging,
  askProjectName,
  askProjectType,
  askTemplateSpec,
  summarise,
} from './wizard/prompts.js';

export { persistenceWarnings } from './wizard/prompts.js';
export { PROJECT_TEMPLATES } from './wizard/templates.js';

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

    const name = await askProjectName(args);
    const template = await askProjectType(args);
    const targetDir = name === '.' ? cwd : path.resolve(cwd, name);
    const templateSpec =
      template.kind === 'template' ? await askTemplateSpec(args) : args.template;

    // Initializr metadata drives the Java and Boot version choices, so it is
    // fetched once, up front, and only for Spring Boot projects.
    let metadata: InitializrMetadata | undefined;
    if (template.kind === 'springboot') metadata = await loadMetadataQuietly();

    const buildTool = await askBuildTool(args, template);
    const dsl = await askGradleDsl(args, buildTool);
    const language = await askLanguage(args, template);

    const coordinates = await askCoordinates(args, name, template);
    const packaging = await askPackaging(args, template);
    const configFormat = await askConfigFormat(args, template);
    const javaVersion = await askJavaVersion(args, template, metadata);
    const bootVersion = await askBootVersion(args, template, metadata);
    const { bootDependencies, dependencies } = await askDependencies(args, template, metadata);
    const { modules, multiModule } = await askModules(args, template);

    const config: ProjectConfig = {
      kind: template.kind,
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
      git: args.git ?? true,
      install: args.install ?? false,
      dryRun: args.dryRun ?? false,
      force: args.force ?? false,
    };

    p.note(summarise(config), 'Summary');
    p.outro(`${pc.green('Ready.')} ${pc.dim('Generating')} ${pc.cyan(config.name)}${pc.dim('…')}`);
    return config;
  } catch (error) {
    if (error instanceof CancelledError) {
      p.cancel('Operation cancelled.');
      return undefined;
    }
    throw error;
  }
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
