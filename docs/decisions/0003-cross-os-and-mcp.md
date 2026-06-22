# Decision 0003 — cross-OS port to Node + an MCP companion (reverses parts of 0001)

**Date:** 2026-06-22 · **Decided by:** owner (GRU953), explicitly, after a plain-English
trade-off review. The owner chose the "lean & honest" scope.

## Context
Decision [0001] recorded "no MCP server" and the merge-map recorded "no per-assistant
adapters." The owner asked to (a) make dev953 run on Windows/Mac/Linux and (b) ship an
MCP version usable by other assistants. We reviewed this against YAGNI and agreed a
**lean** path; the speculative parts (per-assistant clones, phone "versions") were
declined as un-runnable / scope creep.

## 1. Cross-OS: port the executable layer from bash to zero-dependency Node.js
Claude Code runs `command` hooks through the system shell; on Windows that is `cmd.exe`,
which **cannot run `.sh` scripts** — so the bash hooks fail on Windows. `node` is uniform
across Windows/macOS/Linux and Claude Code already ships it. **Resolution:** re-implement
the hooks and helper scripts as pure-Node `.mjs` (no dependencies, no build step) and
remove the `.sh` versions (one implementation only — YAGNI). Behaviour is preserved and
re-verified against the original fixtures.

## 2. An MCP companion — the single cross-assistant seam (reverses 0001 §2)
MCP is the cross-assistant standard, so one MCP server is the honest "one clean seam,"
not four bespoke adapters. **Honest scope:** the server exposes dev953's *method* —
lifecycle planning, the YAGNI ladder, the swarm recipe, the discipline & publish
checklists — as callable tools any MCP client (Claude, and other MCP-capable assistants)
can use. It **cannot** run the full parallel-swarm-in-worktrees engine; that needs a host
coding runtime. The server is zero-dependency Node over stdio (newline-delimited JSON-RPC,
protocol 2025-11-25), bundled via the plugin's `.mcp.json` (auto-registers for Claude) and
runnable standalone for other clients.

## Declined (recorded so it isn't re-litigated)
- Native ChatGPT/Gemini/Grok plugin clones — covered by the one MCP seam instead.
- iOS/Android "versions" — no host runtime to spawn sub-agents / run git on phones.
