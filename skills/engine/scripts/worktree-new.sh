#!/usr/bin/env bash
set -euo pipefail

# worktree-new.sh <slug> <n>
# Create one isolated scratch worktree off the FROZEN BASE at
# .dev953/work/<slug>/a<n> and print its absolute path.
# Fails LOUDLY on collision (no silent force-remove); recovery is the loop's job
# via worktree-rm.sh. Run serially by the Orchestrator only — never by agents
# concurrently. The frozen base SHA is passed via env DEV953_BASE.

usage() { echo "usage: worktree-new.sh <slug> <n>  (env DEV953_BASE=<frozen base SHA>)" >&2; exit 2; }

[ "$#" -eq 2 ] || usage
slug=$1
n=$2

# Sanitize refs the same shape memory's lease.sh uses; reject anything else.
case "$slug" in
  *[!A-Za-z0-9_.-]* | "" ) echo "worktree-new.sh: invalid slug" >&2; exit 2 ;;
esac
case "$n" in
  *[!0-9]* | "" ) echo "worktree-new.sh: invalid attempt number" >&2; exit 2 ;;
esac

base=${DEV953_BASE:-}
[ -n "$base" ] || { echo "worktree-new.sh: DEV953_BASE (frozen base SHA) not set" >&2; exit 2; }

# Resolve the store and verify the target is a normalized child of .dev953/work.
root=$(git rev-parse --show-toplevel)
workdir="$root/.dev953/work/$slug"
target="$workdir/a$n"
branch="dev953/$slug/a$n"

case "$target" in
  "$root/.dev953/work/"*) : ;;
  *) echo "worktree-new.sh: refusing path outside .dev953/work: $target" >&2; exit 2 ;;
esac

# FAIL LOUDLY on collision — never force-remove an existing worktree or branch.
if [ -e "$target" ]; then
  echo "worktree-new.sh: collision, path already exists: $target (use worktree-rm.sh first)" >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "worktree-new.sh: collision, branch already exists: $branch (use worktree-rm.sh first)" >&2
  exit 1
fi

mkdir -p "$workdir"
git worktree add -b "$branch" "$target" "$base" >&2

# Print the absolute path on stdout for the loop to capture.
( cd "$target" && pwd )
