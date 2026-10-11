/**
 * Shared type definitions for create-jvm.
 */

/** Which generator produces the project. */
export type ProjectKind = 'maven' | 'gradle' | 'springboot' | 'template';

/** Build system. */
export type BuildTool = 'maven' | 'gradle';

/** Gradle build script dialect. */
export type GradleDsl = 'groovy' | 'kotlin';

/** Source language. */
export type Language = 'java' | 'kotlin' | 'groovy';

/** Archive type produced by the build. */
export type Packaging = 'jar' | 'war';

/** Spring Boot configuration file format. */
export type ConfigFormat = 'properties' | 'yaml';

/**
 * A fully resolved description of the project to generate. The interactive
 * wizard and the non-interactive flag parser both produce one of these.
 */
export interface ProjectConfig {
  kind: ProjectKind;
  /** Project name; also the default artifactId and directory name. */
  name: string;
  /** Absolute path of the directory the project is written into. */
  targetDir: string;
  buildTool: BuildTool;
  dsl: GradleDsl;
  language: Language;
  packaging: Packaging;
  /** Spring Boot configuration file format. */
  configFormat: ConfigFormat;
  groupId: string;
  artifactId: string;
  version: string;
  javaVersion: string;
  kotlinVersion: string;
  /** Spring Boot version; only meaningful for `springboot`. */
  bootVersion: string;
  packageName: string;
  description: string;
  /** Catalog ids of the selected third-party dependencies. */
  dependencies: string[];
  /** Spring Initializr dependency ids; only meaningful for `springboot`. */
  bootDependencies: string[];
  multiModule: boolean;
  modules: string[];
  /** Build a self-contained "fat" jar (Maven Shade / Gradle shadow). */
  shade: boolean;
  /** Remote template spec (`gh:user/repo`, `gitlab:...`, or a git URL). */
  template?: string;
  /** Run `git init` and create the initial commit. */
  git: boolean;
  /** Run a build after generation to verify the project. */
  install: boolean;
  /** Skip writing any files; just report what would happen. */
  dryRun: boolean;
  /** Overwrite a non-empty target directory. */
  force: boolean;
}

/** One selectable third-party dependency. */
export interface Dependency {
  /** Stable id used on the command line and in config. */
  id: string;
  /** Human readable label. */
  name: string;
  /** Grouping shown in the picker. */
  group: string;
  /** Maven coordinates. */
  groupId: string;
  artifactId: string;
  /** Explicit version; omitted when the build tool manages it. */
  version?: string;
  /** Maven `<scope>`; omitted for `compile`. */
  scope?: 'test' | 'provided' | 'runtime';
  /** Whether the dependency is only added when tests are requested. */
  testOnly?: boolean;
  /** Free-form note shown as the picker hint. */
  hint?: string;
}

/** Options threaded through the whole run. */
export interface RunContext {
  cwd: string;
  /** Emit machine readable JSON instead of human output. */
  json: boolean;
  /** Never prompt; fail when required input is missing. */
  noInput: boolean;
  /** Disable coloured output. */
  noColor: boolean;
}
