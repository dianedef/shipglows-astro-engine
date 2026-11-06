#!/usr/bin/env bash
# Gives a host that only has one repository (CI, Vercel) the shared engines its
# package.json reads by path, such as ../../shipglows-astro-engine/packages/....
# Same contract as tool/provide-engines.sh of app-engine, for package.json.
#
#   curl -fsSL https://raw.githubusercontent.com/commandglows/astro-engine/main/tool/provide-engines.sh | bash -s -- [dir]
#
# dir holds the package.json to follow (default: current directory). An existing
# folder is kept as it is, so a developer checkout is never changed.
#
# Each engine comes from its main branch. To pin one, add a line
# "<repository> <commit>" to an `engine-refs` file next to the package.json.
set -euo pipefail

CLONE_BASE="${ENGINE_CLONE_BASE:-https://github.com/commandglows}"
START="$(cd "${1:-.}" && pwd -P)"
REFS_FILE="$START/engine-refs"

provide() {
  local engine="$1" repository="$2" relative destination ref=""
  # Folder holding the engine, as written in package.json: "link:../../shipglows-astro-engine/packages/ui".
  relative="$(sed -nE "s#.*\"(link|file):([^\"]*/)?$engine/[^\"]*\".*#\2#p" "$START/package.json" | tr -d '\r' | sort -u)"
  [[ -z "$relative" ]] && return 0
  if [[ "$relative" == *$'\n'* ]]; then
    echo "ERROR: $START/package.json reads $engine from several folders:" >&2
    echo "$relative" >&2
    exit 1
  fi

  mkdir -p "$START/$relative"
  destination="$(cd "$START/$relative" && pwd -P)/$engine"

  if [[ -e "$destination" ]]; then
    echo "Keeping $destination" >&2
  else
    if [[ -f "$REFS_FILE" ]]; then
      ref="$(awk -v repo="$repository" '$1 == repo { print $2 }' "$REFS_FILE" | tr -d '\r')"
    fi
    if [[ -n "$ref" ]]; then
      echo "Cloning $repository at $ref" >&2
      git clone --quiet --no-checkout "$CLONE_BASE/$repository" "$destination"
      git -C "$destination" checkout --quiet --detach "$ref"
    else
      echo "Cloning $repository" >&2
      git clone --quiet --depth 1 --single-branch --branch main "$CLONE_BASE/$repository" "$destination"
    fi
  fi

  # A path dependency does not bring the package's own dependencies (yaml, @lucide/astro) to the site.
  # Its own pnpm version: the hosts run several, and old ones cannot read this lockfile.
  if [[ -f "$destination/pnpm-lock.yaml" && ! -d "$destination/node_modules" ]]; then
    (cd "$destination" && npx --yes pnpm@10 install --frozen-lockfile --prod)
  fi
}

provide shipglows-astro-engine astro-engine
provide shipglows-app-engine app-engine
echo "Engines ready."
