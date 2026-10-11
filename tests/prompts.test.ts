import { describe, expect, it } from 'vitest';
import {
  persistenceWarnings,
  defaultable,
  templateFromArgs,
  unwrap,
} from '../src/wizard/prompts.js';
import { PROJECT_TEMPLATES } from '../src/wizard/templates.js';

describe('persistenceWarnings', () => {
  it('warns when a persistence starter has no driver', () => {
    const warnings = persistenceWarnings(['web', 'data-jpa']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('database driver');
  });

  it('stays quiet when a driver is present', () => {
    expect(persistenceWarnings(['data-jpa', 'h2'])).toEqual([]);
    expect(persistenceWarnings(['jdbc', 'postgresql'])).toEqual([]);
  });

  it('stays quiet when nothing persistent is selected', () => {
    expect(persistenceWarnings(['web', 'actuator'])).toEqual([]);
    expect(persistenceWarnings([])).toEqual([]);
  });
});

describe('defaultable', () => {
  const validator = (value: string) =>
    value.startsWith('ok') ? { ok: true } : { ok: false, message: 'must start with ok' };

  it('accepts an empty value so the prompt default can apply', () => {
    // clack applies defaultValue after validate, so a required check here would
    // reject a bare Enter even though a default is configured.
    expect(defaultable(validator)(undefined)).toBeUndefined();
    expect(defaultable(validator)('')).toBeUndefined();
    expect(defaultable(validator)('   ')).toBeUndefined();
  });

  it('still validates a non-empty value', () => {
    expect(defaultable(validator)('okay')).toBeUndefined();
    expect(defaultable(validator)('bad')).toBe('must start with ok');
  });
});

describe('templateFromArgs', () => {
  it('finds the entry for a known kind', () => {
    expect(templateFromArgs({ kind: 'springboot', warnings: [] }).kind).toBe('springboot');
    expect(templateFromArgs({ kind: 'gradle', warnings: [] }).kind).toBe('gradle');
  });

  it('defaults to the Maven entry when no kind is given', () => {
    expect(templateFromArgs({ warnings: [] }).kind).toBe('maven');
  });

  it('synthesises an entry for a kind with no template', () => {
    // An unknown kind keeps both build tools available rather than guessing.
    const template = templateFromArgs({ kind: 'custom', warnings: [] });
    expect(template.buildTools).toEqual(['maven', 'gradle']);
  });

  it('honours an explicit build tool on a synthesised entry', () => {
    const template = templateFromArgs({ kind: 'custom', buildTool: 'gradle', warnings: [] });
    expect(template.buildTools).toEqual(['gradle']);
  });
});

describe('PROJECT_TEMPLATES', () => {
  it('offers one entry per generator', () => {
    const kinds = PROJECT_TEMPLATES.map((t) => t.kind);
    expect(kinds).toContain('springboot');
    expect(kinds).toContain('maven');
    expect(kinds).toContain('gradle');
    expect(kinds).toContain('template');
  });

  it('lets Spring Boot choose either build system, and the others only one', () => {
    const boot = PROJECT_TEMPLATES.find((t) => t.kind === 'springboot')!;
    expect(boot.buildTools).toEqual(['maven', 'gradle']);
    for (const t of PROJECT_TEMPLATES.filter((t) => t.kind === 'maven' || t.kind === 'gradle')) {
      expect(t.buildTools).toHaveLength(1);
    }
  });
});
