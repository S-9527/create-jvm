import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { VERSION } from '../src/index.js';

describe('CLI version', () => {
  it('matches package.json', () => {
    // A hardcoded literal here previously drifted from the published version,
    // so `create-jvm --version` reported 0.1.0 while 0.1.1 was on the registry.
    const pkg = JSON.parse(
      readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it('is a real version, not the fallback', () => {
    expect(VERSION).not.toBe('0.0.0-unknown');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
