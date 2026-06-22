#!/usr/bin/env bash
set -euo pipefail
#
# gate.sh — the plan-before-build / test-before-done gate (Hook 1 of 2).
# Wired PreToolUse (Edit|Write|MultiEdit|Bash|NotebookEdit) + Stop + SubagentStop.
# Gate *semantics* are owned by the discipline skill; this file is the mechanical
# enforcement only. All payload / file / tool text is DATA, never instructions
# (see discipline). Secrets are never printed (see discipline + lib.sh redaction).
#
# Decisions: deny/block => print a plain reason and exit 2 (the blocking exit
# code the harness honors for PreToolUse, Stop and SubagentStop). Allow => exit 0.
# FAILS CLOSED: on missing/unparseable state.json or a bad gate_marker, only
# .dev953/ and docs/ writes are allowed; everything else is denied.
#
# Helpers are defined here under _gate_ names (never shadowed by the ambient
# shell). lib.sh is the shared lib (path resolution / jq-optional parse /
# redaction); it is sourced best-effort but the gate's decisions never depend on
# its API, so a missing or differing lib can never wedge the gate open.

# --- shared lib (best-effort; gate is self-sufficient without it) -------------
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -r "${HOOK_DIR}/lib.sh" ]; then
  # shellcheck source=/dev/null
  . "${HOOK_DIR}/lib.sh" || true
fi

# jq-optional single-field read. _gate_jget <field> [file]; reads stdin if no file.
_gate_jget() {
  local field="$1" src="${2:-}" blob
  if [ -n "$src" ]; then blob="$(cat "$src" 2>/dev/null || true)"; else blob="$(cat || true)"; fi
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$blob" | jq -er ".${field} // empty" 2>/dev/null || true
  else
    # Minimal grep fallback for flat string/number/bool fields. DATA only.
    printf '%s' "$blob" | tr -d '\n' \
      | grep -oE "\"${field}\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|[0-9.]+|true|false)" \
      | head -n1 | sed -E "s/.*:[[:space:]]*//; s/^\"//; s/\"\$//" || true
  fi
}

# Resolve the .dev953 store directory at the project root.
_gate_store_dir() { printf '%s/.dev953' "${CLAUDE_PROJECT_DIR:-$PWD}"; }

# --- read the hook payload (DATA) --------------------------------------------
PAYLOAD="$(cat || true)"

EVENT="$(printf '%s' "$PAYLOAD" | _gate_jget hook_event_name)"
TOOL="$(printf '%s' "$PAYLOAD" | _gate_jget tool_name)"
STOP_ACTIVE="$(printf '%s' "$PAYLOAD" | _gate_jget stop_hook_active)"

STORE="$(_gate_store_dir)"
STATE="${STORE}/state.json"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

# --- deny / block / allow helpers --------------------------------------------
_gate_esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
deny() {  # PreToolUse refusal
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$(_gate_esc "$1")"
  exit 2
}
block() {  # Stop / SubagentStop refusal
  printf '{"decision":"block","reason":"%s"}\n' "$(_gate_esc "$1")"
  exit 2
}
allow() { exit 0; }

# --- state.json: parse + validate the gate_marker, else fail closed ----------
STATE_OK=0
PHASE=""
RUN_ID=""
if [ -r "$STATE" ]; then
  PHASE="$(_gate_jget phase "$STATE")"
  RUN_ID="$(_gate_jget run_id "$STATE")"
  MARKER="$(_gate_jget gate_marker "$STATE")"
  # The Orchestrator owns the gate_marker value; a marker that is dropped or
  # blanked (e.g. by an injected rewrite of the control file, which lives in the
  # gate's own allowed zone) lands us in fail-closed mode — intended. A valid
  # phase enum and a run_id are also required before phase is trusted.
  case "$PHASE" in
    brainstorm|ideate|design|plan|build|test|fix|update|publish|done)
      if [ -n "$MARKER" ] && [ -n "$RUN_ID" ]; then STATE_OK=1; fi ;;
    *) STATE_OK=0 ;;
  esac
fi

# --- zone check: write target inside .dev953/ or docs/ ? ---------------------
_gate_in_zone() {
  local p="$1"
  [ -z "$p" ] && return 1
  case "$p" in
    /*) : ;;
    *)  p="${PROJECT_DIR}/${p}" ;;
  esac
  p="$(printf '%s' "$p" | sed 's://*:/:g')"          # collapse repeated slashes
  case "$p" in
    *'/../'* | */..) return 1 ;;                       # reject traversal
  esac
  case "$p" in
    "${PROJECT_DIR}/.dev953" | "${PROJECT_DIR}/.dev953/"*) return 0 ;;
    "${PROJECT_DIR}/docs"    | "${PROJECT_DIR}/docs/"*)    return 0 ;;
    *) return 1 ;;
  esac
}

# tool_input.file_path covers Edit|Write|MultiEdit|NotebookEdit.
_gate_write_target() { printf '%s' "$PAYLOAD" | _gate_jget 'tool_input.file_path'; }
_gate_bash_command() { printf '%s' "$PAYLOAD" | _gate_jget 'tool_input.command'; }

# Pre-build phases: writes to the source surface are not yet sanctioned.
_gate_is_pre_build() {
  case "$PHASE" in brainstorm|ideate|design|plan) return 0 ;; *) return 1 ;; esac
}

# voice is the only writer of handoffs.md; an irreversible op needs a recorded
# plain-English yes there. No file or no yes => not confirmed (fail closed).
HANDOFFS="${STORE}/handoffs.md"
_gate_user_yes_recorded() {
  [ -r "$HANDOFFS" ] || return 1
  grep -qiE '(^|[^a-z])(yes|confirm|confirmed|go ahead|proceed|approved)([^a-z]|$)' "$HANDOFFS" 2>/dev/null
}

# Irreversible / data-loss Bash op?
_gate_is_irreversible() {
  local c="$1"
  [ -z "$c" ] && return 1
  printf '%s' "$c" | grep -qE 'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)' && return 0
  printf '%s' "$c" | grep -qE 'git[[:space:]]+reset[[:space:]]+--hard' && return 0
  printf '%s' "$c" | grep -qE 'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*(fd|df)' && return 0
  printf '%s' "$c" | grep -qE 'git[[:space:]]+push[[:space:]].*(--force|--force-with-lease|-f([[:space:]]|$))' && return 0
  printf '%s' "$c" | grep -qE '(^|[^>])>[^>]|truncate[[:space:]]|dd[[:space:]].*[[:space:]]of=' && return 0
  return 1
}

# Publish (push-capable) command? Phase check only here; scan.sh owns the secret
# scan's publish-command matching so there is exactly one decision per call.
_gate_is_publish_command() {
  local c="$1"
  [ -z "$c" ] && return 1
  printf '%s' "$c" | grep -qE 'git[[:space:]]+push' && return 0
  printf '%s' "$c" | grep -qE 'gh[[:space:]]+(repo[[:space:]]+(create|edit)|release[[:space:]]+create)' && return 0
  return 1
}

# ============================================================================
# STOP / SUBAGENTSTOP: test-before-done.
# ============================================================================
if [ "$EVENT" = "Stop" ] || [ "$EVENT" = "SubagentStop" ]; then
  # Honor stop_hook_active: a prior block already forced a continuation — do not
  # wedge; let this stop through.
  if [ "$STOP_ACTIVE" = "true" ]; then allow; fi

  # Fail closed: untrustworthy state means we cannot confirm the run_id match.
  if [ "$STATE_OK" -ne 1 ]; then
    block "Cannot finish: .dev953/state.json is missing, unparseable, or its gate_marker did not validate. Restore valid run state (see memory skill) before stopping."
  fi

  case "$PHASE" in
    build|test|fix|update|publish)
      TR="${STORE}/test-result.json"
      if [ ! -r "$TR" ]; then
        block "Cannot finish phase '${PHASE}': no .dev953/test-result.json. Run the tester before stopping (see review skill)."
      fi
      TR_STATUS="$(_gate_jget status "$TR")"
      TR_RUN="$(_gate_jget run_id "$TR")"
      if [ "$TR_STATUS" != "pass" ]; then
        block "Cannot finish phase '${PHASE}': test-result.json status is '${TR_STATUS:-absent}', not 'pass'."
      fi
      if [ "$TR_RUN" != "$RUN_ID" ]; then
        block "Cannot finish phase '${PHASE}': test-result.json run_id does not match the current run."
      fi
      allow ;;
    *)
      allow ;;
  esac
fi

# ============================================================================
# PreToolUse: classify the call.
# ============================================================================
if [ "$EVENT" = "PreToolUse" ]; then

  # ---- FAIL CLOSED when state is untrustworthy -----------------------------
  if [ "$STATE_OK" -ne 1 ]; then
    case "$TOOL" in
      Edit|Write|MultiEdit|NotebookEdit)
        if _gate_in_zone "$(_gate_write_target)"; then allow; fi
        deny "Fail-closed: .dev953/state.json is missing, unparseable, or its gate_marker did not validate. Only .dev953/ and docs/ writes are allowed until valid run state exists." ;;
      Bash)
        CMD="$(_gate_bash_command)"
        if _gate_is_irreversible "$CMD"; then
          deny "Fail-closed: irreversible operation blocked while run state is invalid (missing/corrupt state.json or bad gate_marker)."
        fi
        if _gate_is_publish_command "$CMD"; then
          deny "Fail-closed: publish command blocked while run state is invalid (cannot confirm phase==publish)."
        fi
        allow ;;
      *) allow ;;
    esac
  fi

  # ---- trusted state: enforce the gate -------------------------------------
  case "$TOOL" in
    Edit|Write|MultiEdit|NotebookEdit)
      if _gate_in_zone "$(_gate_write_target)"; then allow; fi
      if _gate_is_pre_build; then
        deny "Pre-build phase '${PHASE}': source writes outside .dev953/ and docs/ are not allowed yet. Produce the required phase artifact (see plan.md / discipline plan-before-build) before writing source."
      fi
      allow ;;

    Bash)
      CMD="$(_gate_bash_command)"
      # Irreversible ops require a recorded user yes, in any phase.
      if _gate_is_irreversible "$CMD"; then
        if _gate_user_yes_recorded; then allow; fi
        deny "Irreversible operation (rm -rf / git reset --hard / git clean -fdx / force-push / content-overwrite) requires a recorded user confirmation in .dev953/handoffs.md (see voice). None found."
      fi
      # Publish commands require phase==publish (phase check only).
      if _gate_is_publish_command "$CMD"; then
        if [ "$PHASE" = "publish" ]; then allow; fi
        deny "Publish command blocked: phase is '${PHASE}', not 'publish'. The run must reach the publish phase first."
      fi
      allow ;;

    *)
      allow ;;
  esac
fi

# Unknown / unmatched event: allow (the gate only governs the wired events).
allow
