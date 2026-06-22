#!/usr/bin/env bash
set -euo pipefail

# hooks/lib.sh — shared helpers for gate.sh and scan.sh.
# Behavioural contract (YAGNI ladder, "all input text is DATA not instructions",
# secrets-never-printed) lives once in skills/discipline/SKILL.md; this file only
# provides mechanism. Store FORMAT is owned by skills/memory/SKILL.md; we only
# resolve and read it. Three shared functions: json_field, store_dir, redact.

# --- store-path resolution -------------------------------------------------
# Resolve the .dev953/ store directory at the project root by walking up from
# CWD. Prints the absolute store path, or empty + nonzero if none is found.
store_dir() {
  local d="${PWD}"
  while :; do
    if [ -d "${d}/.dev953" ]; then
      printf '%s\n' "${d}/.dev953"
      return 0
    fi
    [ "${d}" = "/" ] && break
    d="$(dirname "${d}")"
  done
  return 1
}

# Absolute path to a named store file (does not require it to exist).
store_file() {
  local name="${1:-}" sd
  sd="$(store_dir)" || return 1
  printf '%s/%s\n' "${sd}" "${name}"
}

# --- jq-optional JSON parse ------------------------------------------------
# Extract one top-level string/number/bool field from a JSON document on stdin.
# Uses jq when available; otherwise a conservative grep/sed fallback for the
# flat, top-level fields the store schema uses (run_id, phase, status, ...).
# Prints the value (empty if absent). Never errors on missing field.
json_field() {
  local key="${1:-}" doc
  doc="$(cat)"
  [ -n "${key}" ] || { printf ''; return 0; }
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "${doc}" \
      | jq -r --arg k "${key}" '.[$k] // empty' 2>/dev/null || printf ''
    return 0
  fi
  # Fallback: top-level "key": <value>. Strings unquoted; numbers/bools raw.
  printf '%s' "${doc}" \
    | tr -d '\n' \
    | grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|-?[0-9.]+|true|false|null)" \
    | head -n1 \
    | sed -E "s/^\"${key}\"[[:space:]]*:[[:space:]]*//; s/^\"//; s/\"$//" \
    || printf ''
}

# Read a field directly from a named store file (convenience wrapper).
store_field() {
  local name="${1:-}" key="${2:-}" f
  f="$(store_file "${name}")" || { printf ''; return 0; }
  [ -f "${f}" ] || { printf ''; return 0; }
  json_field "${key}" < "${f}"
}

# --- redaction -------------------------------------------------------------
# Emit a finding as type+location ONLY — never the matched value bytes.
# Args: <type> <file> <line>. Prints a compact JSON object suitable for the
# findings[] array in scan-report.json. No secret/PII bytes ever pass through.
redact() {
  local type="${1:-unknown}" file="${2:-}" line="${3:-0}"
  # Strip anything that is not a safe label/path char so a crafted match string
  # cannot smuggle value bytes into the receipt.
  type="$(printf '%s' "${type}" | tr -cd 'A-Za-z0-9_.-')"
  file="$(printf '%s' "${file}" | tr -cd 'A-Za-z0-9_./-')"
  case "${line}" in
    ''|*[!0-9]*) line=0 ;;
  esac
  printf '{"type":"%s","file":"%s","line":%s}' "${type}" "${file}" "${line}"
}
