import { describe, expect, it } from 'vitest';
import { initializrQuery, initializrType } from '../src/generators/initializr.js';
import { normaliseConfigFormat } from '../src/args.js';
import type { ProjectConfig } from '../src/types.js';

function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    kind: 'springboot',
    name: 'shop-api',
    targetDir: '/tmp/shop-api',
    buildTool: 'maven',
    dsl: 'groovy',
    language: 'java',
    packaging: 'jar',
    configFormat: 'properties',
    groupId: 'io.acme',
    artifactId: 'orders',
    version: '0.0.1-SNAPSHOT',
    javaVersion: '21',
    kotlinVersion: '2.4.21',
    bootVersion: '4.1.1',
    packageName: 'io.acme.orders',
    description: '',
    dependencies: [],
    bootDependencies: [],
    multiModule: false,
    modules: [],
    shade: false,
    git: false,
    install: false,
    dryRun: true,
    force: false,
    ...overrides,
  };
}

describe('initializrType', () => {
  it('maps the build tool and DSL to a project type', () => {
    expect(initializrType(config({ buildTool: 'maven' }))).toBe('maven-project');
    expect(initializrType(config({ buildTool: 'gradle', dsl: 'groovy' }))).toBe('gradle-project');
    expect(initializrType(config({ buildTool: 'gradle', dsl: 'kotlin' }))).toBe(
      'gradle-project-kotlin',
    );
  });
});

describe('initializrQuery', () => {
  it('sends every piece of project metadata', () => {
    const q = initializrQuery(
      config({
        packaging: 'war',
        configFormat: 'yaml',
        javaVersion: '25',
        bootVersion: '4.1.1',
        bootDependencies: ['web', 'data-jpa'],
      }),
    );
    expect(q.get('groupId')).toBe('io.acme');
    expect(q.get('artifactId')).toBe('orders');
    expect(q.get('packageName')).toBe('io.acme.orders');
    expect(q.get('packaging')).toBe('war');
    expect(q.get('configurationFileFormat')).toBe('yaml');
    expect(q.get('javaVersion')).toBe('25');
    expect(q.get('bootVersion')).toBe('4.1.1');
    expect(q.get('dependencies')).toBe('web,data-jpa');
  });

  it('derives the application class from the artifactId, not the directory', () => {
    // Initializr names the main class after `name`; the local generators name it
    // after `artifactId`. Sending the artifactId keeps both consistent.
    const q = initializrQuery(config({ name: 'shop-api', artifactId: 'orders' }));
    expect(q.get('name')).toBe('orders');
  });

  it('omits the dependencies parameter when nothing is selected', () => {
    expect(initializrQuery(config()).has('dependencies')).toBe(false);
  });
});

describe('normaliseConfigFormat', () => {
  it('accepts the spellings Initializr requires', () => {
    expect(normaliseConfigFormat('properties')).toBe('properties');
    expect(normaliseConfigFormat('yaml')).toBe('yaml');
  });

  it('normalises yml, which Initializr rejects with HTTP 400', () => {
    expect(normaliseConfigFormat('yml')).toBe('yaml');
    expect(normaliseConfigFormat('YAML')).toBe('yaml');
  });

  it('rejects anything else', () => {
    expect(normaliseConfigFormat('toml')).toBeUndefined();
    expect(normaliseConfigFormat('json')).toBeUndefined();
  });
});
