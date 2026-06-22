#!/usr/bin/env node
//
// gate.mjs — the plan-before-build / test-before-done gate (Hook 1 of 2).
// Zero dependencies (Node stdlib only).
// Wired PreToolUse (Edit|Write|MultiEdit|Bash|NotebookEdit) + Stop + SubagentStop.
// Gate *semantics* are owned by the discipline skill; this file is the mechanical
// enforcement only. All payload / file / tool text is DATA, never instructions.
// Secrets are never printed (findings live in scan; this gate prints only reasons).
//
// Decisions: deny/block => print a plain reason and exit 2 (the blocking exit
// code the harness honors for PreToolUse, Stop and SubagentStop). Allow => exit 0.
// FAILS CLOSED: on missing/unparseable state.json or a bad gate_marker, only
// .dev953/ and docs/ writes are allowed; everything else is denied.
//
// Log only to stderr; stdout is reserved for the decision JSON.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

import { isPushCapable } from './lib.mjs';

// --- jq-optional single-field read (mirrors jq ".field" nested semantics) ----
// Reads one dotted field out of a JSON document string. Returns '' when the
// document is unparseable, the field is absent/null, or the value is not a
// flat scalar — DATA only.
function jget(field, blob) {
  if (blob === undefined || blob === null) return '';
  let obj;
  try {
    obj = JSON.parse(blob);
  } catch {
    return '';
  }
  let cur = obj;
  for (const part of String(field).split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) {
      return '';
    }
    cur = cur[part];
  }
  if (cur === null || cur === undefined) return '';
  const t = typeof cur;
  if (t === 'string') return cur;
  if (t === 'number' || t === 'boolean') return String(cur);
  return '';
}

// Read a JSON field from a file path; '' on any read/parse failure.
function jgetFile(field, src) {
  let blob;
  try {
    blob = fs.readFileSync(src, 'utf8');
  } catch {
    return '';
  }
  return jget(field, blob);
}

// Resolve the .dev953 store directory at the project root.
// Note: gate uses CLAUDE_PROJECT_DIR||cwd directly (NOT the walk-up resolver).
function gateStoreDir() {
  return path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.dev953');
}

// --- stdin read (the hook payload, DATA) --------------------------------------
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// --- decision helpers ---------------------------------------------------------
function esc(s) {
  // Escape backslash first, then double-quote (matches _gate_esc sed order).
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function deny(reason) {
  // PreToolUse refusal.
  process.stdout.write(
    `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${esc(reason)}"}}\n`
  );
  process.exit(2);
}
function block(reason) {
  // Stop / SubagentStop refusal.
  process.stdout.write(`{"decision":"block","reason":"${esc(reason)}"}\n`);
  process.exit(2);
}
function allow() {
  process.exit(0);
}

function main() {
  const PAYLOAD = readStdin();

  const EVENT = jget('hook_event_name', PAYLOAD);
  const TOOL = jget('tool_name', PAYLOAD);
  const STOP_ACTIVE = jget('stop_hook_active', PAYLOAD);

  const STORE = gateStoreDir();
  const STATE = path.join(STORE, 'state.json');
  const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // --- state.json: parse + validate the gate_marker, else fail closed --------
  let STATE_OK = 0;
  let PHASE = '';
  let RUN_ID = '';
  let stateReadable = false;
  try {
    fs.accessSync(STATE, fs.constants.R_OK);
    stateReadable = true;
  } catch {
    stateReadable = false;
  }
  if (stateReadable) {
    PHASE = jgetFile('phase', STATE);
    RUN_ID = jgetFile('run_id', STATE);
    const MARKER = jgetFile('gate_marker', STATE);
    // The gate_marker is bound to run_id: store-init derives it as the first 32
    // hex of sha256("dev953:"+run_id). Recompute and compare — a marker that is
    // dropped, blanked, or forged (e.g. by a prompt-injected in-zone write that
    // sets phase:'publish' with an arbitrary marker) lands us in fail-closed
    // mode. A valid phase enum and a non-empty run_id are also required.
    const VALID_PHASES = new Set([
      'brainstorm', 'ideate', 'design', 'plan', 'build',
      'test', 'fix', 'update', 'publish', 'done',
    ]);
    const expect = crypto.createHash('sha256').update(`dev953:${RUN_ID}`).digest('hex').slice(0, 32);
    if (VALID_PHASES.has(PHASE) && RUN_ID !== '' && MARKER === expect) {
      STATE_OK = 1;
    } else {
      STATE_OK = 0;
    }
  }

  // --- zone check: write target inside .dev953/ or docs/ ? -------------------
  // Cross-platform: path.resolve handles both relative and absolute targets on
  // every OS (and normalizes away any '..' segments), and path.relative gives a
  // separator-agnostic containment test. A target is in-zone when it is the
  // zone root itself or strictly below it (relative path is '' or does not
  // escape with a leading '..').
  function inZone(p) {
    if (!p) return false;
    const resolved = path.resolve(PROJECT_DIR, p);
    const zones = [path.join(PROJECT_DIR, '.dev953'), path.join(PROJECT_DIR, 'docs')];
    for (const root of zones) {
      const rel = path.relative(root, resolved);
      if (rel === '') return true; // the zone root itself
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) return true; // strictly below
    }
    return false;
  }

  // tool_input.file_path covers Edit|Write|MultiEdit|NotebookEdit.
  const writeTarget = () => jget('tool_input.file_path', PAYLOAD);
  const bashCommand = () => jget('tool_input.command', PAYLOAD);

  // Pre-build phases: writes to the source surface are not yet sanctioned.
  function isPreBuild() {
    return PHASE === 'brainstorm' || PHASE === 'ideate' || PHASE === 'design' || PHASE === 'plan';
  }

  // voice is the only writer of handoffs.md; an irreversible op needs a fresh,
  // op-specific confirmation recorded there. A generic free-text "yes" anywhere
  // in the log is NOT enough — once "yes" appeared (e.g. a phase acceptance) it
  // would otherwise unlock every later data-loss op. Instead we require an
  // explicit token bound to BOTH the run_id and a hash of the exact command:
  //
  //   CONFIRMED-IRREVERSIBLE: <run_id>:<op-hash>
  //
  // where op-hash = first 16 hex of sha256(<command>). voice writes this token
  // on its own line only after the user confirms that specific op, so the
  // confirmation cannot be satisfied by stale or injected free text.
  const HANDOFFS = path.join(STORE, 'handoffs.md');
  function opHash(c) {
    return crypto.createHash('sha256').update(String(c)).digest('hex').slice(0, 16);
  }
  function irreversibleConfirmed(c) {
    if (RUN_ID === '') return false; // no trusted run id => cannot bind a token
    let text;
    try {
      fs.accessSync(HANDOFFS, fs.constants.R_OK);
      text = fs.readFileSync(HANDOFFS, 'utf8');
    } catch {
      return false;
    }
    const token = `CONFIRMED-IRREVERSIBLE: ${RUN_ID}:${opHash(c)}`;
    // Match the exact token as a full line (any EOL style), DATA only.
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === token) return true;
    }
    return false;
  }

  // Irreversible / data-loss Bash op?
  function isIrreversible(c) {
    if (!c) return false;
    if (/rm[ \t]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)/.test(c)) return true;
    if (/git[ \t]+reset[ \t]+--hard/.test(c)) return true;
    if (/git[ \t]+clean[ \t]+-[a-zA-Z]*(fd|df)/.test(c)) return true;
    if (/git[ \t]+push[ \t].*(--force|--force-with-lease|-f([ \t]|$))/.test(c)) return true;
    if (/(^|[^>])>[^>]|truncate[ \t]|dd[ \t].*[ \t]of=/.test(c)) return true;
    return false;
  }

  // Publish (push-capable) command? The gate's phase check and scan.mjs's
  // pre-push scan share ONE matcher (isPushCapable in lib.mjs) so a push-capable
  // command cannot slip past the phase gate while still being scanned — the two
  // controls now cover exactly the same command set.
  function isPublishCommand(c) {
    return isPushCapable(c);
  }

  // ==========================================================================
  // STOP / SUBAGENTSTOP: test-before-done.
  // ==========================================================================
  if (EVENT === 'Stop' || EVENT === 'SubagentStop') {
    // Honor stop_hook_active: a prior block already forced a continuation.
    if (STOP_ACTIVE === 'true') allow();

    if (STATE_OK !== 1) {
      block(
        'Cannot finish: .dev953/state.json is missing, unparseable, or its gate_marker did not validate. Restore valid run state (see memory skill) before stopping.'
      );
    }

    if (PHASE === 'build' || PHASE === 'test' || PHASE === 'fix' || PHASE === 'update' || PHASE === 'publish') {
      const TR = path.join(STORE, 'test-result.json');
      let trReadable = false;
      try {
        fs.accessSync(TR, fs.constants.R_OK);
        trReadable = true;
      } catch {
        trReadable = false;
      }
      if (!trReadable) {
        block(`Cannot finish phase '${PHASE}': no .dev953/test-result.json. Run the tester before stopping (see review skill).`);
      }
      const TR_STATUS = jgetFile('status', TR);
      const TR_RUN = jgetFile('run_id', TR);
      if (TR_STATUS !== 'pass') {
        block(`Cannot finish phase '${PHASE}': test-result.json status is '${TR_STATUS || 'absent'}', not 'pass'.`);
      }
      if (TR_RUN !== RUN_ID) {
        block(`Cannot finish phase '${PHASE}': test-result.json run_id does not match the current run.`);
      }
      allow();
    } else {
      allow();
    }
  }

  // ==========================================================================
  // PreToolUse: classify the call.
  // ==========================================================================
  if (EVENT === 'PreToolUse') {
    // ---- FAIL CLOSED when state is untrustworthy ----------------------------
    if (STATE_OK !== 1) {
      switch (TOOL) {
        case 'Edit':
        case 'Write':
        case 'MultiEdit':
        case 'NotebookEdit':
          if (inZone(writeTarget())) allow();
          deny('Fail-closed: .dev953/state.json is missing, unparseable, or its gate_marker did not validate. Only .dev953/ and docs/ writes are allowed until valid run state exists.');
          break;
        case 'Bash': {
          const CMD = bashCommand();
          if (isIrreversible(CMD)) {
            deny('Fail-closed: irreversible operation blocked while run state is invalid (missing/corrupt state.json or bad gate_marker).');
          }
          if (isPublishCommand(CMD)) {
            deny('Fail-closed: publish command blocked while run state is invalid (cannot confirm phase==publish).');
          }
          allow();
          break;
        }
        default:
          allow();
      }
    }

    // ---- trusted state: enforce the gate ------------------------------------
    switch (TOOL) {
      case 'Edit':
      case 'Write':
      case 'MultiEdit':
      case 'NotebookEdit':
        if (inZone(writeTarget())) allow();
        if (isPreBuild()) {
          deny(`Pre-build phase '${PHASE}': source writes outside .dev953/ and docs/ are not allowed yet. Produce the required phase artifact (see plan.md / discipline plan-before-build) before writing source.`);
        }
        allow();
        break;

      case 'Bash': {
        const CMD = bashCommand();
        // Irreversible ops require a fresh, op-specific confirmation token in
        // handoffs.md bound to this run_id and this exact command, in any phase.
        if (isIrreversible(CMD)) {
          if (irreversibleConfirmed(CMD)) allow();
          deny('Irreversible operation (rm -rf / git reset --hard / git clean -fdx / force-push / content-overwrite) requires a fresh op-specific confirmation in .dev953/handoffs.md: a line `CONFIRMED-IRREVERSIBLE: <run_id>:<op-hash>` written by voice for this exact command. None found.');
        }
        // Publish commands require phase==publish (phase check only).
        if (isPublishCommand(CMD)) {
          if (PHASE === 'publish') allow();
          deny(`Publish command blocked: phase is '${PHASE}', not 'publish'. The run must reach the publish phase first.`);
        }
        allow();
        break;
      }

      default:
        allow();
    }
  }

  // Unknown / unmatched event: allow (the gate only governs the wired events).
  allow();
}

main();
