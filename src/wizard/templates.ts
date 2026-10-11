/**
 * The project types offered by the wizard.
 *
 * Only the framework is chosen here; the build system and language are separate
 * questions, which is the order the IntelliJ IDEA wizard uses. Keeping them
 * apart avoids an explosion of entries ("Spring Boot > Gradle > Kotlin DSL >
 * ...") and means adding a language never doubles the length of this list.
 */

import pc from 'picocolors';
import type { BuildTool, Language, ProjectKind } from '../types.js';

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

/** The project types offered up front. */
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
export function languageLabel(language: Language): string {
  switch (language) {
    case 'kotlin':
      return pc.magenta('Kotlin');
    case 'groovy':
      return pc.green('Groovy');
    default:
      return pc.yellow('Java');
  }
}
