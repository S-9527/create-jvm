import { describe, expect, it } from 'vitest';
import {
  deriveArtifactId,
  deriveMainClassName,
  derivePackageName,
  escapeGroovy,
  escapeKotlin,
  escapeXml,
  packageToPath,
  toPascalCase,
  validateArtifactId,
  validateGroupId,
  validateModuleName,
  validateProjectName,
} from '../src/util/naming.js';

describe('deriveArtifactId', () => {
  it('slugifies human readable names', () => {
    expect(deriveArtifactId('My Cool App')).toBe('my-cool-app');
    expect(deriveArtifactId('  Spaced  ')).toBe('spaced');
    expect(deriveArtifactId('UPPER_case.name')).toBe('upper_case.name');
  });

  it('never produces a leading separator or an empty result', () => {
    expect(deriveArtifactId('---weird---')).toBe('weird');
    expect(deriveArtifactId('!!!')).toBe('app');
    expect(deriveArtifactId('')).toBe('app');
  });
});

describe('derivePackageName', () => {
  it('joins groupId and a sanitised artifactId', () => {
    expect(derivePackageName('com.example', 'my-app')).toBe('com.example.myapp');
    expect(derivePackageName('io.acme.tools', 'core-lib')).toBe('io.acme.tools.corelib');
  });

  it('handles a leading digit in the artifactId', () => {
    expect(derivePackageName('com.example', '3d-engine')).toBe('com.example._3dengine');
  });

  it('falls back when the groupId is unusable', () => {
    expect(derivePackageName('', 'demo')).toBe('demo');
  });
});

describe('toPascalCase', () => {
  it('converts separators to camel humps', () => {
    expect(toPascalCase('my-app')).toBe('MyApp');
    expect(toPascalCase('my_cool_app')).toBe('MyCoolApp');
    expect(toPascalCase('demo')).toBe('Demo');
  });
});

describe('deriveMainClassName', () => {
  it('appends Application and keeps a valid leading character', () => {
    expect(deriveMainClassName('my-app')).toBe('MyAppApplication');
    expect(deriveMainClassName('3d')).toBe('App3dApplication');
  });
});

describe('packageToPath', () => {
  it('converts dots to slashes', () => {
    expect(packageToPath('com.example.demo')).toBe('com/example/demo');
    expect(packageToPath('')).toBe('');
  });
});

describe('validateGroupId', () => {
  it('accepts dotted identifiers', () => {
    expect(validateGroupId('com.example').ok).toBe(true);
    expect(validateGroupId('io.acme_tools.v2').ok).toBe(true);
  });

  it('rejects malformed identifiers', () => {
    expect(validateGroupId('').ok).toBe(false);
    expect(validateGroupId('com.2example').ok).toBe(false);
    expect(validateGroupId('com.ex-ample').ok).toBe(false);
    expect(validateGroupId('com..example').ok).toBe(false);
  });

  it('rejects Java keywords', () => {
    const result = validateGroupId('com.class.demo');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('reserved');
  });
});

describe('validateArtifactId', () => {
  it('accepts Maven-legal ids', () => {
    expect(validateArtifactId('demo').ok).toBe(true);
    expect(validateArtifactId('my-app.core_2').ok).toBe(true);
  });

  it('rejects illegal ids', () => {
    expect(validateArtifactId('').ok).toBe(false);
    expect(validateArtifactId('-leading').ok).toBe(false);
    expect(validateArtifactId('has space').ok).toBe(false);
    expect(validateArtifactId('has/slash').ok).toBe(false);
  });
});

describe('validateProjectName', () => {
  it('rejects path traversal and separators', () => {
    expect(validateProjectName('demo').ok).toBe(true);
    expect(validateProjectName('.').ok).toBe(false);
    expect(validateProjectName('..').ok).toBe(false);
    expect(validateProjectName('a/b').ok).toBe(false);
    expect(validateProjectName('a\\b').ok).toBe(false);
    expect(validateProjectName('').ok).toBe(false);
  });
});

describe('validateModuleName', () => {
  it('rejects dots because modules become directories', () => {
    expect(validateModuleName('core').ok).toBe(true);
    expect(validateModuleName('a.b').ok).toBe(false);
  });
});

describe('escaping', () => {
  it('escapes XML metacharacters', () => {
    expect(escapeXml('a & b < c > d "e" \'f\'')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;',
    );
  });

  it('escapes Groovy and Kotlin string delimiters', () => {
    expect(escapeGroovy("it's")).toBe("it\\'s");
    expect(escapeKotlin('say "hi" $x')).toBe('say \\"hi\\" \\$x');
  });
});
