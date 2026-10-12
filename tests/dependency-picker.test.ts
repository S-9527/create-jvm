import { describe, expect, it, vi, beforeEach } from 'vitest';

/** Options passed to each groupMultiselect call, captured by the mock. */
const captured = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));

vi.mock('@clack/prompts', () => ({
  isCancel: () => false,
  CANCEL_SYMBOL: Symbol('cancel'),
  log: { warn: () => {} },
  text: async () => '',
  select: async () => '',
  confirm: async () => false,
  groupMultiselect: async (options: Record<string, unknown>) => {
    captured.calls.push(options);
    return [];
  },
}));

const { askDependencies } = await import('../src/wizard/prompts.js');
const { PROJECT_TEMPLATES } = await import('../src/wizard/templates.js');

const springBoot = PROJECT_TEMPLATES.find((t) => t.kind === 'springboot')!;
const maven = PROJECT_TEMPLATES.find((t) => t.kind === 'maven')!;

describe('dependency picker', () => {
  beforeEach(() => {
    captured.calls.length = 0;
  });

  it('disables group-level select-all for Spring Boot starters', async () => {
    // clack defaults selectableGroups to true, so pressing space on a group
    // header selects every option in it. Selecting "Web" that way picked 18
    // mutually incompatible starters and Initializr rejected the request with
    // HTTP 400 ("Dependency 'session-data-mongodb' is not compatible with
    // Spring Boot 4.1.1").
    await askDependencies({ warnings: [] }, springBoot, undefined);
    expect(captured.calls).toHaveLength(1);
    expect(captured.calls[0]?.selectableGroups).toBe(false);
  });

  it('disables group-level select-all for the plain catalog too', async () => {
    await askDependencies({ warnings: [] }, maven, undefined);
    expect(captured.calls).toHaveLength(1);
    expect(captured.calls[0]?.selectableGroups).toBe(false);
  });

  it('offers the starter groups when no metadata is available', async () => {
    await askDependencies({ warnings: [] }, springBoot, undefined);
    const options = captured.calls[0]?.options as Record<string, unknown[]>;
    expect(Object.keys(options)).toContain('Web');
    expect(options.Web?.length).toBeGreaterThan(0);
  });

  it('honours --boot-dep without prompting', async () => {
    const result = await askDependencies(
      { bootDependencies: ['web'], warnings: [] },
      springBoot,
      undefined,
    );
    expect(result.bootDependencies).toEqual(['web']);
    expect(captured.calls).toHaveLength(0);
  });
});
