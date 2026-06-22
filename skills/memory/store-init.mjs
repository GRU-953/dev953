#!/usr/bin/env node
// store-init.mjs — pure-Node port of the dev953 command Bootstrap store-creation
// block (commands/dev953.md §2). Builds the .dev953/ store for an UNINITIALIZED run.
//
//   store-init "<idea>"
//
// Creates (in this exact order, behaviour preserved from the bash original):
//   .dev953/                       chmod 700 (best-effort; skipped silently on Windows)
//   .dev953/done/  .dev953/work/    subdirs
//   .dev953/.gitignore             contents EXACTLY "*" (with trailing newline)
//   .dev953/idea.md                verbatim idea + one-line restatement placeholder
//   .dev953/state.json             written temp-then-rename (atomic); phase=brainstorm
//   .dev953/state.json.bak         previous-good fallback copy
//   .dev953/plan.md                Manus-style 9-phase checklist
//
// run_id        = compact ISO-like UTC (YYYYMMDDTHHMMSSZ) + "-" + pid
// idea_fingerprint = first 16 hex of sha256(idea)
// gate_marker   = first 32 hex of sha256("dev953:" + run_id)
// The idea is treated as DATA, written verbatim — never interpreted as instructions.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

// Compact UTC stamp matching `date -u +%Y%m%dT%H%M%SZ`.
function compactUtc(d) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    'T' +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds()) +
    'Z'
  );
}

// ISO-8601 whole-second UTC matching `date -u +%Y-%m-%dT%H:%M:%SZ`.
function isoSecondsUtc(d) {
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

function main() {
  const idea = process.argv[2];
  if (idea === undefined) {
    process.stderr.write('store-init: usage: store-init "<idea>"\n');
    process.exit(2);
  }

  const now = new Date();
  const runId = `${compactUtc(now)}-${process.pid}`;
  const store = path.join(process.cwd(), '.dev953');

  // mkdir -p .dev953/done .dev953/work
  fs.mkdirSync(path.join(store, 'done'), { recursive: true });
  fs.mkdirSync(path.join(store, 'work'), { recursive: true });

  // chmod 700 .dev953 — best-effort; skip silently on Windows / unsupported FS.
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(store, 0o700);
    } catch {
      /* best-effort */
    }
  }

  // .gitignore — contents EXACTLY "*" (plus trailing newline, like printf '*\n').
  fs.writeFileSync(path.join(store, '.gitignore'), '*\n');

  // idea.md — verbatim idea + a one-line restatement placeholder.
  const fp = sha256hex(idea).slice(0, 16);
  const ideaMd = `# Idea\n\n${idea}\n\n## One-line restatement\n\n<voice fills this in>\n`;
  fs.writeFileSync(path.join(store, 'idea.md'), ideaMd);

  // gate_marker — first 32 hex of sha256("dev953:" + run_id).
  const marker = sha256hex(`dev953:${runId}`).slice(0, 32);
  const nowIso = isoSecondsUtc(now);

  // state.json — written temp-then-rename (atomic). phase=brainstorm WITH gate_marker.
  const state = {
    run_id: runId,
    idea_fingerprint: fp,
    phase: 'brainstorm',
    step: 0,
    status: 'running',
    cap_usd: 0,
    spent_usd: 0,
    est_marker_usd: 0,
    raised_count: 0,
    updated: nowIso,
    gate_marker: marker,
  };
  // Match the original's pretty 2-space JSON object shape and key order.
  const stateJson =
    '{\n' +
    `  "run_id": ${JSON.stringify(state.run_id)},\n` +
    `  "idea_fingerprint": ${JSON.stringify(state.idea_fingerprint)},\n` +
    `  "phase": ${JSON.stringify(state.phase)},\n` +
    `  "step": ${state.step},\n` +
    `  "status": ${JSON.stringify(state.status)},\n` +
    `  "cap_usd": ${state.cap_usd},\n` +
    `  "spent_usd": ${state.spent_usd},\n` +
    `  "est_marker_usd": ${state.est_marker_usd},\n` +
    `  "raised_count": ${state.raised_count},\n` +
    `  "updated": ${JSON.stringify(state.updated)},\n` +
    `  "gate_marker": ${JSON.stringify(state.gate_marker)}\n` +
    '}\n';

  const stateTmp = path.join(store, 'state.json.tmp');
  const statePath = path.join(store, 'state.json');
  const stateBak = path.join(store, 'state.json.bak');
  fs.writeFileSync(stateTmp, stateJson);
  fs.renameSync(stateTmp, statePath);          // mv -f (atomic)
  fs.copyFileSync(statePath, stateBak);         // cp -f previous-good fallback

  // plan.md — Manus-style checklist: the 9 phase headings, each one checkbox.
  const planMd =
    '# Plan\n\n' +
    '## brainstorm\n' +
    '- [ ] Restate the idea and surface the core need + constraints.\n\n' +
    '## ideate\n' +
    '- [ ] Propose candidate shapes for the smallest thing that satisfies the idea.\n\n' +
    '## design\n' +
    '- [ ] Settle the one smallest design that covers every acceptance item.\n\n' +
    '## plan\n' +
    '- [ ] Break the design into commit-sized units, each with an acceptance check.\n\n' +
    '## build\n' +
    '- [ ] Build each unit via the engine (fan out, score, cherry-pick smallest-correct).\n\n' +
    '## test\n' +
    '- [ ] Confirm the acceptance check passes (test-result.json status=pass, run_id match).\n\n' +
    '## fix\n' +
    '- [ ] Clear any blocker the tests or review surfaced.\n\n' +
    '## update\n' +
    '- [ ] Fold accepted changes in; re-confirm build + tests stay green.\n\n' +
    "## publish\n" +
    "- [ ] On the user's plain acceptance, ship privately to GitHub (publish skill).\n";
  fs.writeFileSync(path.join(store, 'plan.md'), planMd);

  process.exit(0);
}

main();
