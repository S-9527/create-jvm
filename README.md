# create-jvm

Scaffold Maven, Gradle and Spring Boot projects from the terminal — the IntelliJ
IDEA *New Project* wizard as a CLI.

```bash
npx create-jvm my-app
```

```text
┌  create-jvm  the JVM project scaffolder
│
◇  Project name
│  shop-api
│
◆  Select a project type
│  ● Spring Boot
│  ○ Maven
│  ○ Gradle
│  ○ Git template
│  ↑/↓ to navigate • Enter: confirm
│
◆  Select a build system
│  ● Maven — pom.xml
│  ○ Gradle — build.gradle / build.gradle.kts
│
◆  Select a language
│  ● Java
│  ○ Kotlin
│  ○ Groovy
│
◇  Artifact id
│  shop-api
│
◇  Group id
│  com.example
│
◇  Package name
│  com.example.shopapi
│
◆  Select packaging
│  ● Jar
│  ○ War
│
◆  Select a configuration file format
│  ● Properties — application.properties
│  ○ YAML — application.yaml
│
◆  Select a Java version
│  ● 21
│  ○ 17
│  ○ 25
│
◆  Select a Spring Boot version
│  ● 4.1.1
│  ○ 4.0.8
│
◆  Select dependencies
│  ...
│
└  Ready. Generating shop-api…
```

This mirrors the **Project Metadata** panel on start.spring.io: group, artifact,
package name, packaging, configuration format, Java version and Boot version are
all selectable. Each prompt is pre-filled with the value that would have been
derived from the project name, so the defaults are one Enter press each — and
passing the matching flag skips the prompt entirely.

## Why

`create-vite` made scaffolding a front-end project a single command. On the JVM
the equivalent is a GUI wizard, a website, or copying a project by hand. This
tool closes that gap: the same choices the IDE offers, in a terminal, with a
non-interactive mode that works in scripts and CI.

It is built on the same prompt library as `create-vite`, so the interaction
feels identical.

## Install

```bash
# one-off
npx create-jvm my-app

# or install it
npm install -g create-jvm
pnpm add -g create-jvm
```

Requires Node.js 18.17 or newer. Nothing else — the generated project brings its
own wrapper (`mvnw` / `gradlew`).

## What it generates

| Project type    | Build system        | Languages                |
| --------------- | ------------------- | ------------------------ |
| **Spring Boot** | Maven, Gradle       | Java, Kotlin, Groovy     |
| **Maven**       | Maven (jar / war)   | Java, Kotlin, Groovy     |
| **Gradle**      | Groovy or Kotlin DSL| Java, Kotlin, Groovy     |
| **Template**    | whatever the repo has | —                      |

Every generated project includes a runnable entry point, a matching test that
passes, a `.gitignore`, and a `README.md`.

Spring Boot projects are produced by [Spring Initializr](https://start.spring.io)
— the same service the IDE wizard and `start.spring.io` use — so Boot versions,
starter ids and build files always match upstream. Maven and Gradle projects are
generated locally from templates and work offline.

## Usage

```
create-jvm [project-name] [options]
```

Run it with no arguments for the interactive wizard. Pass flags to skip the
prompts you have already decided.

### Project type

```bash
create-jvm my-app                                  # wizard
create-jvm my-app --maven                          # plain Maven
create-jvm my-app --gradle                         # plain Gradle
create-jvm my-app --spring-boot                    # Spring Boot
create-jvm my-app -t gh:spring-projects/spring-petclinic   # remote template

# or via the create-* convention, no install needed
pnpm create jvm my-app
npm create jvm my-app
```

### Common options

| Option | Description |
| ------ | ----------- |
| `--group-id <id>` | Maven `groupId` (default `com.example`) |
| `--artifact-id <id>` | Maven `artifactId` (default derived from the name) |
| `--package <name>` | Base package (default derived from `groupId`) |
| `--project-version <v>` | Project version (default `0.0.1-SNAPSHOT`) |
| `--language <l>` | `java`, `kotlin` or `groovy` |
| `--java-version <v>` | `17`, `21`, `25` or `27` (default `21`) |
| `--dsl <groovy\|kotlin>` | Gradle DSL |
| `--packaging <jar\|war>` | Archive type |
| `--config-format <fmt>` | Spring Boot config file: `properties` or `yaml` |
| `--dep <ids>` | Dependencies from the catalog, comma separated |
| `--boot-dep <ids>` | Spring Boot starters by Initializr id |
| `--module <name>` | Add a module; repeatable, implies `--multi-module` |
| `--install` | Run a build after generating to verify it |
| `--dry-run` | List the files without writing anything |
| `--force` | Write into a non-empty directory |
| `--yes` | Never prompt; use defaults for anything unset |
| `--json` | Machine-readable output |

Run `create-jvm --help` for the full list, including every catalog dependency id.

### Examples

```bash
# Maven project with Lombok and the test stack
create-jvm orders-api --maven --dep lombok,junit5,mockito

# Spring Boot service with a driver, so the context actually starts
create-jvm orders-api --spring-boot --boot-dep web,data-jpa,postgresql,actuator

# Spring Boot with application.yaml instead of application.properties
create-jvm orders-api --spring-boot --boot-dep web --config-format yaml

# Kotlin service on Gradle with the Kotlin DSL
create-jvm billing --gradle --dsl kotlin --language kotlin --boot-dep web,actuator

# Multi-module Maven build
create-jvm platform --maven --module core --module web --module cli

# Generate, then prove it builds
create-jvm spike --spring-boot --boot-dep web --install

# Preview without touching the disk
create-jvm spike --maven --dep guava --dry-run
```

### Non-interactive and CI use

`--yes` (or `--json`, or a non-TTY stdin) disables prompting. Anything not
supplied on the command line falls back to its default, so a bare
`create-jvm app --yes --spring-boot --boot-dep web` is fully deterministic:

```bash
create-jvm app --yes --spring-boot --boot-dep web,actuator --json
```

### Remote templates

Any git repository can act as a template. The repository is downloaded as a
tarball, so no `.git` history is copied.

```bash
create-jvm my-app -t gh:owner/repo
create-jvm my-app -t gh:owner/repo/templates/api   # subdirectory
create-jvm my-app -t gh:owner/repo#v2              # branch or tag
create-jvm my-app -t gitlab:owner/repo
create-jvm my-app -t https://github.com/owner/repo
```

## Notes on generated builds

Two details are worth knowing, because they are deliberate:

- **Plugin and dependency versions are pinned.** Generated POMs do not inherit
  from a parent, so every dependency and plugin carries an explicit version.
  Builds stay reproducible and do not drift when a plugin releases.
- **No Java toolchain is requested.** Java compilation targets the chosen
  release via `options.release` / `maven.compiler.release` rather than a Gradle
  toolchain, which would make Gradle download a JDK. The build therefore works
  offline with whatever JDK is installed, as long as it is at least as new as
  the selected target.

One upstream caveat: selecting a persistence starter (`data-jpa`, `jdbc`, …)
without a database driver produces a project whose context fails to start.
Initializr accepts this combination too. `create-jvm` warns about it and suggests
adding a driver such as `h2`.

## Development

```bash
npm install
npm run build       # compile to dist/
npm run dev         # run from source via tsx
npm test            # unit tests
npm run typecheck   # tsc --noEmit
```

The source is organised so each concern is separable:

| Path | Purpose |
| ---- | ------- |
| `src/index.ts` | entry point: argument handling, wizard or flags, dispatch |
| `src/wizard.ts` | the interactive prompts |
| `src/args.ts` | flag parsing |
| `src/catalog.ts` | dependency catalog for plain Maven/Gradle projects |
| `src/generators/` | one module per output: `pom`, `gradle`, `initializr`, `remote`, … |
| `src/writer.ts` | the in-memory file map that generators return |
| `src/run.ts` | materialise files, `git init`, optional build |

Generators never touch the filesystem. They return a `FileMap`, which is what
makes `--dry-run` trivial and the generators unit-testable without temp
directories.

## License

MIT
