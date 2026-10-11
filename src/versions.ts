/**
 * Pinned artifact versions.
 *
 * These are defaults for generated builds, not a dependency resolver: the goal
 * is that `create-jvm` output builds offline-ish and stays reproducible. Users
 * override anything via the properties the generators emit.
 *
 * Verified against Maven Central at the time of writing.
 */

export const VERSIONS = {
  /** Maven plugins. */
  mavenCompilerPlugin: '3.16.0',
  mavenSurefirePlugin: '3.6.0',
  mavenWarPlugin: '3.5.1',
  mavenJarPlugin: '3.5.1',
  mavenShadePlugin: '3.6.2',
  mavenAssemblyPlugin: '3.8.0',
  mavenResourcesPlugin: '3.5.0',
  mavenInstallPlugin: '3.2.0',
  mavenDeployPlugin: '3.2.0',
  execMavenPlugin: '3.6.4',
  gmavenplusPlugin: '5.1.0',
  kotlinMavenPlugin: '2.4.21',

  /** Languages and runtimes. */
  kotlin: '2.4.21',
  groovy: '5.1.3',

  /** Test stack. */
  junitJupiter: '6.1.3',
  junitPlatformLauncher: '6.1.3',
  /** Fallback test stack for Java 8/11 targets, where JUnit 6 is unsupported. */
  junitJupiterLegacy: '5.14.4',
  junitPlatformLauncherLegacy: '1.14.4',
  mockito: '5.24.0',
  assertj: '3.27.7',

  /** Libraries. */
  lombok: '1.18.48',
  mapstruct: '1.6.3',
  guava: '33.7.2-jre',
  commonsLang3: '3.21.0',
  commonsText: '1.15.0',
  commonsCollections4: '4.6.0',
  gson: '2.14.0',
  jackson: '2.22.3',
  snakeyaml: '2.7',
  caffeine: '3.3.0',
  okhttp: '5.5.0',
  jsoup: '1.23.2',
  picocli: '4.7.7',

  /** Logging. */
  slf4j: '2.0.20',
  logback: '1.5.38',
  log4j: '2.26.1',

  /** Databases and drivers. */
  h2: '2.5.252',
  sqlite: '3.53.4.0',
  postgresql: '42.7.14',
  mysql: '26.7.0',
  mongodb: '5.13.0',
  jedis: '8.0.2',
  hikari: '7.1.0',

  /** Web / Jakarta. */
  jakartaServletApi: '6.1.0',
  httpclient5: '5.6.5',

  /** Infrastructure. */
  testcontainers: '1.21.4',
} as const;

/** The Gradle version used for the generated wrapper. */
export const GRADLE_WRAPPER_VERSION = '9.8.1';

/** Default Spring Boot version, used when Initializr is unreachable. */
export const DEFAULT_BOOT_VERSION = '4.1.1';

/** The Initializr service backing Spring Boot generation. */
export const INITIALIZR_BASE_URL = 'https://start.spring.io';

/** Java releases offered by the wizard. */
export const JAVA_VERSIONS = ['17', '21', '25', '27'] as const;

/**
 * Pick the JUnit generation matching a Java release.
 *
 * JUnit 6 requires Java 17+; older targets stay on the JUnit 5 line.
 */
export function junitFor(javaVersion: string): {
  jupiter: string;
  launcher: string;
  major: 5 | 6;
} {
  const release = Number.parseInt(javaVersion, 10);
  if (Number.isFinite(release) && release < 17) {
    return {
      jupiter: VERSIONS.junitJupiterLegacy,
      launcher: VERSIONS.junitPlatformLauncherLegacy,
      major: 5,
    };
  }
  return {
    jupiter: VERSIONS.junitJupiter,
    launcher: VERSIONS.junitPlatformLauncher,
    major: 6,
  };
}
