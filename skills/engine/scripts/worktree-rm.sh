#!/usr/bin/env bash
set -euo pipefail

# worktree-rm.sh <slug> <n>
# Remove the scratch worktree at .dev953/work/<slug>/a<n> and delete its branch.
# NO-OP-SAFE: an already-removed worktree or already-deleted branch is fine.
# Run serially by the Orchestrator only.

usage() { echo "usage: worktree-rm.sh <slug> <n>" >&2; exit 2; }

[ "$#" -eq 2 ] || usage
slug=$1
n=$2

case "$slug" in
  *[!A-Za-z0-9_.-]* | "" ) echo "worktree-rm.sh: invalid slug" >&2; exit 2 ;;
esac
case "$n" in
  *[!0-9]* | "" ) echo "worktree-rm.sh: invalid attempt number" >&2; exit 2 ;;
esac

root=$(git rev-parse --show-toplevel)
target="$root/.dev953/work/$slug/a$n"
branch="dev953/$slug/a$n"

# Verify the target is a normalized child of .dev953/work before any removal.
case "$target" in
  "$root/.dev953/work/"*) : ;;
  *) echo "worktree-rm.sh: refusing path outside .dev953/work: $target" >&2; exit 2 ;;
esac

# Remove the worktree if present; --force handles a committed/dirty scratch tree.
if [ -e "$target" ]; then
  git worktree remove --force "$target" >&2 || true
fi
# Prune any stale registration left behind, then delete the branch if it exists.
git worktree prune >&2 || true
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git branch -D "$branch" >&2 || true
fi

exit 0
