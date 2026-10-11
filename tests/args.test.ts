import { describe, expect, it } from 'vitest';
import { parseArgs, applyDefaults, normaliseLanguage } from '../src/args.js';

describe('parseArgs', () => {
  it('treats a bare word as the project name', () => {
    const { args } = parseArgs(['my-app']);
    expect(args.name).toBe('my-app');
  });

  it('parses project type flags', () => {
    expect(parseArgs(['--maven']).args.kind).toBe('maven');
    expect(parseArgs(['--spring-boot']).args.kind).toBe('springboot');
    expect(parseArgs(['--boot']).args.kind).toBe('springboot');
    expect(parseArgs(['--gradle']).args.buildTool).toBe('gradle');
  });

  it('accepts both "--flag value" and "--flag=value"', () => {
    expect(parseArgs(['--group-id', 'com.acme']).args.groupId).toBe('com.acme');
    expect(parseArgs(['--group-id=com.acme']).args.groupId).toBe('com.acme');
  });

  it('collects repeatable dependency flags', () => {
    const { args } = parseArgs(['--dep', 'lombok', '--dep', 'junit5,mockito']);
    expect(args.dependencies).toEqual(['lombok', 'junit5', 'mockito']);
  });

  it('collects modules and implies multi-module', () => {
    const { args } = parseArgs(['--module', 'core', '--module', 'web,cli']);
    expect(args.modules).toEqual(['core', 'web', 'cli']);
    expect(args.multiModule).toBe(true);
  });

  it('rejects unknown options', () => {
    const result = parseArgs(['--nope']);
    expect(result.error).toContain('unknown option');
  });

  it('rejects a value flag with no value', () => {
    const result = parseArgs(['--group-id']);
    expect(result.error).toContain('requires a value');
  });

  it('rejects an unsupported language', () => {
    const result = parseArgs(['--language', 'scala']);
    expect(result.error).toContain('unsupported language');
  });

  it('keeps the CLI --version flag separate from the project version', () => {
    expect(parseArgs(['--version']).args.version_).toBe(true);
    expect(parseArgs(['--version']).args.version).toBeUndefined();
    expect(parseArgs(['--project-version', '1.2.3']).args.version).toBe('1.2.3');
  });

  it('stops parsing flags after "--"', () => {
    const { args } = parseArgs(['--', '--maven']);
    expect(args.name).toBe('--maven');
    expect(args.kind).toBeUndefined();
  });

  it('parses the template spec', () => {
    expect(parseArgs(['-t', 'gh:a/b']).args.template).toBe('gh:a/b');
    expect(parseArgs(['--template=gh:a/b']).args.template).toBe('gh:a/b');
  });

  it('handles boolean toggles', () => {
    expect(parseArgs(['--git']).args.git).toBe(true);
    expect(parseArgs(['--no-git']).args.git).toBe(false);
    expect(parseArgs(['--force']).args.force).toBe(true);
    expect(parseArgs(['--dry-run']).args.dryRun).toBe(true);
  });
});

describe('applyDefaults', () => {
  it('derives artifactId and packageName from the name', () => {
    const defaults = applyDefaults({ name: 'My App', warnings: [] });
    expect(defaults.artifactId).toBe('my-app');
    expect(defaults.packageName).toBe('com.example.myapp');
  });

  it('honours explicit values', () => {
    const defaults = applyDefaults({
      name: 'demo',
      groupId: 'io.acme',
      artifactId: 'core',
      version: '2.0.0',
      warnings: [],
    });
    expect(defaults.groupId).toBe('io.acme');
    expect(defaults.artifactId).toBe('core');
    expect(defaults.version).toBe('2.0.0');
    expect(defaults.packageName).toBe('io.acme.core');
  });

  it('falls back when the groupId cannot form a package', () => {
    const defaults = applyDefaults({ name: 'demo', groupId: '9bad', warnings: [] });
    expect(defaults.packageName).toBe('com.example.app');
  });
});

describe('normaliseLanguage', () => {
  it('accepts aliases and is case insensitive', () => {
    expect(normaliseLanguage('Java')).toBe('java');
    expect(normaliseLanguage('kt')).toBe('kotlin');
    expect(normaliseLanguage('KOTLIN')).toBe('kotlin');
    expect(normaliseLanguage('groovy')).toBe('groovy');
    expect(normaliseLanguage('scala')).toBeUndefined();
  });
});
