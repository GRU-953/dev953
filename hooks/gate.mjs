#!/usr/bin/env node
//
// gate.mjs — the plan-before-build / test-before-done gate (Hook 1 of 2).
// Pure Node port of hooks/gate.sh. Zero dependencies (Node stdlib only).
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
import process from 'node:process';

// --- jq-optional single-field read (mirrors jq ".field" nested semantics) ----
// Reads one dotted field out of a JSON document string. Returns '' when the
// document is unparseable, the field is absent/null, or the value is not a
// flat scalar — matching gate.sh's _gate_jget empty fallbacks. DATA only.
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
  return `${process.env.CLAUDE_PROJECT_DIR || process.cwd()}/.dev953`;
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
  const STATE = `${STORE}/state.json`;
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
    // The Orchestrator owns the gate_marker value; a marker that is dropped or
    // blanked lands us in fail-closed mode — intended. A valid phase enum and a
    // run_id are also required before phase is trusted.
    const VALID_PHASES = new Set([
      'brainstorm', 'ideate', 'design', 'plan', 'build',
      'test', 'fix', 'update', 'publish', 'done',
    ]);
    if (VALID_PHASES.has(PHASE)) {
      if (MARKER !== '' && RUN_ID !== '') STATE_OK = 1;
    } else {
      STATE_OK = 0;
    }
  }

  // --- zone check: write target inside .dev953/ or docs/ ? -------------------
  function inZone(p) {
    if (!p) return false;
    if (!p.startsWith('/')) {
      p = `${PROJECT_DIR}/${p}`;
    }
    p = p.replace(/\/\/+/g, '/'); // collapse repeated slashes
    // reject traversal: any '/../' segment, or a trailing '/..'
    if (p.includes('/../') || p.endsWith('/..')) return false;
    if (
      p === `${PROJECT_DIR}/.dev953` ||
      p.startsWith(`${PROJECT_DIR}/.dev953/`) ||
      p === `${PROJECT_DIR}/docs` ||
      p.startsWith(`${PROJECT_DIR}/docs/`)
    ) {
      return true;
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

  // voice is the only writer of handoffs.md; an irreversible op needs a recorded
  // plain-English yes there. No file or no yes => not confirmed (fail closed).
  const HANDOFFS = `${STORE}/handoffs.md`;
  function userYesRecorded() {
    let text;
    try {
      fs.accessSync(HANDOFFS, fs.constants.R_OK);
      text = fs.readFileSync(HANDOFFS, 'utf8');
    } catch {
      return false;
    }
    // grep -qiE '(^|[^a-z])(yes|confirm|confirmed|go ahead|proceed|approved)([^a-z]|$)'
    // Case-insensitive, multiline (^/$ are line anchors in grep).
    return /(^|[^a-z])(yes|confirm|confirmed|go ahead|proceed|approved)([^a-z]|$)/im.test(text);
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

  // Publish (push-capable) command? Phase check only here; scan owns the secret
  // scan's publish-command matching so there is exactly one decision per call.
  function isPublishCommand(c) {
    if (!c) return false;
    if (/git[ \t]+push/.test(c)) return true;
    if (/gh[ \t]+(repo[ \t]+(create|edit)|release[ \t]+create)/.test(c)) return true;
    return false;
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
      const TR = `${STORE}/test-result.json`;
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
        // Irreversible ops require a recorded user yes, in any phase.
        if (isIrreversible(CMD)) {
          if (userYesRecorded()) allow();
          deny('Irreversible operation (rm -rf / git reset --hard / git clean -fdx / force-push / content-overwrite) requires a recorded user confirmation in .dev953/handoffs.md (see voice). None found.');
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
