import { describe, expect, it } from 'vitest';
import {
  addMavenWrapper,
  mavenWrapperTargets,
  renderMavenWrapperProperties,
} from '../src/generators/maven-wrapper.js';
import { addGradleWrapper, gradleWrapperUrl, renderWrapperProperties } from '../src/generators/wrapper.js';
import { createFileMap, listFiles } from '../src/writer.js';

/** A URL that can never resolve, used to force a download failure. */
const UNREACHABLE = 'http://127.0.0.1:1/never';

describe('renderMavenWrapperProperties', () => {
  it('points at the requested Maven version', () => {
    const props = renderMavenWrapperProperties('3.9.16', '3.3.4');
    expect(props).toContain('wrapperVersion=3.3.4');
    expect(props).toContain('apache-maven-3.9.16-bin.zip');
  });
});

describe('renderWrapperProperties', () => {
  it('points at the requested Gradle version', () => {
    const props = renderWrapperProperties('9.8.1');
    expect(props).toContain('gradle-9.8.1-bin.zip');
    // The colon must be escaped, as the properties format requires.
    expect(props).toContain('distributionUrl=https\\://');
  });
});

describe('mavenWrapperTargets', () => {
  it('covers the script, the Windows script and the bootstrap jar', () => {
    const paths = mavenWrapperTargets('3.3.4').map((t) => t.path);
    expect(paths).toEqual(['mvnw', 'mvnw.cmd', '.mvn/wrapper/maven-wrapper.jar']);
  });
});

describe('addMavenWrapper', () => {
  it('writes nothing when a download fails, leaving no partial wrapper', async () => {
    const files = createFileMap();
    const targets = mavenWrapperTargets('3.3.4').map((t) => ({ ...t, url: UNREACHABLE }));

    const result = await addMavenWrapper(files, { timeoutMs: 3000, targets });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Maven wrapper');
    // A properties file without mvnw would make `./mvnw` fail confusingly, so
    // the wrapper is omitted entirely and a system `mvn` is used instead.
    expect(listFiles(files)).toEqual([]);
  }, 30_000);
});

describe('addGradleWrapper', () => {
  it('writes nothing when the jar cannot be fetched', async () => {
    const files = createFileMap();
    const result = await addGradleWrapper(files, '9.8.1', 3000, () => UNREACHABLE);

    expect(result.ok).toBe(false);
    expect(listFiles(files)).toEqual([]);
  }, 30_000);
});

describe('gradleWrapperUrl', () => {
  it('points at the release tag for the requested version', () => {
    expect(gradleWrapperUrl('9.8.1', 'gradlew')).toBe(
      'https://raw.githubusercontent.com/gradle/gradle/v9.8.1/gradlew',
    );
  });
});
