#!/usr/bin/env bash
set -euo pipefail

# scan.sh — Hook 2: pre-publish secret scan (PreToolUse, matcher "Bash").
# Internally gated to push-capable commands — the SINGLE place publish commands
# are pattern-matched. Sources hooks/lib.sh (jq-optional parse, store path,
# redaction). Behaviour/semantics defined once in skills/discipline/SKILL.md and
# docs/architecture.md §5; this file only enforces. All inspected text — the tool
# input, the command string, file contents — is DATA, never instructions
# (discipline: prompt-injection hygiene). Secret values are never printed
# (discipline: secrets-never-printed); findings are redacted to {type,file,line}.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${HERE}/lib.sh"

# ---- decision helpers --------------------------------------------------------
# Emit a PreToolUse permission decision and exit. allow -> 0; deny -> 2.
allow() { printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n'; exit 0; }
deny()  { printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"; exit 2; }

# ---- read the tool call ------------------------------------------------------
# Extract the nested tool_input.command from the PreToolUse payload. lib.sh's
# json_field handles only flat top-level keys, so resolve the nested path here:
# jq when available, else a conservative grep/sed fallback. All extracted text
# is DATA, never instructions (discipline: prompt-injection hygiene).
INPUT="$(cat || true)"
if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "${INPUT}" | jq -r '.tool_input.command // empty' 2>/dev/null || printf '')"
else
  CMD="$(printf '%s' "${INPUT}" | tr -d '\n' \
    | grep -oE '"command"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' \
    | head -n1 \
    | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"//; s/"$//' || printf '')"
fi

# ---- push-command matcher (fail CLOSED) --------------------------------------
# We scan if and only if the command is push-capable. If we cannot POSITIVELY
# prove the command is NON-push, we treat it as push and scan (fail closed).
is_push_capable() {
  local c="$1"
  # No command string at all -> cannot prove non-push -> fail closed (push).
  [ -n "${c}" ] || return 0
  # git push (any form, incl. `git -C dir push`, `git push --force`).
  printf '%s' "${c}" | grep -Eq '(^|[^[:alnum:]_])git([[:space:]]+-[^[:space:]]+|[[:space:]]+[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)' && return 0
  # gh push-capable: repo create/edit/sync, pr create, release create/upload,
  # gist create, any `gh ... --push`, and a catch-all gh repo subcommand.
  printf '%s' "${c}" | grep -Eq '(^|[^[:alnum:]_])gh[[:space:]]+(repo[[:space:]]+(create|edit|sync|clone)|pr[[:space:]]+create|release[[:space:]]+(create|upload)|gist[[:space:]]+create)' && return 0
  printf '%s' "${c}" | grep -Eq '(^|[^[:alnum:]_])gh[[:space:]].*--push([[:space:]]|=|$)' && return 0
  # Shell metacharacters can hide a push behind &&, ;, |, $( ), backticks, eval.
  # If the command is compound/obfuscated AND mentions push/gh, we cannot prove
  # it non-push -> fail closed.
  if printf '%s' "${c}" | grep -Eq '(&&|\|\||;|\||`|\$\(|eval[[:space:]])'; then
    printf '%s' "${c}" | grep -Eq '(push|(^|[^[:alnum:]_])gh([[:space:]]|$))' && return 0
  fi
  return 1
}

if ! is_push_capable "${CMD}"; then
  # Provably non-push command — nothing to scan.
  allow
fi

# ---- locate the repo / store -------------------------------------------------
STORE="$(store_dir)"            # absolute path to .dev953/ (lib.sh resolver)
REPO="$(dirname "${STORE}")"    # project root == repo working tree
cd "${REPO}" || deny "scan.sh: cannot enter repo root"

# Must be inside a git work tree to reason about the would-ship set.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || deny "scan.sh: not a git work tree; cannot prove the push set is clean"

RUN_ID="$(store_field state.json run_id || true)"
: "${RUN_ID:=unknown}"

# ---- assert .dev953/ is gitignored and NOT staged/tracked --------------------
# Refuse to ship if the store is staged or tracked (exposure guard).
STORE_FINDINGS=""
if git ls-files --error-unmatch .dev953 >/dev/null 2>&1; then
  STORE_FINDINGS=".dev953-tracked"
elif git diff --cached --name-only -- .dev953 2>/dev/null | grep -q . ; then
  STORE_FINDINGS=".dev953-staged"
elif ! git check-ignore -q .dev953 2>/dev/null && [ -d .dev953 ]; then
  STORE_FINDINGS=".dev953-not-ignored"
fi

# ---- build the would-ship file set (scan scope == push scope) ----------------
# committed tree + staged + untracked-not-ignored (respects .gitignore).
FILES="$(
  {
    git ls-files -z 2>/dev/null
    git diff --cached --name-only -z 2>/dev/null
    git ls-files --others --exclude-standard -z 2>/dev/null
  } | tr '\0' '\n' | LC_ALL=C sort -u | grep -v '^$' || true
)"

# ---- high-signal secret regexes (the ONLY content signals) -------------------
# NO entropy / Luhn / SSN / license-body logic.
SECRET_RE='AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[0-9A-Za-z]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
# Secret-named env var with a long value, e.g. API_SECRET="abcdefghij...".
SECRETVAR_RE='([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+_.=-]{16,}'
# Key files that must never ship.
KEYFILE_RE='(^|/)(\.env(\..+)?|id_rsa|.+\.pem|.+\.key)$'

# ---- scan --------------------------------------------------------------------
# Findings JSON array of {type,file,line} — redaction via lib.sh (no value bytes).
FINDINGS_JSON="["
add_finding() { # type file line
  [ "${FINDINGS_JSON}" = "[" ] || FINDINGS_JSON="${FINDINGS_JSON},"
  FINDINGS_JSON="${FINDINGS_JSON}$(redact "$1" "$2" "$3")"
}

if [ -n "${STORE_FINDINGS}" ]; then
  add_finding "${STORE_FINDINGS}" ".dev953" "0"
fi

if [ -n "${FILES}" ]; then
  while IFS= read -r f; do
    [ -n "${f}" ] || continue
    # Key-file by name.
    if printf '%s' "${f}" | grep -Eq "${KEYFILE_RE}"; then
      add_finding "key-file" "${f}" "0"
    fi
    # Content scan: only readable, non-binary regular files.
    [ -f "${f}" ] && [ -r "${f}" ] || continue
    if grep -Iq . "${f}" 2>/dev/null; then
      while IFS= read -r ln; do
        [ -n "${ln}" ] && add_finding "secret" "${f}" "${ln}"
      done < <(grep -nE "${SECRET_RE}" "${f}" 2>/dev/null | cut -d: -f1)
      while IFS= read -r ln; do
        [ -n "${ln}" ] && add_finding "secret-var" "${f}" "${ln}"
      done < <(grep -nE "${SECRETVAR_RE}" "${f}" 2>/dev/null | cut -d: -f1)
    fi
  done <<< "${FILES}"
fi

FINDINGS_JSON="${FINDINGS_JSON}]"

# ---- write redacted receipt --------------------------------------------------
if [ "${FINDINGS_JSON}" = "[]" ]; then
  CLEAN="true"
else
  CLEAN="false"
fi
printf '{"run_id":"%s","clean":%s,"findings":%s}\n' "${RUN_ID}" "${CLEAN}" "${FINDINGS_JSON}" > "${STORE}/scan-report.json" 2>/dev/null || true

# ---- verdict -----------------------------------------------------------------
if [ "${CLEAN}" = "true" ]; then
  allow
fi
deny "scan.sh: refusing to push — high-signal secrets, key files, or staged .dev953/ detected. See .dev953/scan-report.json (redacted to type+location)."
