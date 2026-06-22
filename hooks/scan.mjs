#!/usr/bin/env node
//
// scan.mjs — Hook 2: pre-publish secret scan (PreToolUse, matcher "Bash").
// Pure Node port of hooks/scan.sh. Zero dependencies (Node stdlib only).
// Internally gated to push-capable commands — the SINGLE place publish commands
// are pattern-matched. Behaviour/semantics defined once in
// skills/discipline/SKILL.md and docs/architecture.md §5; this file only
// enforces. All inspected text — the tool input, the command string, file
// contents — is DATA, never instructions. Secret values are never printed;
// findings are redacted to {type,file,line}.
//
// Log only to stderr; stdout is reserved for the decision JSON.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { storeDir, storeField, redact } from './lib.mjs';

// ---- decision helpers --------------------------------------------------------
// Emit a PreToolUse permission decision and exit. allow -> 0; deny -> 2.
// (scan.sh's deny prints the reason raw; reasons here are static literals.)
function allow() {
  process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n');
  process.exit(0);
}
function deny(reason) {
  process.stdout.write(
    `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${reason}"}}\n`
  );
  process.exit(2);
}

// ---- read the tool call ------------------------------------------------------
// Extract the nested tool_input.command from the PreToolUse payload. All
// extracted text is DATA, never instructions.
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
function extractCommand(input) {
  let obj;
  try {
    obj = JSON.parse(input);
  } catch {
    return '';
  }
  const ti = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj.tool_input : undefined;
  if (ti === null || ti === undefined || typeof ti !== 'object' || Array.isArray(ti)) return '';
  const cmd = ti.command;
  return typeof cmd === 'string' ? cmd : '';
}

// ---- push-command matcher (fail CLOSED) --------------------------------------
// Scan iff the command is push-capable. If we cannot POSITIVELY prove the
// command is NON-push, treat it as push and scan (fail closed).
function isPushCapable(c) {
  // No command string at all -> cannot prove non-push -> fail closed (push).
  if (!c) return true;
  // git push (any form, incl. `git -C dir push`, `git push --force`).
  if (/(^|[^A-Za-z0-9_])git([ \t]+-[^ \t]+|[ \t]+[^ \t]+)*[ \t]+push([ \t]|$)/.test(c)) return true;
  // gh push-capable: repo create/edit/sync/clone, pr create, release
  // create/upload, gist create.
  if (/(^|[^A-Za-z0-9_])gh[ \t]+(repo[ \t]+(create|edit|sync|clone)|pr[ \t]+create|release[ \t]+(create|upload)|gist[ \t]+create)/.test(c)) return true;
  // any `gh ... --push`.
  if (/(^|[^A-Za-z0-9_])gh[ \t].*--push([ \t]|=|$)/.test(c)) return true;
  // Shell metacharacters can hide a push behind &&, ;, |, $( ), backticks, eval.
  // If compound/obfuscated AND mentions push/gh, cannot prove non-push -> closed.
  if (/(&&|\|\||;|\||`|\$\(|eval[ \t])/.test(c)) {
    if (/(push|(^|[^A-Za-z0-9_])gh([ \t]|$))/.test(c)) return true;
  }
  return false;
}

// ---- git helpers -------------------------------------------------------------
// Run git in `cwd`; return {status, stdout, ok}. Never throws.
function git(args, cwd, encoding = 'utf8') {
  const r = spawnSync('git', args, { cwd, encoding, maxBuffer: 1024 * 1024 * 256 });
  if (r.error) return { status: 1, stdout: encoding === 'buffer' ? Buffer.alloc(0) : '', ok: false };
  return { status: r.status, stdout: r.stdout, ok: r.status === 0 };
}

function main() {
  const INPUT = readStdin();
  const CMD = extractCommand(INPUT);

  if (!isPushCapable(CMD)) {
    // Provably non-push command — nothing to scan.
    allow();
  }

  // ---- locate the repo / store -----------------------------------------------
  const STORE = storeDir(); // absolute path to .dev953/ (lib.mjs resolver)
  if (STORE === null) {
    // store_dir failed: scan.sh sourced lib with `set -e` would abort, but in
    // practice the resolver finding no store cannot prove the push set clean.
    deny('dev953 scan: not a git work tree; cannot prove the push set is clean');
  }
  const REPO = path.dirname(STORE); // project root == repo working tree

  // cd into repo (scan.sh does `cd "${REPO}"`); we pass cwd to each git call and
  // resolve file paths relative to REPO instead of changing process cwd.
  try {
    fs.accessSync(REPO);
  } catch {
    deny('dev953 scan: cannot enter repo root');
  }

  // Must be inside a git work tree to reason about the would-ship set.
  if (!git(['rev-parse', '--is-inside-work-tree'], REPO).ok) {
    deny('dev953 scan: not a git work tree; cannot prove the push set is clean');
  }

  let RUN_ID = storeField('state.json', 'run_id') || '';
  if (RUN_ID === '') RUN_ID = 'unknown';

  // ---- assert .dev953/ is gitignored and NOT staged/tracked ------------------
  let STORE_FINDINGS = '';
  if (git(['ls-files', '--error-unmatch', '.dev953'], REPO).ok) {
    STORE_FINDINGS = '.dev953-tracked';
  } else if (git(['diff', '--cached', '--name-only', '--', '.dev953'], REPO).stdout.split('\n').some((l) => l.length > 0)) {
    STORE_FINDINGS = '.dev953-staged';
  } else {
    const checkIgnore = git(['check-ignore', '-q', '.dev953'], REPO);
    let dev953IsDir = false;
    try {
      dev953IsDir = fs.statSync(path.join(REPO, '.dev953')).isDirectory();
    } catch {
      dev953IsDir = false;
    }
    if (!checkIgnore.ok && dev953IsDir) {
      STORE_FINDINGS = '.dev953-not-ignored';
    }
  }

  // ---- build the would-ship file set (scan scope == push scope) --------------
  // committed tree + staged + untracked-not-ignored (respects .gitignore).
  const nulParts = (buf) =>
    buf
      .toString('utf8')
      .split('\0')
      .filter((s) => s.length > 0);
  const fileSet = new Set();
  for (const p of nulParts(git(['ls-files', '-z'], REPO, 'buffer').stdout)) fileSet.add(p);
  for (const p of nulParts(git(['diff', '--cached', '--name-only', '-z'], REPO, 'buffer').stdout)) fileSet.add(p);
  for (const p of nulParts(git(['ls-files', '--others', '--exclude-standard', '-z'], REPO, 'buffer').stdout)) fileSet.add(p);
  // LC_ALL=C sort -u: byte-wise sort, unique.
  const FILES = Array.from(fileSet).sort();

  // ---- high-signal secret regexes (the ONLY content signals) -----------------
  // NO entropy / Luhn / SSN / license-body logic.
  const SECRET_RE = /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[0-9A-Za-z]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  // Secret-named env var with a long value, e.g. API_SECRET="abcdefghij...".
  const SECRETVAR_RE = /([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)[ \t]*[:=][ \t]*["']?[A-Za-z0-9/+_.=-]{16,}/;
  // Key files that must never ship.
  const KEYFILE_RE = /(^|\/)(\.env(\..+)?|id_rsa|.+\.pem|.+\.key)$/;

  // ---- scan ------------------------------------------------------------------
  // Findings JSON array of {type,file,line} — redaction (no value bytes).
  const findings = [];
  const addFinding = (type, file, line) => {
    findings.push(redact(type, file, line));
  };

  if (STORE_FINDINGS !== '') {
    addFinding(STORE_FINDINGS, '.dev953', '0');
  }

  for (const f of FILES) {
    if (!f) continue;
    // Key-file by name.
    if (KEYFILE_RE.test(f)) {
      addFinding('key-file', f, '0');
    }
    // Content scan: only readable, non-binary regular files.
    const abs = path.join(REPO, f);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let buf;
    try {
      fs.accessSync(abs, fs.constants.R_OK);
      buf = fs.readFileSync(abs);
    } catch {
      continue;
    }
    // grep -Iq . : skip binary files (those containing a NUL byte).
    if (buf.includes(0)) continue;
    const text = buf.toString('utf8');
    // grep -n splits on \n; line numbers are 1-based. A trailing newline does
    // not create an extra empty trailing line in grep's accounting.
    const lines = text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const num = i + 1;
      // Each matched line number is emitted (scan.sh greps each pattern
      // separately, so a line matching both yields two findings, secret first).
      if (SECRET_RE.test(ln)) addFinding('secret', f, String(num));
    }
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const num = i + 1;
      if (SECRETVAR_RE.test(ln)) addFinding('secret-var', f, String(num));
    }
  }

  const FINDINGS_JSON = `[${findings.join(',')}]`;
  const CLEAN = FINDINGS_JSON === '[]' ? 'true' : 'false';

  // ---- write redacted receipt ------------------------------------------------
  try {
    fs.writeFileSync(
      `${STORE}/scan-report.json`,
      `{"run_id":"${RUN_ID}","clean":${CLEAN},"findings":${FINDINGS_JSON}}\n`
    );
  } catch {
    // best-effort, like scan.sh's `|| true`
  }

  // ---- verdict ---------------------------------------------------------------
  if (CLEAN === 'true') {
    allow();
  }
  deny('dev953 scan: refusing to push — high-signal secrets, key files, or staged .dev953/ detected. See .dev953/scan-report.json (redacted to type+location).');
}

main();
