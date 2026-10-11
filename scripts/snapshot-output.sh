#!/usr/bin/env bash
# Generate one project per configuration and hash every produced file.
#
# Used to prove a refactor did not change any generated output: run before and
# after, then diff the manifests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Absolute, because gen() cds into the output directory before invoking it.
CLI="$(cd "${1:-$SCRIPT_DIR/../dist/cli.js}" 2>/dev/null && pwd || echo "${1:-$SCRIPT_DIR/../dist/cli.js}")"
OUT="${2:-/tmp/create-jvm-snapshot}"
rm -rf "$OUT" && mkdir -p "$OUT/projects"

gen() {
  local name="$1"; shift
  ( cd "$OUT/projects" && node "$CLI" "$name" "$@" --no-git --no-color --quiet >/dev/null 2>&1 )
}

# Cover every generator, language, DSL and packaging combination.
gen mvn-java    --maven  --dep lombok,junit5,mockito
gen mvn-kotlin  --maven  --language kotlin
gen mvn-groovy  --maven  --language groovy
gen mvn-war     --maven  --packaging war
gen mvn-mm      --maven  --module core --module web
gen grd-java    --gradle
gen grd-kts     --gradle --dsl kotlin
gen grd-kotlin  --gradle --dsl kotlin --language kotlin
gen grd-groovy  --gradle --language groovy
gen grd-mm      --gradle --module core --module web
gen boot-java   --spring-boot --boot-dep web --java-version 21
gen boot-yaml   --spring-boot --boot-dep web,actuator --config-format yaml --packaging war

# Hash every file, excluding build output and wrapper binaries (downloaded).
( cd "$OUT/projects" && find . -type f \
    -not -path './*/target/*' \
    -not -path './*/build/*' \
    -not -path './*/gradle/wrapper/*' \
    -not -path './*/.mvn/wrapper/*' \
    -print0 | sort -z | xargs -0 sha256sum ) > "$OUT/manifest.txt"

echo "files hashed: $(wc -l < "$OUT/manifest.txt")"
echo "manifest: $OUT/manifest.txt"
