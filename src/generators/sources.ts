/**
 * Source file templates for the generated project.
 *
 * Each language gets a small but real entry point plus a matching test, so the
 * project compiles and `mvn test` / `gradle test` passes immediately after
 * generation.
 */

import { capitalize, escapeKotlin, escapeXml } from '../util/naming.js';
import type { Language, ProjectConfig } from '../types.js';

/** Inputs describing the entry point to emit. */
export interface SourceOptions {
  config: ProjectConfig;
  packageName: string;
  mainClassName: string;
  /** Directory holding `src/main/java` style roots. */
  sourceRoot: string;
  testRoot: string;
}

/** Relative path of the main source file. */
export function mainSourcePath(options: SourceOptions): string {
  const { config, packageName, mainClassName } = options;
  const packagePath = packageName.split('.').join('/');
  const ext = config.language === 'java' ? 'java' : config.language === 'kotlin' ? 'kt' : 'groovy';
  const langDir = config.language === 'java' ? 'java' : config.language === 'kotlin' ? 'kotlin' : 'groovy';
  return `${options.sourceRoot}/${langDir}/${packagePath}/${mainClassName}.${ext}`;
}

/** Relative path of the test source file. */
export function testSourcePath(options: SourceOptions): string {
  const { config, packageName, mainClassName } = options;
  const packagePath = packageName.split('.').join('/');
  const ext = config.language === 'java' ? 'java' : config.language === 'kotlin' ? 'kt' : 'groovy';
  const langDir = config.language === 'java' ? 'java' : config.language === 'kotlin' ? 'kotlin' : 'groovy';
  return `${options.testRoot}/${langDir}/${packagePath}/${mainClassName}Test.${ext}`;
}

function javaMain(options: SourceOptions): string {
  const { packageName, mainClassName } = options;
  return `package ${packageName};

public class ${mainClassName} {

  public static void main(String[] args) {
    System.out.println(greeting());
  }

  /** Returns the message printed on startup. */
  public static String greeting() {
    return "Hello from ${mainClassName}!";
  }
}
`;
}

function kotlinMain(options: SourceOptions): string {
  const { packageName, mainClassName } = options;
  return `package ${packageName}

class ${mainClassName} {

  fun greeting(): String = "Hello from ${mainClassName}!"
}

fun main() {
  println(${mainClassName}().greeting())
}
`;
}

function groovyMain(options: SourceOptions): string {
  const { packageName, mainClassName } = options;
  return `package ${packageName}

class ${mainClassName} {

  static void main(String[] args) {
    println greeting()
  }

  /** Returns the message printed on startup. */
  static String greeting() {
    return 'Hello from ${mainClassName}!'
  }
}
`;
}

function javaTest(options: SourceOptions): string {
  const { packageName, mainClassName } = options;
  return `package ${packageName};

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ${mainClassName}Test {

  @Test
  void greetingMentionsTheClassName() {
    assertEquals("Hello from ${mainClassName}!", ${mainClassName}.greeting());
  }
}
`;
}

function kotlinTest(options: SourceOptions): string {
  const { packageName, mainClassName } = options;
  return `package ${packageName}

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ${mainClassName}Test {

  @Test
  fun greetingMentionsTheClassName() {
    assertEquals("Hello from ${mainClassName}!", ${mainClassName}().greeting())
  }
}
`;
}

function groovyTest(options: SourceOptions): string {
  const { packageName, mainClassName } = options;
  return `package ${packageName}

import static org.junit.jupiter.api.Assertions.assertEquals

import org.junit.jupiter.api.Test

class ${mainClassName}Test {

  @Test
  void greetingMentionsTheClassName() {
    assertEquals('Hello from ${mainClassName}!', ${mainClassName}.greeting())
  }
}
`;
}

/** Render the entry point for the configured language. */
export function renderMain(options: SourceOptions): string {
  switch (options.config.language) {
    case 'kotlin':
      return kotlinMain(options);
    case 'groovy':
      return groovyMain(options);
    default:
      return javaMain(options);
  }
}

/** Render the test for the configured language. */
export function renderTest(options: SourceOptions): string {
  switch (options.config.language) {
    case 'kotlin':
      return kotlinTest(options);
    case 'groovy':
      return groovyTest(options);
    default:
      return javaTest(options);
  }
}

/** Fully qualified name of the entry point. */
export function mainClassFqn(packageName: string, mainClassName: string): string {
  return `${packageName}.${mainClassName}`;
}

/** Render a minimal `logback.xml` for projects that selected Logback. */
export function renderLogbackConfig(packageName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level ${escapeXml(packageName)} - %msg%n</pattern>
    </encoder>
  </appender>

  <root level="INFO">
    <appender-ref ref="STDOUT"/>
  </root>
</configuration>
`;
}

/** Render a minimal `log4j2.xml` for projects that selected Log4j 2. */
export function renderLog4jConfig(packageName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN">
  <Appenders>
    <Console name="Console" target="SYSTEM_OUT">
      <PatternLayout pattern="%d{HH:mm:ss.SSS} [%t] %-5level ${escapeXml(packageName)} - %msg%n"/>
    </Console>
  </Appenders>
  <Loggers>
    <Root level="info">
      <AppenderRef ref="Console"/>
    </Root>
  </Loggers>
</Configuration>
`;
}

/** Render a Spring Boot `application.properties` file. */
export function renderApplicationProperties(config: ProjectConfig): string {
  const name = config.artifactId;
  return `spring.application.name=${escapeKotlin(name)}
`;
}

/** Render a Spring Boot `application.yaml` file. */
export function renderApplicationYaml(config: ProjectConfig): string {
  const name = config.artifactId;
  return `spring:
  application:
    name: ${name}
`;
}

/** File name and contents for the Boot configuration file. */
export function renderBootConfig(config: ProjectConfig): { filename: string; content: string } {
  if (config.configFormat === 'yaml') {
    return { filename: 'application.yaml', content: renderApplicationYaml(config) };
  }
  return { filename: 'application.properties', content: renderApplicationProperties(config) };
}

/** Human readable title used in generated README files. */
export function projectTitle(config: ProjectConfig): string {
  return capitalize(config.name.replace(/[-_]+/g, ' '));
}

/** Language label for README output. */
export function languageLabel(language: Language): string {
  switch (language) {
    case 'kotlin':
      return 'Kotlin';
    case 'groovy':
      return 'Groovy';
    default:
      return 'Java';
  }
}
