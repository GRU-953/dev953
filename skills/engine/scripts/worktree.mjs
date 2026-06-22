#!/usr/bin/env node
// worktree.mjs — pure-Node port of worktree-new.sh + worktree-rm.sh.
// Subcommands:
//   new <slug> <n>   Create one isolated scratch worktree off the FROZEN BASE at
//                    .dev953/work/<slug>/a<n> and print its absolute path on stdout.
//                    Fails LOUDLY on collision (no silent force-remove). The frozen
//                    base SHA is passed via env DEV953_BASE.
//   rm  <slug> <n>   Remove the scratch worktree and delete its branch. NO-OP-SAFE:
//                    an already-removed worktree / already-deleted branch is fine.
//
// Run serially by the Orchestrator only. Behaviour preserved exactly from the .sh
// originals: same sanitize shape, same path guard, same git invocations, same exit
// codes (usage/guard=2, collision=1, success=0). git chatter goes to stderr; only
// `new` prints the worktree path to stdout.

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SANITIZE = /^[A-Za-z0-9_.-]+$/;
const DIGITS = /^[0-9]+$/;

// Run git with ALL its output routed to stderr (the .sh originals append `>&2` to
// every mutating git call, so nothing git prints pollutes our stdout — which carries
// only the worktree path). stdin ignored; both stdout and stderr -> our stderr.
function git(args) {
  return spawnSync('git', args, {
    stdio: ['ignore', 2, 2],
    encoding: 'utf8',
  });
}

function gitProbe(args) {
  // Used for `git show-ref --verify --quiet` — discard all output, return status.
  return spawnSync('git', args, { stdio: 'ignore' });
}

function usageNew() {
  process.stderr.write('usage: worktree.mjs new <slug> <n>  (env DEV953_BASE=<frozen base SHA>)\n');
  process.exit(2);
}

function usageRm() {
  process.stderr.write('usage: worktree.mjs rm <slug> <n>\n');
  process.exit(2);
}

function validate(slug, n, label) {
  if (slug === undefined || !SANITIZE.test(slug)) {
    process.stderr.write(`worktree-${label}.sh: invalid slug\n`);
    process.exit(2);
  }
  if (n === undefined || !DIGITS.test(n)) {
    process.stderr.write(`worktree-${label}.sh: invalid attempt number\n`);
    process.exit(2);
  }
}

function topLevel() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    // git itself reports the failure to stderr; mirror set -e behaviour.
    process.exit(r.status === null ? 1 : r.status);
  }
  return r.stdout.replace(/\r?\n$/, '');
}

function cmdNew(slug, n) {
  validate(slug, n, 'new');

  const base = process.env.DEV953_BASE || '';
  if (!base) {
    process.stderr.write('worktree: DEV953_BASE (frozen base SHA) not set\n');
    process.exit(2);
  }

  const root = topLevel();
  const workdir = path.join(root, '.dev953', 'work', slug);
  const target = path.join(workdir, `a${n}`);
  const branch = `dev953/${slug}/a${n}`;

  const prefix = path.join(root, '.dev953', 'work') + path.sep;
  if (!target.startsWith(prefix)) {
    process.stderr.write(`worktree: refusing path outside .dev953/work: ${target}\n`);
    process.exit(2);
  }

  // FAIL LOUDLY on collision — never force-remove an existing worktree or branch.
  if (fs.existsSync(target)) {
    process.stderr.write(`worktree: collision, path already exists: ${target} (use 'worktree rm' first)\n`);
    process.exit(1);
  }
  if (gitProbe(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) {
    process.stderr.write(`worktree: collision, branch already exists: ${branch} (use 'worktree rm' first)\n`);
    process.exit(1);
  }

  fs.mkdirSync(workdir, { recursive: true });
  const add = git(['worktree', 'add', '-b', branch, target, base]);
  if (add.status !== 0) {
    process.exit(add.status === null ? 1 : add.status);
  }

  // Print the absolute path on stdout for the loop to capture.
  process.stdout.write(fs.realpathSync(target) + '\n');
  process.exit(0);
}

function cmdRm(slug, n) {
  validate(slug, n, 'rm');

  const root = topLevel();
  const target = path.join(root, '.dev953', 'work', slug, `a${n}`);
  const branch = `dev953/${slug}/a${n}`;

  const prefix = path.join(root, '.dev953', 'work') + path.sep;
  if (!target.startsWith(prefix)) {
    process.stderr.write(`worktree: refusing path outside .dev953/work: ${target}\n`);
    process.exit(2);
  }

  // Remove the worktree if present; --force handles a committed/dirty scratch tree.
  if (fs.existsSync(target)) {
    git(['worktree', 'remove', '--force', target]);  // || true — ignore status
  }
  // Prune any stale registration left behind, then delete the branch if it exists.
  git(['worktree', 'prune']);                          // || true
  if (gitProbe(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) {
    git(['branch', '-D', branch]);                     // || true
  }

  process.exit(0);
}

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (sub === 'new') {
    if (argv.length !== 3) usageNew();
    cmdNew(argv[1], argv[2]);
  } else if (sub === 'rm') {
    if (argv.length !== 3) usageRm();
    cmdRm(argv[1], argv[2]);
  } else {
    process.stderr.write('usage: worktree.mjs <new|rm> <slug> <n>\n');
    process.exit(2);
  }
}

main();
