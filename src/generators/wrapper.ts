/**
 * Build-tool wrapper support.
 *
 * The Gradle wrapper needs a binary `gradle-wrapper.jar`. Rather than vendoring
 * a jar in this package, the official files are fetched from the Gradle release
 * tag. When that is not possible the local `gradle` binary is asked to
 * generate the wrapper, and failing that the wrapper is simply omitted.
 */

import { GRADLE_WRAPPER_VERSION } from '../versions.js';
import { addFile, type FileMap } from '../writer.js';
import { run, which } from '../util/exec.js';

const RAW_BASE = 'https://raw.githubusercontent.com/gradle/gradle';

/** Files that make up a Gradle wrapper, relative to the project root. */
const WRAPPER_FILES = [
  'gradlew',
  'gradlew.bat',
  'gradle/wrapper/gradle-wrapper.jar',
] as const;

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
): Promise<WrapperResult> {
  const tag = `v${version}`;
  const failures: string[] = [];

  const downloads = await Promise.all(
    WRAPPER_FILES.map(async (relativePath) => {
      const url = `${RAW_BASE}/${tag}/${relativePath}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${relativePath}`);
        return { relativePath, buffer: Buffer.from(await response.arrayBuffer()) };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
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

  // A missing jar is fatal: `gradlew` cannot bootstrap without it. Missing
  // scripts are tolerated because the project is still buildable with a locally
  // installed Gradle.
  const jarMissing = failures.some((f) => f.includes('gradle-wrapper.jar'));
  const message = `could not fetch the Gradle wrapper (${failures.join('; ')})`;
  if (jarMissing) return { ok: false, source: 'none', message };
  return { ok: true, source: 'download', message };
}

/** Ask the local Gradle binary to fill in the wrapper inside `dir`. */
export async function runGradleWrapperTask(
  dir: string,
  version: string = GRADLE_WRAPPER_VERSION,
): Promise<WrapperResult> {
  if (!(await which('gradle'))) {
    return { ok: false, source: 'none', message: 'gradle is not installed' };
  }
  const result = await run(
    'gradle',
    ['wrapper', '--gradle-version', version, '--no-daemon', '--quiet'],
    { cwd: dir, timeoutMs: 180_000 },
  );
  if (result.spawnFailed || result.code !== 0) {
    const detail = result.stderr.trim().split('\n').slice(-3).join(' ');
    return {
      ok: false,
      source: 'none',
      message: `\`gradle wrapper\` failed${detail ? `: ${detail}` : ''}`,
    };
  }
  return { ok: true, source: 'gradle' };
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
