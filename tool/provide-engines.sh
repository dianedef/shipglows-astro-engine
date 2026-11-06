#!/usr/bin/env bash
# Gives a host that only has one repository (CI, Vercel) the shared Astro packages
# its package.json reads by path, such as ../../shipglows-astro-engine/packages/....
# Same contract as tool/provide-engines.sh of app-engine, for package.json.
#
#   curl -fsSL https://raw.githubusercontent.com/commandglows/astro-engine/main/tool/provide-engines.sh | bash -s -- [dir]
#
# dir holds the package.json to follow (default: current directory). An existing
# folder is kept as it is, so a developer checkout is never changed.
#
# The engine comes from its main branch. To pin it, add a line
# "astro-engine <commit>" to an `engine-refs` file next to the package.json.
set -euo pipefail

CLONE_BASE="${ENGINE_CLONE_BASE:-https://github.com/commandglows}"
START="$(cd "${1:-.}" && pwd -P)"
REFS_FILE="$START/engine-refs"
ENGINE=shipglows-astro-engine
REPOSITORY=astro-engine

# Folder holding the engine, as written in package.json: "link:../../shipglows-astro-engine/packages/ui".
relative="$(sed -nE "s#.*\"(link|file):([^\"]*/)?$ENGINE/packages/[^\"]*\".*#\2#p" "$START/package.json" | tr -d '\r' | sort -u)"
if [[ -z "$relative" ]]; then
  echo "No $ENGINE path dependency in $START/package.json." >&2
  exit 0
fi
if [[ "$relative" == *$'\n'* ]]; then
  echo "ERROR: $START/package.json reads $ENGINE from several folders:" >&2
  echo "$relative" >&2
  exit 1
fi

mkdir -p "$START/$relative"
destination="$(cd "$START/$relative" && pwd -P)/$ENGINE"

if [[ -e "$destination" ]]; then
  echo "Keeping $destination" >&2
else
  ref=""
  if [[ -f "$REFS_FILE" ]]; then
    ref="$(awk -v repo="$REPOSITORY" '$1 == repo { print $2 }' "$REFS_FILE" | tr -d '\r')"
  fi
  if [[ -n "$ref" ]]; then
    echo "Cloning $REPOSITORY at $ref" >&2
    git clone --quiet --no-checkout "$CLONE_BASE/$REPOSITORY" "$destination"
    git -C "$destination" checkout --quiet --detach "$ref"
  else
    echo "Cloning $REPOSITORY" >&2
    git clone --quiet --depth 1 --single-branch --branch main "$CLONE_BASE/$REPOSITORY" "$destination"
  fi
fi

# A path dependency does not bring the package's own dependencies (yaml, @lucide/astro) to the site.
# Its own pnpm version: the hosts run several, and old ones cannot read this lockfile.
if [[ ! -d "$destination/node_modules" ]]; then
  (cd "$destination" && npx --yes pnpm@10 install --frozen-lockfile --prod)
fi
echo "Astro engine ready."
