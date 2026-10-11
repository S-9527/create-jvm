/**
 * Name validation and derivation helpers.
 *
 * These mirror the rules the IntelliJ IDEA new-project wizard applies, so a
 * name accepted here also produces a project that opens cleanly in an IDE.
 */

const JAVA_KEYWORD_RE =
  /^(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false|null|var|record|sealed|permits|yield)$/;

const SEGMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ARTIFACT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

const OK: ValidationResult = { ok: true };
const fail = (message: string): ValidationResult => ({ ok: false, message });

/** Validate a Maven `groupId` / Java package name. */
export function validateGroupId(value: string): ValidationResult {
  if (!value.trim()) return fail('groupId is required');
  const segments = value.split('.');
  for (const segment of segments) {
    if (!SEGMENT_RE.test(segment)) {
      return fail(
        `"${segment}" is not a valid identifier segment — use letters, digits and "_", starting with a letter or "_"`,
      );
    }
    if (JAVA_KEYWORD_RE.test(segment)) {
      return fail(`"${segment}" is a reserved Java keyword`);
    }
  }
  return OK;
}

/** Validate a Maven `artifactId`. */
export function validateArtifactId(value: string): ValidationResult {
  if (!value.trim()) return fail('artifactId is required');
  if (!ARTIFACT_RE.test(value)) {
    return fail(
      'artifactId must start with a letter or digit and contain only letters, digits, ".", "_" or "-"',
    );
  }
  return OK;
}

/** Validate a project directory name. */
export function validateProjectName(value: string): ValidationResult {
  if (!value.trim()) return fail('project name is required');
  if (value === '.' || value === '..') return fail('project name cannot be "." or ".."');
  if (value.includes('/') || value.includes('\\')) {
    return fail('project name cannot contain path separators');
  }
  return OK;
}

/** Validate a module name (same rules as artifactId). */
export function validateModuleName(value: string): ValidationResult {
  const base = validateArtifactId(value);
  if (!base.ok) return base;
  if (value.includes('.')) return fail('module names cannot contain "."');
  return OK;
}

/**
 * Turn an arbitrary string into a legal Maven artifactId.
 *
 * @example deriveArtifactId('My Cool_App') // 'my-cool-app'
 */
export function deriveArtifactId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[-._]{2,}/g, '-')
    .replace(/[-._]+$/, '');
  return slug || 'app';
}

/**
 * Derive the base package name from a groupId and artifactId, dropping any
 * characters that are illegal in a Java package segment.
 *
 * @example derivePackageName('com.example', 'my-app') // 'com.example.myapp'
 */
export function derivePackageName(groupId: string, artifactId: string): string {
  const tail = artifactId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^([0-9])/, '_$1');
  const head = groupId
    .split('.')
    .map((s) => s.replace(/[^A-Za-z0-9_]/g, ''))
    .filter(Boolean)
    .join('.');
  if (!head) return tail || 'app';
  if (!tail) return head;
  return `${head}.${tail}`;
}

/** Convert a package name to its directory path. */
export function packageToPath(packageName: string): string {
  return packageName.split('.').filter(Boolean).join('/');
}

/**
 * Convert a string to PascalCase, preserving existing camel humps.
 *
 * @example toPascalCase('my-app') // 'MyApp'
 */
export function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** Derive the Spring Boot application class name from an artifactId. */
export function deriveMainClassName(artifactId: string): string {
  const base = toPascalCase(artifactId);
  const safe = /^[A-Za-z]/.test(base) ? base : `App${base}`;
  return `${safe || 'App'}Application`;
}

/** Convert an artifactId to a Gradle `rootProject.name` value. */
export function deriveGradleProjectName(artifactId: string): string {
  return artifactId.replace(/[^A-Za-z0-9._-]/g, '-');
}

/** Escape a value for inclusion in an XML text node or attribute. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Escape a value for a single-quoted Groovy string. */
export function escapeGroovy(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Escape a value for a double-quoted Kotlin string. */
export function escapeKotlin(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
}

/** Capitalise the first character. */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
