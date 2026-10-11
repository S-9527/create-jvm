/**
 * Build-tool wrapper support.
 *
 * The Gradle wrapper needs a binary `gradle-wrapper.jar`. Rather than vendoring
 * a jar in this package, the official files are fetched from the Gradle release
 * tag. When that is not possible the wrapper is omitted and the project falls
 * back to a locally installed Gradle.
 */

import { GRADLE_WRAPPER_VERSION } from '../versions.js';
import { addFile, type FileMap } from '../writer.js';

const RAW_BASE = 'https://raw.githubusercontent.com/gradle/gradle';

/** Files that make up a Gradle wrapper, relative to the project root. */
const WRAPPER_FILES = [
  'gradlew',
  'gradlew.bat',
  'gradle/wrapper/gradle-wrapper.jar',
] as const;

/**
 * Build the download URL for one wrapper file.
 *
 * Exported so tests can point at an unreachable host: Node's `fetch` ignores the
 * proxy environment variables, so a failure cannot be forced that way.
 */
export function gradleWrapperUrl(version: string, relativePath: string): string {
  return `${RAW_BASE}/v${version}/${relativePath}`;
}

export interface WrapperResult {
  ok: boolean;
  /** How the wrapper was obtained, for reporting. */
  source: 'download' | 'gradle' | 'none';
  message?: string;
}

/**
 * Download the Gradle wrapper files for `version` into the file map.
 *
 * The distribution URL is written from the requested version rather than copied,
 * so the wrapper always matches `version`.
 *
 * @returns whether every required file was added.
 */
export async function addGradleWrapper(
  files: FileMap,
  version: string = GRADLE_WRAPPER_VERSION,
  timeoutMs = 30_000,
  /** Override URL construction; used by tests. */
  urlFor: (version: string, relativePath: string) => string = gradleWrapperUrl,
): Promise<WrapperResult> {
  // Failures are tracked per path rather than by inspecting error text: a
  // network error is just "fetch failed" and does not name the file, so
  // matching on the message would misreport a missing jar as a success.
  const failures: { relativePath: string; reason: string }[] = [];

  const downloads = await Promise.all(
    WRAPPER_FILES.map(async (relativePath) => {
      const url = urlFor(version, relativePath);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { relativePath, buffer: Buffer.from(await response.arrayBuffer()) };
      } catch (error) {
        failures.push({
          relativePath,
          reason: `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        });
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  for (const download of downloads) {
    if (download) addFile(files, download.relativePath, download.buffer);
  }

  if (failures.length === 0) {
    addFile(files, 'gradle/wrapper/gradle-wrapper.properties', renderWrapperProperties(version));
    return { ok: true, source: 'download' };
  }

  // A missing jar is fatal: `gradlew` cannot bootstrap without it. Any files
  // already added are removed so the project never ships a half-written
  // wrapper, and it falls back to a locally installed Gradle.
  const jarMissing = failures.some((f) => f.relativePath.endsWith('gradle-wrapper.jar'));
  const message = `could not fetch the Gradle wrapper (${failures.map((f) => f.reason).join('; ')})`;
  if (jarMissing) {
    for (const relativePath of WRAPPER_FILES) files.delete(relativePath);
    files.delete('gradle/wrapper/gradle-wrapper.properties');
    return { ok: false, source: 'none', message };
  }
  return { ok: true, source: 'download', message };
}


/** Contents of `gradle/wrapper/gradle-wrapper.properties`. */
export function renderWrapperProperties(version: string): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${version}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}
