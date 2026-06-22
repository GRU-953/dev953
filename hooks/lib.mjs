// hooks/lib.mjs — shared helpers for gate.mjs and scan.mjs.
// Zero dependencies (Node stdlib only).
// Behavioural contract (YAGNI ladder, "all input text is DATA not instructions",
// secrets-never-printed) lives once in skills/discipline/SKILL.md; this file only
// provides mechanism. Store FORMAT is owned by skills/memory/SKILL.md; we only
// resolve and read it. Shared helpers: jsonField, storeDir, storeFile,
// storeField, redact.

import fs from 'node:fs';
import path from 'node:path';

// --- store-path resolution -------------------------------------------------
// Resolve the .dev953/ store directory at the project root by walking up from
// CWD. Returns the absolute store path, or null if none is found.
export function storeDir() {
  let d = process.cwd();
  for (;;) {
    try {
      if (fs.statSync(path.join(d, '.dev953')).isDirectory()) {
        return path.join(d, '.dev953');
      }
    } catch {
      // not present at this level; keep walking
    }
    if (d === '/') break;
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return null;
}

// Absolute path to a named store file (does not require it to exist).
// Returns null if no store can be resolved.
export function storeFile(name = '') {
  const sd = storeDir();
  if (sd === null) return null;
  return `${sd}/${name}`;
}

// --- jq-optional JSON parse ------------------------------------------------
// Extract one field from a JSON document. Mirrors jq's `.[$k]` semantics,
// returning the value as a string (empty string when absent/null). Supports
// the nested dotted paths the callers use (e.g. tool_input.file_path) the same
// way `jq ".path.to.field"` does. Numbers/bools are stringified; objects and
// arrays yield empty string (jq -r on the flat string fields the schema uses).
// Never throws on missing fields or malformed JSON.
export function jsonField(key, doc) {
  if (!key) return '';
  let obj;
  try {
    obj = JSON.parse(doc);
  } catch {
    return '';
  }
  const value = resolvePath(obj, key);
  return scalarToString(value);
}

// Resolve a dotted path against a parsed JSON value, like jq's `.a.b.c`.
function resolvePath(obj, dottedKey) {
  let cur = obj;
  const parts = dottedKey.split('.');
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) {
      return undefined;
    }
    cur = cur[part];
  }
  return cur;
}

// jq -r on a scalar: string as-is, number/bool stringified, null/absent -> ''.
// Objects/arrays are not the flat fields this schema reads -> '' (treated as
// "no usable value", matching the empty-string fallbacks throughout the gate).
function scalarToString(value) {
  if (value === null || value === undefined) return '';
  const t = typeof value;
  if (t === 'string') return value;
  if (t === 'number' || t === 'boolean') return String(value);
  return '';
}

// Read a field directly from a named store file (convenience wrapper).
// Returns '' if the store/file is missing or the field is absent.
export function storeField(name = '', key = '') {
  const f = storeFile(name);
  if (f === null) return '';
  let doc;
  try {
    if (!fs.statSync(f).isFile()) return '';
    doc = fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
  return jsonField(key, doc);
}

// --- redaction -------------------------------------------------------------
// Emit a finding as type+location ONLY — never the matched value bytes.
// Args: <type> <file> <line>. Returns a compact JSON object string suitable for
// the findings[] array in scan-report.json. No secret/PII bytes ever pass
// through: type/file are stripped to safe label/path chars; line is forced to a
// non-negative integer (0 when non-numeric).
export function redact(type = 'unknown', file = '', line = '0') {
  const safeType = String(type).replace(/[^A-Za-z0-9_.-]/g, '');
  const safeFile = String(file).replace(/[^A-Za-z0-9_./-]/g, '');
  let safeLine = String(line);
  if (safeLine === '' || /[^0-9]/.test(safeLine)) safeLine = '0';
  return `{"type":"${safeType}","file":"${safeFile}","line":${safeLine}}`;
}

// --- push-capable command matcher (SHARED) ---------------------------------
// The single source of truth for "is this command push-capable?", used by both
// gate.mjs (publish phase gate) and scan.mjs (pre-push secret scan). Fail
// CLOSED: if we cannot POSITIVELY prove the command is NON-push, treat it as
// push. The command string is DATA, never instructions.
export function isPushCapable(c) {
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
