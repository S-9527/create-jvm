/**
 * The dependency catalog shown by the interactive picker.
 *
 * Only used for plain Maven/Gradle projects. Spring Boot projects take their
 * dependencies from Spring Initializr so the versions always match the chosen
 * Boot release.
 */

import { VERSIONS } from './versions.js';
import type { Dependency } from './types.js';

const v = VERSIONS;

/** Every dependency offered by the wizard, in display order. */
export const CATALOG: readonly Dependency[] = [
  // ---------------------------------------------------------------- Testing
  {
    id: 'junit5',
    name: 'JUnit 5 / 6',
    group: 'Testing',
    groupId: 'org.junit.jupiter',
    artifactId: 'junit-jupiter',
    scope: 'test',
    hint: 'the standard JVM test framework',
  },
  {
    id: 'mockito',
    name: 'Mockito',
    group: 'Testing',
    groupId: 'org.mockito',
    artifactId: 'mockito-core',
    version: v.mockito,
    scope: 'test',
    hint: 'mocking framework',
  },
  {
    id: 'assertj',
    name: 'AssertJ',
    group: 'Testing',
    groupId: 'org.assertj',
    artifactId: 'assertj-core',
    version: v.assertj,
    scope: 'test',
    hint: 'fluent assertions',
  },
  {
    id: 'testcontainers',
    name: 'Testcontainers',
    group: 'Testing',
    groupId: 'org.testcontainers',
    artifactId: 'junit-jupiter',
    version: v.testcontainers,
    scope: 'test',
    hint: 'throwaway Docker containers in tests',
  },

  // -------------------------------------------------------------------- Web
  {
    id: 'jakarta-servlet',
    name: 'Jakarta Servlet API',
    group: 'Web',
    groupId: 'jakarta.servlet',
    artifactId: 'jakarta.servlet-api',
    version: v.jakartaServletApi,
    scope: 'provided',
    hint: 'compile against the Servlet API (provided scope)',
  },
  {
    id: 'httpclient5',
    name: 'Apache HttpClient 5',
    group: 'Web',
    groupId: 'org.apache.httpcomponents.client5',
    artifactId: 'httpclient5',
    version: v.httpclient5,
    hint: 'HTTP client',
  },
  {
    id: 'okhttp',
    name: 'OkHttp',
    group: 'Web',
    groupId: 'com.squareup.okhttp3',
    artifactId: 'okhttp',
    version: v.okhttp,
    hint: 'HTTP client',
  },
  {
    id: 'jsoup',
    name: 'jsoup',
    group: 'Web',
    groupId: 'org.jsoup',
    artifactId: 'jsoup',
    version: v.jsoup,
    hint: 'HTML parsing and scraping',
  },

  // -------------------------------------------------------------------- SQL
  {
    id: 'h2',
    name: 'H2 Database',
    group: 'SQL',
    groupId: 'com.h2database',
    artifactId: 'h2',
    version: v.h2,
    hint: 'embedded SQL database',
  },
  {
    id: 'sqlite',
    name: 'SQLite JDBC',
    group: 'SQL',
    groupId: 'org.xerial',
    artifactId: 'sqlite-jdbc',
    version: v.sqlite,
    hint: 'embedded SQLite driver',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL Driver',
    group: 'SQL',
    groupId: 'org.postgresql',
    artifactId: 'postgresql',
    version: v.postgresql,
    scope: 'runtime',
    hint: 'PostgreSQL JDBC driver',
  },
  {
    id: 'mysql',
    name: 'MySQL Driver',
    group: 'SQL',
    groupId: 'com.mysql',
    artifactId: 'mysql-connector-j',
    version: v.mysql,
    scope: 'runtime',
    hint: 'MySQL JDBC driver',
  },
  {
    id: 'hikari',
    name: 'HikariCP',
    group: 'SQL',
    groupId: 'com.zaxxer',
    artifactId: 'HikariCP',
    version: v.hikari,
    hint: 'high performance JDBC connection pool',
  },

  // ------------------------------------------------------------------ NoSQL
  {
    id: 'mongodb',
    name: 'MongoDB Driver',
    group: 'NoSQL',
    groupId: 'org.mongodb',
    artifactId: 'mongodb-driver-sync',
    version: v.mongodb,
    hint: 'synchronous MongoDB driver',
  },
  {
    id: 'jedis',
    name: 'Jedis (Redis)',
    group: 'NoSQL',
    groupId: 'redis.clients',
    artifactId: 'jedis',
    version: v.jedis,
    hint: 'Redis client',
  },

  // -------------------------------------------------------------- Messaging
  {
    id: 'jackson',
    name: 'Jackson Databind',
    group: 'Messaging',
    groupId: 'com.fasterxml.jackson.core',
    artifactId: 'jackson-databind',
    version: v.jackson,
    hint: 'JSON serialisation',
  },
  {
    id: 'gson',
    name: 'Gson',
    group: 'Messaging',
    groupId: 'com.google.code.gson',
    artifactId: 'gson',
    version: v.gson,
    hint: 'JSON serialisation',
  },
  {
    id: 'snakeyaml',
    name: 'SnakeYAML',
    group: 'Messaging',
    groupId: 'org.yaml',
    artifactId: 'snakeyaml',
    version: v.snakeyaml,
    hint: 'YAML parsing',
  },

  // -------------------------------------------------------------------- I/O
  {
    id: 'commons-lang3',
    name: 'Apache Commons Lang',
    group: 'I/O',
    groupId: 'org.apache.commons',
    artifactId: 'commons-lang3',
    version: v.commonsLang3,
    hint: 'String, array and reflection utilities',
  },
  {
    id: 'commons-text',
    name: 'Apache Commons Text',
    group: 'I/O',
    groupId: 'org.apache.commons',
    artifactId: 'commons-text',
    version: v.commonsText,
    hint: 'String algorithms and similarity',
  },
  {
    id: 'commons-collections4',
    name: 'Apache Commons Collections',
    group: 'I/O',
    groupId: 'org.apache.commons',
    artifactId: 'commons-collections4',
    version: v.commonsCollections4,
    hint: 'Extra collection types',
  },
  {
    id: 'guava',
    name: 'Guava',
    group: 'I/O',
    groupId: 'com.google.guava',
    artifactId: 'guava',
    version: v.guava,
    hint: 'Google core libraries',
  },

  // -------------------------------------------------------------- Utilities
  {
    id: 'caffeine',
    name: 'Caffeine',
    group: 'Utilities',
    groupId: 'com.github.ben-manes.caffeine',
    artifactId: 'caffeine',
    version: v.caffeine,
    hint: 'high performance in-memory cache',
  },
  {
    id: 'picocli',
    name: 'Picocli',
    group: 'Utilities',
    groupId: 'info.picocli',
    artifactId: 'picocli',
    version: v.picocli,
    hint: 'build command line applications',
  },
  {
    id: 'lombok',
    name: 'Lombok',
    group: 'Utilities',
    groupId: 'org.projectlombok',
    artifactId: 'lombok',
    version: v.lombok,
    scope: 'provided',
    hint: 'boilerplate reduction via annotation processing',
  },
  {
    id: 'mapstruct',
    name: 'MapStruct',
    group: 'Utilities',
    groupId: 'org.mapstruct',
    artifactId: 'mapstruct',
    version: v.mapstruct,
    hint: 'type-safe bean mappings via annotation processing',
  },

  // ---------------------------------------------------------------- Logging
  {
    id: 'slf4j',
    name: 'SLF4J API',
    group: 'Logging',
    groupId: 'org.slf4j',
    artifactId: 'slf4j-api',
    version: v.slf4j,
    hint: 'logging facade',
  },
  {
    id: 'logback',
    name: 'Logback',
    group: 'Logging',
    groupId: 'ch.qos.logback',
    artifactId: 'logback-classic',
    version: v.logback,
    hint: 'SLF4J implementation',
  },
  {
    id: 'log4j',
    name: 'Log4j 2',
    group: 'Logging',
    groupId: 'org.apache.logging.log4j',
    artifactId: 'log4j-core',
    version: v.log4j,
    hint: 'logging implementation',
  },
] as const;

/** Look up a catalog entry by id. */
export function findDependency(id: string): Dependency | undefined {
  return CATALOG.find((d) => d.id === id);
}

/** Catalog ids grouped for display. */
export function catalogGroups(): { group: string; items: Dependency[] }[] {
  const order: string[] = [];
  const map = new Map<string, Dependency[]>();
  for (const dep of CATALOG) {
    if (!map.has(dep.group)) {
      map.set(dep.group, []);
      order.push(dep.group);
    }
    map.get(dep.group)?.push(dep);
  }
  return order.map((group) => ({ group, items: map.get(group) ?? [] }));
}

/**
 * Resolve user supplied dependency ids, tolerating either catalog ids
 * (`commons-lang3`) or raw Maven coordinates (`g:a[:v]`).
 *
 * @throws when an id is neither.
 */
export function resolveDependencies(ids: string[]): Dependency[] {
  const seen = new Set<string>();
  const out: Dependency[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    const known = findDependency(id);
    if (known) {
      if (!seen.has(known.id)) {
        seen.add(known.id);
        out.push(known);
      }
      continue;
    }
    const parts = id.split(':');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const key = `${parts[0]}:${parts[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          id: key,
          name: key,
          group: 'Custom',
          groupId: parts[0],
          artifactId: parts[1],
          ...(parts[2] ? { version: parts[2] } : {}),
        });
      }
      continue;
    }
    throw new Error(
      `unknown dependency "${id}" — use a catalog id or a "groupId:artifactId[:version]" coordinate`,
    );
  }
  return out;
}

/** True when the selection includes the given catalog id. */
export function hasDependency(deps: Dependency[], id: string): boolean {
  return deps.some((d) => d.id === id);
}

/**
 * Collapse dependencies that share coordinates.
 *
 * Generators merge several sources (language runtime, test stack, user
 * selection) and the same artifact can appear in more than one. Maven rejects a
 * POM with a duplicate `groupId:artifactId`, so the merge has to be explicit.
 * The first entry wins, except that an entry carrying a version beats one that
 * does not.
 */
export function dedupeDependencies(deps: Dependency[]): Dependency[] {
  const byKey = new Map<string, Dependency>();
  const order: string[] = [];

  for (const dep of deps) {
    const key = `${dep.groupId}:${dep.artifactId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, dep);
      order.push(key);
      continue;
    }
    if (!existing.version && dep.version) {
      // Keep the original position but adopt the versioned definition.
      byKey.set(key, { ...existing, version: dep.version });
    }
    if (!existing.scope && dep.scope) {
      const merged = byKey.get(key);
      if (merged) byKey.set(key, { ...merged, scope: dep.scope });
    }
  }

  return order.map((key) => byKey.get(key)).filter((d): d is Dependency => d !== undefined);
}
