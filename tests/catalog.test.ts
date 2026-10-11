import { describe, expect, it } from 'vitest';
import { dedupeDependencies, findDependency, resolveDependencies, catalogGroups } from '../src/catalog.js';

describe('catalog', () => {
  it('exposes grouped entries', () => {
    const groups = catalogGroups();
    expect(groups.length).toBeGreaterThan(5);
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBeGreaterThan(20);
  });

  it('finds entries by id', () => {
    expect(findDependency('lombok')?.artifactId).toBe('lombok');
    expect(findDependency('nope')).toBeUndefined();
  });

  it('resolves catalog ids to coordinates', () => {
    const deps = resolveDependencies(['lombok', 'junit5']);
    expect(deps.map((d) => d.artifactId)).toEqual(['lombok', 'junit-jupiter']);
  });

  it('resolves raw Maven coordinates', () => {
    const [dep] = resolveDependencies(['com.acme:widget:1.2.3']);
    expect(dep?.groupId).toBe('com.acme');
    expect(dep?.artifactId).toBe('widget');
    expect(dep?.version).toBe('1.2.3');
  });

  it('rejects unknown ids', () => {
    expect(() => resolveDependencies(['not-a-real-dep'])).toThrow(/unknown dependency/);
  });
});

describe('dedupeDependencies', () => {
  it('collapses duplicate coordinates', () => {
    const result = dedupeDependencies([
      { id: 'a', name: 'A', group: 'g', groupId: 'org.x', artifactId: 'lib' },
      { id: 'b', name: 'B', group: 'g', groupId: 'org.x', artifactId: 'lib' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('keeps the version when only one entry declares it', () => {
    const result = dedupeDependencies([
      { id: 'a', name: 'A', group: 'g', groupId: 'org.x', artifactId: 'lib' },
      { id: 'b', name: 'B', group: 'g', groupId: 'org.x', artifactId: 'lib', version: '9.9' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.version).toBe('9.9');
  });

  it('preserves first-seen order', () => {
    const result = dedupeDependencies([
      { id: 'a', name: 'A', group: 'g', groupId: 'org.a', artifactId: 'one' },
      { id: 'b', name: 'B', group: 'g', groupId: 'org.b', artifactId: 'two' },
      { id: 'c', name: 'C', group: 'g', groupId: 'org.a', artifactId: 'one' },
    ]);
    expect(result.map((d) => d.artifactId)).toEqual(['one', 'two']);
  });

  it('adopts a scope from a later duplicate when the first has none', () => {
    const result = dedupeDependencies([
      { id: 'a', name: 'A', group: 'g', groupId: 'org.x', artifactId: 'lib' },
      { id: 'b', name: 'B', group: 'g', groupId: 'org.x', artifactId: 'lib', scope: 'test' },
    ]);
    expect(result[0]?.scope).toBe('test');
  });
});
