# dev953 — Architecture

> A standard Claude Code plugin: an autonomous multi-agent coding team for a
> non-technical user. They type `/dev953 "<plain idea>"` and it runs the full
> lifecycle (brainstorm→ideate→design→plan→build→test→fix→update→publish) and
> ships to their GitHub.
>
> **Supreme law:** YAGNI + one-liner. *Maximum agents in, minimum code out.* Many
> parallel agents explore and check each other; the **smallest correct** result
> survives. Every capability is built **exactly once**.

---

## 1. Overview

The user types `/dev953 "<idea>"`. The **Orchestrator** — the main conversation,
not a spawned agent — wears the `voice` skill and walks the lifecycle. At each
phase it drops context and re-reads only the `.dev953/` store, so the run is
crash- and `/clear`-proof.

For each unit of work the Orchestrator runs the **engine**: it freezes a base
commit, fans out N=2 **builders** in parallel (default 2; up to 3 only if the user
raises the budget), each in its own git worktree trying a *deliberately different*
approach. One combined **review+test** Task scores each attempt mechanically — by
command **exit codes** plus a line count — and the single smallest-correct attempt
is cherry-picked onto the frozen base; losers are reverted (branches kept until the
unit is accepted). The **minimalist** trims the winner. Rounds repeat until a round
brings no gain or a cap of 3 is hit.

`discipline` keeps every agent honest (YAGNI ladder, terse output, prompt-injection
hygiene) **and** is the source of truth for the hard gates, enforced by **two
hooks** that no agent can talk past. `memory` owns the store format and is the only
place locking is defined. When tests pass and the user says "yes, that's what I
wanted," `publish` ships it to GitHub — private by default, with all AI fingerprints
stripped and the user as sole author.

**Tally:** 1 command · 6 skills · 5 agents · 2 hooks · 1 store · 0 MCP servers.
Every capability appears in exactly one place.

---

## 2. Components

### Command

**`/dev953`** — type: command — files: `commands/dev953.md`
- The only thing the user types: `/dev953 "<plain idea>"`. Entry point for the
  whole lifecycle.
- **Bootstrap (closes the gate-disabled-on-first-run gap):** on invocation it
  acquires the single run lock (`mkdir .dev953/run.lock`), and if `.dev953/`
  does not exist it creates the store tree (chmod 700, `.gitignore`=`*`), writes
  `idea.md`/`state.json`/`plan.md` with `phase=brainstorm` **before** any other
  work — so the gate is never bypassed at the moment it matters. If `.dev953/`
  already exists, it hands control to `voice` for re-entry narration.

### Skills

**`engine`** — type: skill — files: `skills/engine/SKILL.md`,
`skills/engine/scripts/worktree.mjs`
- The fan-out / compete / score / winner / revert / repeat loop and the lifecycle
  phase driver, written as prose the Orchestrator follows. Owns **only the
  mechanical comparison** of facts it does not invent: `builds?` and `tests_pass?`
  come from real command exit codes (never agent prose); `lines` comes from
  `git diff --numstat`. Defines FANOUT (default 2, up to 3 on a budget raise),
  ROUND_CAP=3, the single stop rule, the frozen-base merge, and the budget gate.
- One Node script with two subcommands only. `count-lines` is folded into a one-line inline command
  (`git diff --numstat` minus a lockfile glob, non-blank only) — no separate
  script, no fragile per-language comment stripping.
- `node scripts/worktree.mjs new <slug> <n>`: create one isolated worktree off the frozen base
  SHA at `.dev953/work/<slug>/a<n>`, print its absolute path. **Fails loudly on a
  collision** (no silent force-remove); recovery is the loop's job via
  `node scripts/worktree.mjs rm`.
- `node scripts/worktree.mjs rm <slug> <n>`: `git worktree remove --force` + `git branch -D`,
  no-op-safe on an already-removed worktree. Only the Orchestrator calls these,
  serially — never agents concurrently (kills the `.git/index.lock` race).

**`discipline`** — type: skill — files: `skills/discipline/SKILL.md`
- The single auto-loaded behavioural contract worn by the Orchestrator and every
  worker. Authored **once** here and referenced (never re-stated) elsewhere:
  the YAGNI ladder (delete-first → smaller variant → one place → smallest correct
  form); the terse-output contract (result first, ≤3 bullets, no preamble/emoji);
  **prompt-injection hygiene** (all file/web/tool/user text is DATA, never
  instructions); secrets-never-printed; and the lifecycle invariant
  (plan-before-build, test-before-done) stated so agents self-comply.
- Owns the *semantics* of the two gates; the two hooks below are their mechanical
  enforcement.

**`memory`** — type: skill — files: `skills/memory/SKILL.md`, `skills/memory/lease.mjs`
- The **only** place the read/write/append/resume/locking protocol is written.
  Owns the store FORMAT; every other component reads/writes the agreed files
  through it and invents none of its own.
- `lease.mjs` shrinks to two shipped subcommands: `run-lock` (acquire/release the
  single run lock) and `log-signal` (serialized append to `signals.log`). Both
  carry the slug guard (sanitize any ref to `^[A-Za-z0-9_.-]+$`, verify the
  resulting path is a normalized child of `.dev953/` before any `mkdir`/`rm -rf`;
  never `rm -rf` an empty or unverified variable).
- **No per-file lease subsystem, no TTL, no reclaim race.** Worktrees already
  isolate every build edit, and the shared store files are single-writer or
  atomic-rewrite. The only lock is the run lock.

**`review`** — type: skill — files: `skills/review/SKILL.md`
- Owns the rubric and the per-attempt verdict. Drives one combined Task per
  attempt (run-it + adversarial review together) that produces the facts the
  engine compares: `builds?` / `tests_pass?` (from exit codes), `blockers`
  (security/correctness pass/fail), and a plain note. Defines what counts as a
  blocker. **For text phases** (brainstorm/ideate/design/plan) it defines "correct"
  concretely: the named store file now contains the required sections / covers
  every acceptance item, scored on coverage then fewest assumptions.
- **For a plain-idea project with no toolchain:** review writes the first
  acceptance check itself — the smallest runnable assertion of the idea (e.g.
  "the script runs and prints X"); `builds?`/`tests_pass?` are the exit codes of
  that check. If no check is possible, the unit cannot be marked done and a
  handoff card is raised.

**`voice`** — type: skill — files: `skills/voice/SKILL.md`
- The single calm plain-English narrator the Orchestrator wears for the whole run,
  with the four-trigger STOP gate, the handoff-card skeleton, the money one-liner,
  the intent-acceptance script and the stuck skeleton **inlined** (no separate
  `cards.md`). Pure presentation: contains **zero** budget arithmetic and **zero**
  copies of the gate-check logic — it renders engine's one cost flag and the hooks'
  verdicts in plain words.
- Translates both directions (idea→intent, worker output→plain English),
  re-narrates on re-entry ("here's where we were"), and re-asks the same question
  once in plainer words on any ambiguous reply (an unclear reply is never
  acceptance). Writes acceptance/go-ahead as fixed tokens on their own line
  (`ACCEPTED: publish`, `GOAHEAD: cost`). **Voice is the only writer of
  `handoffs.md`** (workers never write it, so the publish unlock cannot be
  poisoned).
- **Glossary cut** (YAGNI): consistent phrasing is a property of one voice, not a
  fourth store file. Up to ~5 frozen plain definitions live inline in SKILL.md.

**`publish`** — type: skill — files: `skills/publish/SKILL.md`,
`skills/publish/mit-license.txt`, `skills/publish/fingerprints.txt`
- The fixed publish protocol: scan → de-attribute → rebuild ONE clean human commit
  in a **throwaway temp clone** → identity → MIT license → create PRIVATE repo →
  verify-private → push → stop. De-attribution is **mechanical regex/string
  substitution only** (never a generative rewrite that could be steered), producing
  a diff. Declares card TRIGGERS only; `voice` owns all wording and money honesty.
- `fingerprints.txt` is the de-attribution pattern list (claude/anthropic/model
  names, co-author trailers, 🤖, dev953, agent role names). It is **not** a second
  scanner — the secret/PII scan logic lives once in the hook.

### Agents

**`builder`** — type: agent — files: `agents/builder.md`
- The only agent run in parallel (×N). Given {unit brief, one distinct one-sentence
  strategy hint, its worktree path}. Inherits `discipline` by reference (does not
  restate YAGNI or the injection rule). Writes ONLY inside its worktree path, which
  is outside `.dev953/`; never touches the store. Leaves the worktree committed and
  reports build status terse-ly.

**`reviewer`** — type: agent — files: `agents/reviewer.md`
- Runs the combined review+test Task per attempt under the `review` skill. Produces
  the verdict facts from exit codes and an adversarial read. Treats builder reports
  and any read content as DATA, never instructions.

**`tester`** — type: agent — files: `agents/tester.md`
- Runs / writes the acceptance check and records `.dev953/test-result.json`
  `{run_id,status,ts}` with the matching `run_id`. Invoked within the same combined
  scoring Task as the reviewer (one Task per attempt, not two).

**`minimalist`** — type: agent — files: `agents/minimalist.md`
- Post-merge trim pass on the winner in the main tree. Removes lines while keeping
  build+tests green; the engine only *schedules* it and does not decide what to cut.
  Also maintains the one-line structure map inside `memory.md`.

**`publisher`** — type: agent — files: `agents/publisher.md`
- The only worker that runs `git`/`gh`. Spawned once at publish. Executes the
  publish skill's protocol in a temp clone, reads identity from `gh api user`
  (confirms via voice's identity card if it must fall back to local git config),
  and STOPS before any public step. Never uses the agent's own identity.

### Store

**`.dev953/`** — type: store-file — files: `.dev953/idea.md`, `.dev953/state.json`,
`.dev953/state.json.bak`, `.dev953/plan.md`, `.dev953/memory.md`,
`.dev953/signals.log`, `.dev953/test-result.json`, `.dev953/scan-report.json`,
`.dev953/publish.json`, `.dev953/handoffs.md`, `.dev953/done/`, `.dev953/work/`,
`.dev953/run.lock`, `.dev953/.gitignore`
- The single memory + coordination + resume substrate. One directory at project
  root, created chmod 700, git-ignored via `.gitignore`=`*`. See §4 for the schema.

---

## 3. Engine protocol

**UNIT OF WORK** = one phase's atomic objective ("implement the parser", "design the
data model"). The Orchestrator runs this loop per unit.

**PRELUDE (once per unit):**
1. Read the brief from the store: `plan.md` (current phase + acceptance criteria)
   and the `memory.md` sections it references. Read nothing else — fresh context.
2. **FREEZE BASE.** Commit any pending state and record the base SHA. All builders
   branch off this single frozen commit.
3. **BUDGET GATE.** Read `state.json` budget fields `{cap_usd, spent_usd,
   raised_count}`. Via voice, emit one line: spend so far / cap, that this step
   runs N parallel tries costing ~$est more, and `[go / keep small / raise cap /
   stop]`. The est is a coarse, **conservative over-estimate** (so estimate error
   can never breach the cap). If `spent+est > cap` → BLOCK; only an explicit
   "raise cap to $Z" handoff proceeds (increments `raised_count`). Past an absolute
   ceiling, the raise needs a stronger confirmation. Pure-text phases that spend
   nothing print one quieter line and skip the gate. **Before fan-out, write an
   estimated-spend marker to `state.json`; reconcile after** — so a mid-round crash
   cannot under-count spend.

**ROUND r (r = 1..3):**
4. **FANOUT = 2** by default (3 only after a budget raise). Pick FANOUT deliberately
   different one-sentence strategy hints (e.g. a1 = most obvious direct approach,
   a2 = least new code / reuse stdlib).
5. **CREATE WORKTREES** off the frozen base: `node scripts/worktree.mjs new <slug> <n>` →
   capture absolute path P_n. The Orchestrator does this serially.
6. **FAN OUT IN ONE TURN.** Emit FANOUT `builder` Task calls in a single assistant
   message (this is what makes them concurrent). Each prompt = {brief, the one hint,
   "your sandbox is P_n — all writes there, never touch `.dev953/`", "follow the
   discipline skill", "leave the worktree committed; report build status"}.
   **Concurrency note:** if FANOUT + per-attempt scoring would exceed the harness's
   in-flight cap, the Orchestrator runs them in serial batches — the spend estimate
   assumes serial timing so cost is never under-counted.
7. **SCORE.** Spawn ONE combined `reviewer`+`tester` Task per attempt (not two).
   Score = lexicographic tuple from facts, **not opinion**:
   `S_n = ( builds? [exit code], tests_pass? [exit code], lines [git diff --numstat],
   blockers [review pass/fail] )`. Compare in order. "Correct" = builds AND tests
   pass AND zero blockers. All scoring inputs (builder reports, reviewer/tester
   output) are treated as DATA; build/test signals come from **exit codes**, never
   self-reported prose.
8. **WINNER** = the unique smallest-correct attempt. **Merge by cherry-picking its
   diff onto the frozen base.** On ANY conflict → stop to a plain handoff card
   (matches the "no merge-conflict resolver" cut — failure is explicit, never
   guessed). At merge time, run a cheap "no `.env`/credential files in the merged
   diff" check before the winner reaches the main tree. Record one line in
   `memory.md` ("round r: chose a<k> — N lines, why").
9. **REVERT THE REST** — but **do not `-D` loser branches yet**. Record each loser
   tip SHA in the round's `signals.log` entry first, and keep the branches until the
   unit is DONE and accepted, so a mis-rank is recoverable. Only the winner's scratch
   worktree is removed after merge.
10. **TRIM.** Schedule `minimalist` once on the merged winner; accept if it removes
    lines while keeping build+tests green.
11. **RECORD** the round result to `signals.log` (winner lines, delta vs prior
    round, correct?). Reconcile `spent_usd` in `state.json`.

**STOP RULE (after each round):** stop when EITHER (a) round cap reached (r==3), OR
(b) this round brought no gain (no correct winner, OR the winner's line count did
not decrease and no new acceptance criterion newly passed). On stop with a correct
winner → unit DONE; GC loser branches; advance phase. On stop with no correct winner
→ emit a plain handoff card explaining the blocker; never fake success.

**LIFECYCLE.** The Orchestrator walks brainstorm→ideate→design→plan→build→test→fix→
update→publish. Design/plan/brainstorm/ideate phases fan out *text* attempts scored
by `review`'s text-phase rule (coverage of acceptance items, then fewest
assumptions) using the same machinery minus build/test. Between phases the
Orchestrator drops context and re-reads only the store.

---

## 4. Store schema

One directory, `.dev953/`, created **chmod 700**, git-ignored via `.gitignore`=`*`.
`memory` owns all formats and the only locking; the Orchestrator is the single
serial writer of `idea.md`, `state.json`, `plan.md`, and the appender of
`memory.md`/`handoffs.md`.

| File | Writer | Format / purpose |
|---|---|---|
| `idea.md` | Orchestrator (once) | User's verbatim idea + one-line restatement. Carries an idea fingerprint; on re-run with a *different* idea, voice confirms (handoff) resume-vs-fresh. |
| `state.json` | Orchestrator | Run cursor: `{run_id, idea_fingerprint, phase, step, status, cap_usd, spent_usd, est_marker_usd, raised_count, updated}`. Phase enum = brainstorm\|ideate\|design\|plan\|build\|test\|fix\|update\|publish\|done. Written temp-then-`mv -f` (atomic). |
| `state.json.bak` | Orchestrator | Previous good copy, kept so a corrupt/partial read (e.g. on a synced/network mount where rename atomicity is not guaranteed) can fall back. On unparseable state: narrate plainly, treat as fresh-needs-confirmation — never crash. |
| `plan.md` | Orchestrator | Manus-style checklist: `## <phase>` + `- [ ]/[x]` steps + per-step acceptance criteria. Resume reads first unchecked step; finished phases never restart. |
| `memory.md` | Orchestrator (append) + minimalist (structure line) | ONE durable-memory file: idea restatement at top, then append-only `### <iso> — <title>` decision/winner blocks, plus a flat `path — one-line purpose` structure map. (Replaces idea/decisions/structure split.) |
| `signals.log` | any worker, via the `log-signal` subcommand | Append-only JSONL: `{ts, agent, kind, ref, note}`, kind ∈ claimed\|done\|handoff\|blocked\|round. Serialized by a microsecond `mkdir` guard with spin+backoff (no timed force-remove). Orchestrator reads only the tail since its cursor. |
| `test-result.json` | tester | `{run_id, status: pass\|fail\|absent, ts}`. The gate hook requires `status==pass` AND `run_id==state.run_id`. |
| `scan-report.json` | scan hook | Deny receipt only: `{run_id, clean, findings:[{type, file, line}]}`. **Redacted to type+location — no value bytes** for PII; last4 only for non-identifying API keys. |
| `publish.json` | publisher (writes); Orchestrator sets flags | `{status: scanned\|history_built\|repo_created\|pushed, repo_name, visibility, license_id, repo_url, intent_confirmed, public_gate_passed}`. Explicit status enum so re-entry never re-creates or re-pushes. |
| `handoffs.md` | **voice only** | Append-only log of every card + reply, including the `ACCEPTED: publish` / `GOAHEAD: cost` tokens the hooks/publisher match literally. Voice-write-only so the unlock cannot be poisoned. |
| `done/<milestone>.json` | the actor that completes it | Idempotency markers (`repo-created`, `published`, `secret-scan`): `{at, by, detail}`. Check-before-act. |
| `work/<slug>/a<n>/` | builders | Engine-managed scratch worktrees; never published. |
| `run.lock` | command (run lock) | Single `mkdir` lock acquired at `/dev953` entry. If present → another run is live → refuse in plain voice (prevents the double-repo / interleave TOCTOU). A fresh run `rm -rf`s a leftover lock from a crashed prior run **before** acquiring (safe: no live owner can exist pre-run). |
| `.gitignore` | command (once) | Contents `*` — written at store CREATION, not at publish, so scratch/reports can never reach the public repo. |

**Resumability / idempotency.** On `/dev953`: if `.dev953/` absent → fresh (create
tree, write idea/state/plan). If present → read state+plan, voice re-narrates where
it left off, continue from the first unchecked step. Before any expensive/
irreversible action, check the matching `done/` marker first. Builder attempts are
idempotent (own worktree + recorded round); the frozen-base + cherry-pick merge and
the estimated-spend marker make a mid-round crash safe to resume.

---

## 5. Gates and hooks

`discipline` defines the gate *semantics*; **two hooks** (the only hooks) enforce
them mechanically — uniformly on the Orchestrator AND every worker, so a
prompt-injected agent cannot talk past them. They are Node scripts run via `node`
(cross-platform: Windows/macOS/Linux). Both share `hooks/lib.mjs` (jq-optional
JSON parse, store-path resolution, redaction). Files:
`hooks/hooks.json`, `hooks/gate.mjs`, `hooks/scan.mjs`, `hooks/lib.mjs`.

**Hook 1 — `gate.mjs` (the plan-before-build / test-before-done gate).**
Wired `PreToolUse` (matcher `Edit|Write|MultiEdit|Bash|NotebookEdit`) + `Stop` +
`SubagentStop`.
- **PreToolUse:** classify the call. In pre-build phases, DENY source writes outside
  `.dev953/` and `docs/`, naming the required artifact. DENY publish commands unless
  `phase==publish` (phase check only — the scan hook owns publish-command matching,
  so there is exactly one decision per publish call). DENY irreversible ops
  (`rm -rf`, `git reset --hard`, `git clean -fdx`, force-push, content-overwrite)
  unless an explicit user confirmation has been recorded — the NEVER-CUT data-loss
  guard, obtained via the simplest mechanism (a recorded plain-English yes), not a
  bespoke token protocol.
- **Stop / SubagentStop:** if the phase requires tests, block finishing unless
  `test-result.json` is `pass` with a matching `run_id`; block if the required
  artifact is missing. Honors `stop_hook_active` to avoid wedging.
- **Fail CLOSED on the source surface.** Missing/unparseable `state.json` → deny
  source writes and publish/irreversible ops (only `.dev953/` and `docs/` writes
  allowed). **`state.json` integrity:** the Orchestrator writes a hashed/owned
  marker the gate validates, so an injected agent cannot rewrite the control file
  (which lives in the gate's own allowed zone) to disable the gate.

**Hook 2 — `scan.mjs` (pre-publish secret/PII scan).**
Wired `PreToolUse` (matcher `Bash`), internally gated to publish commands — the
**single** place publish commands are pattern-matched. Matcher must cover BOTH
`git push` and any `gh` push-capable command, and **fail closed** if it cannot
positively identify the command as non-push.
- Scans the full would-ship set (committed tree + staged + untracked-not-ignored)
  so scan scope == push scope. Blocks ONLY on (a) high-signal SECRET regexes
  (AWS `AKIA…`, GitHub `ghp_/gho_/github_pat_`, Slack `xox…`, Google `AIza…`,
  Stripe `sk_live_`, PEM private-key headers, secret-named vars with long values)
  and (b) `.env`/`*.pem`/`*.key`/`id_rsa` present-but-staged or not gitignored.
- **CUT** (over-build): the Shannon-entropy pass, phone/Luhn/SSN PII matching,
  and file-body license-header / copied-source detection (phantom vendored-cache
  dependency; build-time concern). PII reduces to emails other than the author's
  git email. Copyleft/attribution surfaces only from a dependency *manifest*.
- Findings written redacted (type+location) to `scan-report.json`; a hit is a HARD
  STOP reported by location only. Also asserts `.dev953/` itself is gitignored and
  refuses to ship if `.dev953/` is staged/tracked.

`audit.log` is **dropped** (it was the tracing system the merge map cut). The
deny receipt is `scan-report.json`. The `publish` skill *invokes* `scan.mjs` — it
never carries a second copy of the scan logic.

---

## 6. Publish flow

Runs only after tests pass and `publish.json.intent_confirmed==true` (set by voice
after the user's plain-English acceptance). Each step is idempotent against the
`publish.json` status enum so re-entry never re-creates or re-pushes.

1. **Temp clone.** Do all rewriting in a **throwaway temp clone** of the final tree
   — never `--orphan`/branch-delete in the user's live worktree (this protects the
   self-application case and any pre-existing user git history from in-place
   destruction).
2. **Scan** by invoking `scan.mjs` on the staged tree (scan scope == push scope).
3. **De-attribute** mechanically (regex/string substitution from `fingerprints.txt`,
   with a diff) across file contents, comments, README/docs, package metadata,
   dotfiles/CI/lockfile-author fields, and `.git` metadata. Delete `.dev953/` and
   any tool dotfiles from the shippable tree. No generative rewrite.
4. **Rebuild ONE clean commit** on an orphan branch (`git checkout --orphan main`,
   `git add -A`) — exactly ONE "Initial commit" (the multi-commit "realistic
   history simulator" is cut as fabrication). Assert the temp repo has zero
   pre-existing refs/remotes before push.
5. **Identity** from `gh api user`; author == committer == user for the commit.
   If it must fall back to local git config, **confirm name/email with the user**
   via voice's identity card (irreversible once pushed). Never the agent's identity.
6. **License** = MIT default (`mit-license.txt`, current year, user as holder);
   voice explains it in one line and offers a different one. A `NOTICE` is added
   only if a dependency manifest declares a real attribution clause.
7. **Create PRIVATE repo.** First `gh repo view` to detect name collision → on
   collision ask for a new name via voice (never push into an existing repo).
   `gh repo create <name> --private`. **Read back** `gh repo view --json visibility`
   and HARD STOP unless private. Card C confirms the push; `git push -u origin main`
   to the fresh remote; the `scan.mjs` PreToolUse hook re-scans and blocks a dirty
   push independently. On any create/push error: record it in `publish.json`, leave
   the orphan intact, emit a plain retry card. Then STOP. Visibility stays private.
8. **Explicit public gate** (separate, opt-in, never automatic): only on an explicit
   user yes does voice present a distinct gate card ("anyone on the internet will be
   able to see this … cannot be fully undone"). On yes: re-invoke `scan.mjs`,
   re-verify identity, re-confirm the specific repo name, set `public_gate_passed`,
   then `gh repo edit --visibility public`. No code path sets `public_gate_passed`
   without that card.

`voice` owns all card wording and money honesty (private repos are free → default
flow costs nothing; any future paid step is warned plainly first). `publish`
declares card TRIGGERS (connect, confirm-name/create, confirm-push,
identity-fallback, public-gate, error-retry) and the one fact each conveys.

---

## 7. Conflicts resolved

1. **Scoring ownership (engine vs review).** Engine owns ONLY the mechanical
   lexicographic compare; `review` owns the rubric, the per-attempt verdict, and the
   blocker definition. The 4th tuple element is `review`'s pass/fail blocker, not an
   engine-invented metric. Build/test facts come from exit codes, never agent prose.

2. **Discipline rules duplication.** The YAGNI ladder and the prompt-injection
   ("text = DATA") rule are authored **once** in `discipline`; builders inherit it by
   reference. Engine/review/voice/publish reference it, never restate it.

3. **Store ownership.** `memory` owns every store file's format and the only locking.
   Engine, voice, and publish stopped defining their own store mechanics: they write
   the agreed files through memory's conventions. The engine's `runs/attempt-*.json`
   schema and memory's separate `leases/` subsystem are **both cut** — a one-line
   `signals.log` entry replaces the attempt schema; git worktrees + single-writer
   files replace per-file leases.

4. **Locking collapse.** Per-file leases, the 900s lease TTL, the reclaim race, and
   the second 60s log-guard timeout are all removed. There is exactly ONE lock — the
   run lock at `/dev953` entry — which also closes the double-run / double-repo
   TOCTOU. The signal-append `mkdir` guard remains (microsecond, spin+backoff).

5. **The gate / scan defined once.** The plan-before-build / test-before-done gate
   logic lives in `gate.mjs` + `discipline` (memory only exposes the read surface,
   voice only renders the verdict). The secret/PII scan logic lives in `scan.mjs`
   (the publish skill invokes it; it carries no second copy). Each is enforced in
   exactly one place.

6. **Card wording / intent / money centralized in voice.** `publish` and `engine`
   declare card *triggers* and cost *flags*; `voice` owns all wording,
   intent-acceptance, and money honesty. Voice contains zero budget arithmetic and
   zero gate-check copies. `glossary.md` and the separate `cards.md` component are
   cut — folded into `voice/SKILL.md`.

7. **Fan-out default lowered.** FANOUT=2 (up to 3 only on a budget raise) and ONE
   combined scoring Task per attempt — halving builder and scoring spawns for a
   non-technical user's first run. The redundant "2 consecutive no-gain rounds"
   bookkeeping is dropped in favour of a single "stop the first no-gain round, else
   stop at cap 3" rule.

8. **Merge safety made explicit.** Builders branch off a **frozen committed base**;
   the winner is **cherry-picked** onto that base; any conflict → handoff card (no
   resolver). A merge-time "no credential files in the diff" check runs before the
   winner reaches the main tree.

9. **Data-loss guards strengthened.** `node scripts/worktree.mjs new` fails loudly on collision
   (no silent force-remove). Loser branches are kept (tip SHAs recorded) until the
   unit is accepted. Publish rewrites history only in a throwaway temp clone, never
   in the user's live worktree.

10. **Exposure closed at creation.** `.dev953/.gitignore`=`*` and `chmod 700` are
    written when the store is created, not relied on at publish; the scan refuses to
    ship if `.dev953/` is staged.

11. **First-run gate gap closed.** The `/dev953` command writes `state.json`
    (`phase=brainstorm`) before any work and the gate fails CLOSED on missing/
    corrupt state, so plan-before-build is enforced from the very first write. The
    Orchestrator writes a hashed marker the gate validates so the control file can't
    be rewritten to disable the gate.

12. **Scan over-builds cut.** Entropy check, phone/Luhn/SSN PII, and copied-source
    license-body grepping removed; redaction is type+location (no value bytes for
    PII). The 1-clean-commit rule replaces the multi-commit history simulator.

13. **Text-phase + no-toolchain holes filled.** `review` defines "correct" for text
    phases (coverage then fewest assumptions, proven by a named store file) and, for
    a plain-idea project with no tests, writes the first runnable acceptance check
    so `builds?`/`tests_pass?` have real exit codes.
