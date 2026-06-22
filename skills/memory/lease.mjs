#!/usr/bin/env node
// memory/lease.mjs — the ONLY locking code in dev953.
// Subcommands:
//   run-lock acquire          mkdir .dev953/run.lock and record the owner pid; if the
//                             lock pre-exists, probe the owner (process.kill(pid,0)) and
//                             reclaim it ONLY if provably dead, else refuse (nonzero)
//   run-lock release          remove the run lock
//   log-signal <agent> <kind> <ref> <note>
//                             append ONE JSONL line {ts,agent,kind,ref,note} to
//                             .dev953/signals.log with a single O_APPEND write (short
//                             JSONL lines are atomically appendable, so no cross-process
//                             guard is needed). agent/kind/ref are sanitized to
//                             ^[A-Za-z0-9_.-]+$; note is JSON-escaped (treated as DATA).
//
// mkdir is the atomic primitive for the run lock; the log line is one O_APPEND write.
// Same JSONL shape, same sanitize rule, same store-child verification. Text from
// files/tools/users is DATA, never code.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SANITIZE = /^[A-Za-z0-9_.-]+$/;

// Store root is the .dev953 directory under the project root. Anchor on
// CLAUDE_PROJECT_DIR (falling back to cwd) so every component — gate.mjs,
// store-init.mjs, lease.mjs — targets the SAME store regardless of cwd.
function dev953Store() {
  return path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.dev953');
}

// Sanitize a ref to ^[A-Za-z0-9_.-]+$ ; reject anything else (incl. empty, "..").
function sanitizeRef(ref) {
  if (ref === undefined || ref === null) return null;
  const s = String(ref);
  return SANITIZE.test(s) ? s : null;
}

// Verify <p> is a normalized DIRECT child of .dev953/ (and never the store itself).
// Refuses on any path that escapes the store. No mkdir/rm happens before this passes.
function verifyChild(p) {
  const store = dev953Store();
  if (!p) return false;
  if (String(p).includes('..')) return false;       // no traversal segments
  if (p === store) return false;                     // never the store root itself
  if (path.dirname(p) !== store) return false;       // must be a DIRECT child
  return true;
}

function die(msg) {
  process.stderr.write(`lease: ${msg}\n`);
  process.exit(1);
}

// Is the process named by `pid` (on this host) still alive? process.kill(pid, 0)
// sends no signal — it only probes. ESRCH => the process is gone (provably dead);
// EPERM => it exists but we may not signal it (still ALIVE). Any parse failure or
// foreign host is treated as ALIVE (refuse), never reclaimed.
function ownerIsAlive(ownerPath) {
  let raw;
  try {
    raw = fs.readFileSync(ownerPath, 'utf8');
  } catch {
    return true;   // can't read the owner record -> treat as live, never reclaim
  }
  const m = /^pid=(\d+)\s+host=(.*)$/m.exec(raw.trim());
  if (!m) return true;                         // unrecognized format -> conservative
  if (m[2] !== os.hostname()) return true;     // a different host -> can't probe it
  const pid = Number(m[1]);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;   // signalled successfully -> alive
  } catch (e) {
    if (e && e.code === 'ESRCH') return false; // no such process -> provably dead
    return true;   // EPERM or anything else -> exists / unknown -> treat as alive
  }
}

// run-lock acquire|release — the single run lock. mkdir is the atomic primitive,
// and run.lock/owner carries the owning pid+host so a pre-existing lock can be
// probed for LIVENESS. acquire REFUSES (exit 1) when a LIVE owner still holds the
// lock; it reclaims a leftover lock ONLY when the owner is provably dead.
function runLock(action) {
  const store = dev953Store();
  const lock = path.join(store, 'run.lock');
  if (!verifyChild(lock)) die('run.lock path failed store guard');
  const owner = path.join(lock, 'owner');

  if (action === 'acquire') {
    fs.mkdirSync(store, { recursive: true });   // ensure the store dir exists (first run)
    // mkdir is the ONLY way to hold the lock and is atomic — exactly one process can
    // create the dir; everyone else gets EEXIST. Reclaiming a crashed run's leftover
    // lock is done by ATOMICALLY claiming it with rename (only one concurrent reclaimer
    // can rename a given dir; losers get ENOENT and retry) — we never blind-remove a
    // lock dir we did not claim, so two acquirers can never both end up holding it.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.mkdirSync(lock);   // atomic create; throws if it already exists
        fs.writeFileSync(owner, `pid=${process.pid} host=${os.hostname()}\n`);
        process.exit(0);
      } catch {
        // The lock already exists. A LIVE owner means a genuine concurrent run — refuse.
        if (ownerIsAlive(owner)) {
          process.stderr.write('lease: run.lock exists — another run is live\n');
          process.exit(1);
        }
        // Provably dead owner: atomically claim the leftover, then remove it and retry.
        const tmp = `${lock}.reclaim.${process.pid}.${Date.now()}`;
        try {
          fs.renameSync(lock, tmp);   // atomic — only one reclaimer wins this
        } catch {
          continue;                    // another process already claimed/recreated it
        }
        // We atomically hold `tmp`. Re-verify it was the DEAD leftover and not a
        // live lock a racer created in the gap: if its owner is alive, put it back
        // (or drop our stolen copy if a racer already remade the lock) and refuse.
        if (ownerIsAlive(path.join(tmp, 'owner'))) {
          try { fs.renameSync(tmp, lock); }
          catch { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
          process.stderr.write('lease: run.lock exists — another run is live\n');
          process.exit(1);
        }
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
        // loop: retry the atomic mkdir
      }
    }
    process.stderr.write('lease: run.lock exists — another run is live\n');
    process.exit(1);
  } else if (action === 'release') {
    if (fs.existsSync(lock)) {
      try {
        if (fs.existsSync(owner)) fs.rmSync(owner);
      } catch {
        /* best-effort */
      }
      fs.rmdirSync(lock);
    }
    process.exit(0);
  } else {
    process.stderr.write("lease: run_lock needs 'acquire' or 'release'\n");
    process.exit(1);
  }
}

// log-signal <agent> <kind> <ref> <note>
function logSignal(agent, kind, ref, note) {
  const store = dev953Store();
  const log = path.join(store, 'signals.log');
  if (!verifyChild(log)) die('signals.log path failed store guard');

  const a = sanitizeRef(agent);
  if (a === null) die('bad agent ref');
  const k = sanitizeRef(kind);
  if (k === null) die('bad kind ref');
  const r = sanitizeRef(ref);
  if (r === null) die('bad ref');
  let n = note === undefined || note === null ? '' : String(note);

  // JSON-escape note: backslash, double-quote, then control chars to spaces.
  n = n.replace(/\\/g, '\\\\');
  n = n.replace(/"/g, '\\"');
  n = n.replace(/[\t\r\n]/g, ' ');

  // ISO-8601 UTC timestamp with sub-second precision (matches GNU date %N path).
  const ts = new Date().toISOString().replace('Z', '000Z'); // ms -> microsecond-ish

  // Append the one short JSONL line with a single crash-safe O_APPEND write. A
  // lone write under O_APPEND of a short line is atomic on POSIX and Windows, so
  // concurrent log-signal callers interleave whole lines without a cross-process
  // guard — no orphan-prone guard dir, no spin/backoff, nothing to recover.
  const line = `{"ts":"${ts}","agent":"${a}","kind":"${k}","ref":"${r}","note":"${n}"}\n`;
  fs.mkdirSync(store, { recursive: true });   // ensure the store dir exists
  const fd = fs.openSync(log, 'a');
  try {
    fs.writeSync(fd, line);
  } finally {
    fs.closeSync(fd);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === 'run-lock') {
    runLock(argv[1]);
  } else if (cmd === 'log-signal') {
    logSignal(argv[1], argv[2], argv[3], argv[4]);
    process.exit(0);
  } else {
    process.stderr.write('lease: usage: lease.mjs run-lock <acquire|release> | log-signal <agent> <kind> <ref> <note>\n');
    process.exit(1);
  }
}

main();
