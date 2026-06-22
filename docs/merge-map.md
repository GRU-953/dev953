# dev953 — Merge Map

> **Historical build record.** The current shipped state is in `docs/architecture.md`
> and `docs/decisions/`. The executable layer is now Node `.mjs` and an MCP companion
> ships — see decision 0003. The "0 MCP servers" / "no MCP server" lines below reflect
> the original pre-0003 design and are kept for history only.

> **The first deliverable.** Nothing else gets designed until this exists and the
> Minimalism Enforcer signs off (bottom of file).
>
> **Core principle:** *Maximum agents in, minimum code out.* Many diverse agents
> explore and check each other; the **smallest correct** result is what survives.

**Honesty note.** This is distilled from the brief's own descriptions of each
project plus general knowledge of these tools. The point of every row is *the one
idea worth absorbing* and *the one over-build worth refusing* — not a faithful
audit of each repo's internals. **Nothing here is copied.** Ideas only,
re-implemented originally. Licences respected.

---

## Pass 1 — Distil

One row per project: *idea to absorb* · *over-build to reject*.

### Code-minimalism & token discipline
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| ponytail | Delete first; ship the least code that holds | A configurable "minimalism framework" |
| caveman | Terse, primitive-first output | The gimmick persona as overhead |
| headroom | Watch the context/token budget | A telemetry dashboard |

### Full methodologies
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| Superpowers | Subagents build; a second pass reviews | Sprawling skill catalogue |
| gstack | Hard phase gates + approval points | 23 distinct specialist roles |
| GSD | Plan before build; finish before "done" | Heavy process ceremony |

### Memory — codebase structure
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| Graphify | Remember how the code is shaped | A graph-database dependency |
| agentmemory | Leases + signals + mesh for coordination | An external memory service |
| claude-mem | Carry memory across sessions | A multi-stage ingest pipeline |
| claude-code-memory-setup | Plain file-based memory, easy setup | A heavy install step |
| opencode-graphiti | Memory that knows *when* things changed | Running a graph DB |
| agentmemory-markdown | Markdown *is* the memory — no DB | (already lean — nothing to cut) |

### Memory — general frameworks
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| Mem0 | Keep only the salient facts | Hosted service + vector infra |
| Graphiti/Zep | Time-aware knowledge graph | Neo4j dependency |
| Letta/MemGPT | Memory that edits/pages itself | A whole agent runtime |
| Cognee | Structure raw notes into memory | ETL pipeline complexity |
| LangMem | Distinguish fact vs. event memory | Framework lock-in |
| Supermemory | One memory API for everything | An external API |
| Hindsight | Retrieve only what's relevant now | Retrieval infrastructure |

### Agent harnesses & autonomous agents
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| OpenCode | Proven agent-loop patterns | Building our own harness (we live in Claude Code) |
| OpenAI Codex CLI | Clean one-command UX | A separate CLI binary |
| Gemini CLI | Idea-in / result-out simplicity | A separate CLI binary |
| Aider | Git-native edits, repo map, tidy commits | Its own chat loop |
| Goose | Composable agent toolkits | A separate runtime |
| OpenHands | Autonomous execution in a sandbox | Full sandbox infrastructure |
| Cline | Plan/Act mode — human approves the plan | VS Code coupling |
| SWE-agent | A tight interface between agent and code | A benchmark harness |
| Continue | In-flow assistance | Editor coupling |
| Tabby | Self-hosted help | Hosting a model |
| Cody | Pull the right code context | Enterprise infra |

### Planning / spec / orchestration
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| claude-code-workflows | Named, repeatable workflows | A library of dozens of them |
| psenger/ai-agent-skills | Standard skill packaging | Skill sprawl |
| nirecom/agents | Safety patterns baked into agents | A big agent zoo |
| goalify | Each task carries an acceptance test | A project-management product |
| temporal-core | Durable, resumable runs | A Temporal server |
| Shipwright | A ship checklist | CI/CD infrastructure |

### Autonomous improvement loop
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| AutoResearch | Keep-or-revert ratchet on one metric | A research framework |
| awesome-autoresearch | Loop patterns to reuse | (a list — nothing to build) |

### Review, testing & quality
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| code-review (official) | Structured, objective diff review | (a pattern — adopt it) |
| CRG | Review that follows code relationships | Graph infrastructure |
| Serena | Precise code navigation tools | An LSP server dependency |
| speclock | Lock the spec/acceptance up front | Extra ceremony |
| ralph | One agent builds, another validates | A hard two-model requirement |
| promptfoo | Run real tests, don't trust vibes | An eval framework dependency |

### Skill & plugin ecosystem
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| everything-claude-code · antigravity-awesome-skills · claude-skills · claude-code-plugins-plus-skills · awesome-claude-code-toolkit · awesome-claude-skills | The standard plugin/skill layout & conventions | Importing whole catalogues |

### Observability, cost & harness hygiene
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| claude-token-lens | Make spend visible | A dashboard |
| claudex-setup | Clean, minimal harness setup | Heavy config |
| agenttrace | Be able to trace a run | Tracing infrastructure |
| claudecode-harness | Harness hygiene defaults | A framework |
| claude-code-best-practice | Sensible defaults | (guidance — nothing to build) |

### Multi-agent orchestration & parallel swarms (the engine)
| Project | One idea to absorb | One over-build to reject |
|---|---|---|
| claude-flow | Orchestrate a swarm with shared memory | A heavy framework |
| gstack | Parallel specialists + shared state on disk | 23 roles |
| Superpowers | Subagent-driven dev + two-stage review | Skill sprawl |
| oh-my-claudecode (OMC) | Swarm orchestration | Kitchen-sink scope |
| edict | Directing agents declaratively | A new DSL |
| worktree/kanban orchestrators | **One git worktree per agent** + inline diff review | A kanban UI |
| competing-subagents | Parallel attempts → compare → pick winner | (core pattern — adopt it) |
| Manus-style file planning | Crash-proof plan on disk, survives `/clear` | (core pattern — adopt it) |
| agentmemory coordination | Actions · leases · signals · mesh sync | An external service |

---

## Pass 2 — Deduplicate into the smallest capability set

The ~50 projects above collapse into **8 capabilities**. Where many projects feed
one capability, they're listed together — *that collapse is the merge.*

| # | Capability (built **once**) | Fed by |
|---|---|---|
| **C1** | **Discipline** — the YAGNI ladder, terse output, and the hard "plan-before-build, test-before-done" gate, applied to every agent | ponytail, caveman, headroom, Superpowers, GSD, gstack gates, best-practice |
| **C2** | **Swarm engine** — fan out parallel builders, each trying a *different* approach in its own isolated git worktree → compete → score on one objective metric → keep the smallest correct → revert the rest → repeat until it stops improving | claude-flow, gstack, Superpowers (SDD), OMC, edict, competing-subagents, worktree orchestrators, ralph, SWE-agent, AutoResearch (ratchet) |
| **C3** | **Memory = coordination store** — one local, file-based store holding code structure, decisions, progress **and** the live swarm state: a crash-proof plan, **leases** (no two agents touch one file), **signals** (handoff). Makes the whole pipeline resumable & idempotent | all of Memory-structure + Memory-frameworks (Graphify, agentmemory, claude-mem, Mem0, Graphiti, Letta, Cognee, LangMem, Supermemory, Hindsight, markdown-memory), Manus file-planning, temporal-core |
| **C4** | **Review & test** — actually *run* it; adversarial / cross-model-where-available review; one written rubric; pick the winner | code-review (official), CRG, Serena, speclock, ralph, promptfoo, AutoResearch |
| **C5** | **Lifecycle** — Brainstorm→Ideate→Design→Plan→Build→Test→Fix→Update→Publish, fresh context per phase, hard gates, resumable | claude-code-workflows, GSD, goalify, nirecom, temporal-core |
| **C6** | **Novice voice** — one calm plain-English narrator; technical↔plain translation; handoff cards; intent-acceptance before publish; money honesty | Cline (Plan/Act), gstack approval gates |
| **C7** | **Publish** — create repo (private by default), ship, strip every AI fingerprint, squash to clean human history, pre-publish secret/PII scan | Aider, gstack `/ship`, OpenHands, Shipwright, nirecom |
| **C8** | **Budget guard** — visible, raisable cost cap on parallelism; warn before any costly run; stop adding agents when they stop helping | token-lens, agenttrace, claudex, headroom |

> The whole multi-agent idea is **one** capability (C2), not many. Memory and
> coordination are **one** store (C3), not thirteen.

---

## Pass 3 — Map capabilities to the fewest components

dev953 ships as a **standard Claude Code plugin**. Components available: a
**command**, **skills** (auto-loaded knowledge/behaviour), **agents** (subagent
definitions), **hooks**, and a local **store** (data, not code).

| Component | Covers | Notes |
|---|---|---|
| **1 command** — `/dev953 "<idea>"` | entry point for C5/C6 | the only thing the user types |
| **skill: `engine`** | C2 + C5 + C8 | fan-out/compete/score/winner/revert/repeat; phase gates; budget cap |
| **skill: `discipline`** | C1 | YAGNI ladder + terse + the build/test gate, for every agent |
| **skill: `memory`** | C3 | store format + lease/signal/plan protocol |
| **skill: `review`** | C4 | run-it + adversarial review + scoring rubric |
| **skill: `voice`** | C6 | single plain-English voice, translation, handoff cards, intent-acceptance, money honesty |
| **skill: `publish`** | C7 | repo/ship/de-attribution/scan |
| **5 agents** | C2 roster | `builder`, `reviewer`, `tester`, `minimalist`, `publisher` |
| **≤2 hooks** | C1 + safety | the build/test gate; a pre-publish secret/PII scan |
| **1 local store** — `.dev953/` | C3 | markdown/JSON files: plan, decisions, structure, leases, signals |
| **0 MCP servers** | — | not unavoidable, so not built (see decision record) — *reversed by decision 0003; a 1 MCP companion server now ships* |

**The Orchestrator is not a separate agent.** It *is* the main conversation
driving `/dev953`, wearing the `voice` skill. Only the workers it spawns
(`builder` ×N, `reviewer`, `tester`, `minimalist`, `publisher`) are agent files.
Fewer files; same behaviour.

**Tally:** 1 command · 6 skills · 5 agents · ≤2 hooks · 1 store · 0 MCP servers
*(reversed by decision 0003 — a 1 MCP companion server now ships)*.
Every capability appears in exactly one place.

---

## The merged design (one paragraph)

> A user types `/dev953 "a plain idea"`. The Orchestrator (the single voice you
> hear) walks the lifecycle. At each phase it reads only what the **store** hands
> it, then runs the **engine**: it spawns several **builders** in parallel — each
> in its own git worktree, each told to try a *deliberately different* approach —
> while the **reviewer** and **tester** score the results on one objective metric
> (does it run? do tests pass? fewest lines?). The smallest correct attempt is
> merged; the rest are reverted; the **minimalist** trims what's left; the round
> repeats until two rounds bring no real gain. **Discipline** keeps every agent
> honest about YAGNI; the **budget guard** keeps spend visible and capped. When
> it's done and you've said "yes, that's what I wanted," the **publisher** ships
> it to your GitHub — private, clean, and entirely yours.

---

## Minimalism Enforcer — sign-off

- [x] Every capability is built **exactly once** (no duplication across components).
- [x] The ~50 projects collapse to **8 capabilities** → **1 command + 6 skills + 5 agents + ≤2 hooks + 1 store**.
- [x] The multi-agent engine is **one** capability, not many.
- [x] Memory and coordination are **one** store, not separate systems.
- [x] **No MCP server** — it is avoidable, so it is not built. *(Reversed by decision 0003 — a 1 MCP companion server now ships.)*
- [x] Nothing from the corpus is cloned or vendored — ideas only.

**Signed off: this is the smallest honest mapping.** Design may now proceed.

---

## Deliberately NOT built (YAGNI ledger — seed)

- A dashboard, tracing system, or eval framework — spend is shown in one line; tests just run.
- A graph database / vector store / external memory service — plain local files instead.
- A separate CLI or agent runtime — we live inside Claude Code.
- More than one "orchestrator" — the main conversation is the orchestrator.
- Adapters for other agent tools — one clean seam, no extra adapters until needed.
