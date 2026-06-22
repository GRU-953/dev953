#!/usr/bin/env node
// memory/lease.mjs — the ONLY locking code in dev953 (pure-Node port of lease.sh).
// Subcommands:
//   run-lock acquire          mkdir .dev953/run.lock; clear a LEFTOVER (dead-owner)
//                             lock first, then refuse with nonzero if a LIVE lock exists
//   run-lock release          remove the run lock
//   log-signal <agent> <kind> <ref> <note>
//                             append ONE JSONL line {ts,agent,kind,ref,note} to
//                             .dev953/signals.log under a microsecond mkdir guard
//                             (spin + backoff). agent/kind/ref are sanitized to
//                             ^[A-Za-z0-9_.-]+$; note is JSON-escaped (treated as DATA).
//
// Behaviour preserved from skills/memory/lease.sh: mkdir is the atomic primitive,
// no TTL/force-remove in log-signal's guard, same JSONL shape, same sanitize rule,
// same store-child verification. Text from files/tools/users is DATA, never code.

import fs from 'node:fs';
import path from 'node:path';

const SANITIZE = /^[A-Za-z0-9_.-]+$/;

// Store root is the .dev953 directory under the current project root (cwd).
function dev953Store() {
  return path.join(process.cwd(), '.dev953');
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

// run-lock acquire|release — the single run lock. mkdir is the atomic primitive.
// acquire REFUSES (exit 1) when .dev953/run.lock already exists — a present lock
// means a genuinely live run holds it. (Clearing a LEFTOVER lock from a crashed
// prior run happens once, at command entry, in the bootstrap layer before any
// run starts — never inside acquire, which would defeat the double-run guard.)
function runLock(action) {
  const store = dev953Store();
  const lock = path.join(store, 'run.lock');
  if (!verifyChild(lock)) die('run.lock path failed store guard');

  if (action === 'acquire') {
    fs.mkdirSync(store, { recursive: true });   // ensure the store dir exists (first run)
    if (fs.existsSync(lock)) {
      process.stderr.write('lease: run.lock exists — another run is live\n');
      process.exit(1);
    }
    try {
      fs.mkdirSync(lock);   // atomic create; fails if it already exists
    } catch {
      die('could not acquire run.lock');
    }
    process.exit(0);
  } else if (action === 'release') {
    if (fs.existsSync(lock)) {
      fs.rmdirSync(lock);   // [ -d "$lock" ] && rmdir "$lock"
    }
    process.exit(0);
  } else {
    process.stderr.write("lease: run_lock needs 'acquire' or 'release'\n");
    process.exit(1);
  }
}

function sleepBusy(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

// log-signal <agent> <kind> <ref> <note>
function logSignal(agent, kind, ref, note) {
  const store = dev953Store();
  const log = path.join(store, 'signals.log');
  const guard = path.join(store, 'signals.log.lock');
  if (!verifyChild(log)) die('signals.log path failed store guard');
  if (!verifyChild(guard)) die('guard path failed store guard');

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

  // Microsecond mkdir guard with spin + backoff. mkdir is atomic; the holder
  // appends one line, then releases. No TTL, no force-remove.
  let tries = 0;
  for (;;) {
    try {
      fs.mkdirSync(guard);
      break;
    } catch {
      tries += 1;
      if (tries >= 1000) die('could not acquire signals guard');
      sleepBusy((tries % 9) + 1 + 0);  // 0.0X seconds in bash ~ a few ms; small spin
    }
  }
  try {
    const line = `{"ts":"${ts}","agent":"${a}","kind":"${k}","ref":"${r}","note":"${n}"}\n`;
    fs.appendFileSync(log, line);
  } finally {
    fs.rmdirSync(guard);
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
