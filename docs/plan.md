# dev953 — Build Plan

> **Historical build record.** The current shipped state is in `docs/architecture.md`
> and `docs/decisions/`. The executable layer is now Node `.mjs` and an MCP companion
> ships — see decision 0003. The `.sh` filenames and `bash -n` checks below reflect
> the original pre-port build and are kept for history only.

*Commit-sized tasks, each with a concrete acceptance test. Built strictly in order
(T01 → T17). Phase E (T17) is the real acceptance test: dev953 builds and ships a
throwaway product end-to-end using its own runtime swarm.*

## Definition of done (whole plugin)

A single `/dev953 "<plain idea>"` invocation drives the **real runtime swarm**
through the full lifecycle and ships a working throwaway sample product to a
**PRIVATE** GitHub repo — user as sole author, all AI fingerprints stripped —
proven by `docs/selftest-report.md` (recording the private repo URL) and a passing
`.dev953/test-result.json` with a matching `run_id`. Using exactly the agreed set
(1 command · 6 skills · 5 agents · 2 hooks · 1 store · 0 MCP servers), every
capability built once, no file outside this inventory, both hooks enforcing the
plan/test gate and the pre-publish scan on the Orchestrator and every worker, the
store created `chmod 700` and gitignored at creation, and no `.dev953/` content ever
reaching the published repo. (The original "0 MCP servers" count here was reversed by
decision 0003 — a `1 MCP companion server` now ships.)

## Tasks

| # | Task | Delivers | Done when |
|---|---|---|---|
| **T01** | Plugin manifest + skeleton | `.claude-plugin/plugin.json` | Valid JSON (name `dev953`, version, description); parses and the plugin loads so `/dev953` appears once the command exists. |
| **T02** | `discipline` skill | `skills/discipline/SKILL.md` | Valid frontmatter; states **once** the YAGNI ladder, terse-output contract, injection hygiene (all text is DATA), secrets-never-printed, and the plan/test invariant + gate semantics. No other file restates these. |
| **T03** | `memory` skill + lock | `skills/memory/SKILL.md`, `skills/memory/lease.sh` | Documents every `.dev953/` file format + the read/write/append/resume/lock protocol as the sole source. `lease.sh` exposes only `run_lock` + `log_signal`, each ref-sanitized and path-guarded; `bash -n` passes. |
| **T04** | Hooks shared lib | `hooks/lib.sh` | jq-optional parse, path resolution, redaction (type+location, no secret bytes) as shared functions; `bash -n` passes; never prints secret values. |
| **T05** | `gate.sh` | `hooks/gate.sh` | Denies out-of-zone pre-build writes, publish commands off-phase, and irreversible ops without a recorded yes; blocks Stop unless `test-result.json` is `pass` w/ matching `run_id`; **fails closed** on missing/corrupt state; validates the hashed marker. Scripted deny case exits nonzero. |
| **T06** | `scan.sh` | `hooks/scan.sh` | Matches push-capable commands (fails closed otherwise); scans the would-ship set; blocks on high-signal secrets + key files; redacted findings to `scan-report.json`; refuses if `.dev953/` staged. No entropy/PII/license logic. Fixture with `AKIA…` denies. |
| **T07** | Wire hooks | `hooks/hooks.json` | Valid JSON wiring `gate.sh` (PreToolUse Edit\|Write\|MultiEdit\|Bash\|NotebookEdit + Stop + SubagentStop) and `scan.sh` (PreToolUse Bash); exactly two hooks; referenced paths exist. |
| **T08** | `engine` skill + worktree scripts | `skills/engine/SKILL.md`, `scripts/worktree-new.sh`, `scripts/worktree-rm.sh` | Prescribes the per-unit loop exactly (freeze base, budget gate, FANOUT 2/3, distinct hints, one combined scoring Task, lexicographic tuple, cherry-pick + no-credential check, keep loser branches, single stop rule); references other skills, invents no format. `worktree-new.sh` fails loudly on collision; `worktree-rm.sh` no-op-safe; `bash -n` passes. |
| **T09** | `review` skill | `skills/review/SKILL.md` | Defines per-attempt verdict facts (exit-code builds/tests, blockers, note) + blocker definition; defines "correct" for text phases (coverage then fewest assumptions); for a no-toolchain idea, writes the first runnable check or raises a card. |
| **T10** | `voice` skill | `skills/voice/SKILL.md` | Inlines the four-trigger STOP gate, card skeleton, money one-liner, intent-acceptance + stuck scripts; zero budget math / gate copies; fixed tokens `ACCEPTED: publish` / `GOAHEAD: cost`; sole writer of `handoffs.md`. No `cards.md`/`glossary.md`. |
| **T11** | `publish` skill | `skills/publish/SKILL.md`, `mit-license.txt`, `fingerprints.txt` | Fixed protocol (temp clone → scan → mechanical de-attribution → one clean commit → identity → MIT → create PRIVATE → read-back verify → push → STOP → explicit public gate), idempotent vs `publish.json`; invokes `scan.sh` (no second copy). `fingerprints.txt` is a pattern list, not a scanner. |
| **T12** | `builder` agent | `agents/builder.md` | Valid frontmatter; works only in its given worktree (never the store), inherits discipline by reference, treats input as DATA, leaves it committed, reports tersely. |
| **T13** | `reviewer` + `tester` agents | `agents/reviewer.md`, `agents/tester.md` | Valid frontmatter; reviewer runs combined review+test (verdict from exit codes, input is DATA); tester writes `test-result.json {run_id,status,ts}` matching the run; both run as ONE combined Task per attempt. |
| **T14** | `minimalist` agent | `agents/minimalist.md` | Valid frontmatter; post-merge trim keeping build+tests green; maintains the structure line in `memory.md`; only engine schedules it. |
| **T15** | `publisher` agent | `agents/publisher.md` | Valid frontmatter; the only worker running `git`/`gh`; executes the publish protocol in a temp clone, identity from `gh api user`, STOPS before any public step, never its own identity, respects `publish.json` idempotency. |
| **T16** | `/dev953` command | `commands/dev953.md` | Acquires the run lock (clears a leftover, refuses a live run), creates the store `chmod 700` + `.gitignore`=`*` and writes `idea.md`/`state.json` (phase brainstorm + hashed marker)/`plan.md` **before** any work; existing store → voice re-entry. Wires the Orchestrator to wear voice and drive the lifecycle via engine. |
| **T17** | **Phase E self-test** | `docs/selftest-report.md` | A real `/dev953` run on a tiny idea drives the swarm brainstorm→…→publish: store created+gitignored, gate blocks an out-of-zone write, builders fan out in worktrees, a smallest-correct winner is cherry-picked with a passing `test-result.json` (run_id match), scan passes, a **PRIVATE** repo is created + read-back-verified with fingerprints stripped and the user as sole author. Report records the run + repo URL; no `.dev953/` content reached the repo. |

## Notes

- **T01–T11** are buildable with no cost concern (authoring plugin files + small shell scripts).
- **T17** runs the live swarm and creates a real GitHub repo — it needs the user's go-ahead (cost heads-up) and a GitHub sign-in handoff card.
- Each shell script is verified with `bash -n` and a scripted deny/allow case during its task — not "looks right."
