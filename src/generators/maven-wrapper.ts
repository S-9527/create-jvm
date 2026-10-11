/**
 * Maven wrapper support.
 *
 * Plain Maven projects get `./mvnw` so the README's instructions work without a
 * system Maven. The wrapper scripts and the bootstrap jar come from the official
 * `maven-wrapper` distribution; unlike Gradle, the wrapper needs no distribution
 * URL in a properties file because Maven reads `distributionUrl` from
 * `.mvn/wrapper/maven-wrapper.properties`.
 */

import { addFile, type FileMap } from '../writer.js';

/** Maven wrapper release used for generated projects. */
export const MAVEN_WRAPPER_VERSION = '3.3.4';

/** The Maven version the wrapper downloads. */
export const MAVEN_VERSION = '3.9.16';

const RAW_BASE = 'https://raw.githubusercontent.com/apache/maven-wrapper';
const MAVEN_CENTRAL = 'https://repo1.maven.org/maven2';

export interface MavenWrapperResult {
  ok: boolean;
  message?: string;
}

/** Contents of `.mvn/wrapper/maven-wrapper.properties`. */
export function renderMavenWrapperProperties(
  mavenVersion: string = MAVEN_VERSION,
  wrapperVersion: string = MAVEN_WRAPPER_VERSION,
): string {
  return `wrapperVersion=${wrapperVersion}
distributionType=only-script
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${mavenVersion}/apache-maven-${mavenVersion}-bin.zip
`;
}

/**
 * Add the Maven wrapper to a file map.
 *
 * Failure is not fatal: the project is still buildable with a system `mvn`, so
 * the caller reports a warning and continues.
 */
export async function addMavenWrapper(
  files: FileMap,
  options: { mavenVersion?: string; wrapperVersion?: string; timeoutMs?: number } = {},
): Promise<MavenWrapperResult> {
  const {
    mavenVersion = MAVEN_VERSION,
    wrapperVersion = MAVEN_WRAPPER_VERSION,
    timeoutMs = 30_000,
  } = options;
  const tag = `maven-wrapper-${wrapperVersion}`;

  const targets: { url: string; path: string }[] = [
    {
      url: `${RAW_BASE}/${tag}/maven-wrapper-distribution/src/resources/mvnw`,
      path: 'mvnw',
    },
    {
      url: `${RAW_BASE}/${tag}/maven-wrapper-distribution/src/resources/mvnw.cmd`,
      path: 'mvnw.cmd',
    },
    {
      url: `${MAVEN_CENTRAL}/org/apache/maven/wrapper/maven-wrapper/${wrapperVersion}/maven-wrapper-${wrapperVersion}.jar`,
      path: `.mvn/wrapper/maven-wrapper.jar`,
    },
  ];

  const results = await Promise.all(
    targets.map(async ({ url, path }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
        return { path, buffer: Buffer.from(await response.arrayBuffer()) };
      } catch (error) {
        return { path, error: error instanceof Error ? error.message : String(error) };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const failures: string[] = [];
  for (const result of results) {
    if ('buffer' in result && result.buffer) addFile(files, result.path, result.buffer);
    else if ('error' in result && result.error) failures.push(result.error);
  }

  addFile(
    files,
    '.mvn/wrapper/maven-wrapper.properties',
    renderMavenWrapperProperties(mavenVersion, wrapperVersion),
  );

  if (failures.length > 0) {
    return { ok: false, message: `could not fetch the Maven wrapper (${failures.join('; ')})` };
  }
  return { ok: true };
}
