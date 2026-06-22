<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo.svg" alt="dev953" width="440">
</picture>

### Type a plain idea. Get a finished, tested project — shipped to your GitHub.

dev953 is a little **team of AI coders** that lives inside [Claude Code](https://claude.com/claude-code). You describe what you want in everyday words; it does the rest — thinks it through, builds it, tests that it really works, fixes what's broken, and (only when you say yes) publishes it to your own GitHub.

**You never write code. You never make a technical decision. You hear one calm voice the whole way.**

![version](https://img.shields.io/badge/version-1.1.0-1D63E9?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-2EA043?style=flat-square)
![platforms](https://img.shields.io/badge/CLI%20·%20Desktop%20·%20Web%20·%20IDE-5AA6EE?style=flat-square)
![os](https://img.shields.io/badge/Windows%20·%20macOS%20·%20Linux-16386B?style=flat-square)
![mcp](https://img.shields.io/badge/MCP-companion%20included-1D63E9?style=flat-square)
![built for](https://img.shields.io/badge/made%20for-non--coders-555?style=flat-square)
![services](https://img.shields.io/badge/external%20services-none-555?style=flat-square)

<br>

<img src="assets/demo.gif" alt="dev953 turning a plain idea into a finished, shipped project" width="760">

</div>

---

## Contents

- [What is dev953?](#what-is-dev953)
- [What it does](#what-it-does)
- [Why it's different (the USP)](#why-its-different-the-usp)
- [How it works](#how-it-works)
- [Install](#install) — CLI · Desktop · Web · IDE
- [How to use it](#how-to-use-it)
- [Use it from another AI assistant (MCP)](#use-it-from-another-ai-assistant-mcp)
- [What it promises you](#what-it-promises-you)
- [FAQ](#faq)
- [Credits & inspiration](#credits--inspiration)
- [License](#license)

---

## What is dev953?

If you've ever had an idea for an app, a tool, or a little website but felt stuck because *"I can't code"* — dev953 is for you.

It's a free add-on (a **plugin**) for [Claude Code](https://claude.com/claude-code). Once it's installed, you type one line describing your idea, and dev953 quietly runs a whole little software company on your behalf: it plans the work, writes the code, tests it, fixes mistakes, and hands you a finished result. When you're happy, it puts it on **GitHub** (a free home for code) under **your** name.

> No jargon. No setup files to edit. No "now run this command." Just your idea, in plain words.

## What it does

From a single sentence, dev953 walks the whole journey for you:

> **brainstorm → ideate → design → plan → build → test → fix → update → publish**

```
/dev953 "a website that shows today's weather for my town"
```

Along the way it talks to you like a smart friend who happens to code — telling you *what* it did and *why it helps you*, never drowning you in technical detail. The only time it stops is to ask a simple question or to make sure the result is what you actually wanted.

## Why it's different (the USP)

Most AI coding tools hand *you* the controls and assume you know what a "repository," a "dependency," or a "merge conflict" is. dev953 is built on the opposite idea:

| Most tools | **dev953** |
|---|---|
| One AI, one attempt | A **team** of AI coders trying it **several different ways at once** |
| Keeps whatever it wrote first | Keeps only the **smallest version that genuinely passes the tests**, throws the rest away |
| "Done" = it sounds confident | "Done" = it **actually runs**, checked by a *separate* reviewer (no marking its own homework) |
| You manage the technical bits | You manage **nothing** — it asks plain questions and handles the rest |
| Leaves AI fingerprints everywhere | Ships clean work under **your** name, **private by default** |

The motto under the hood: **maximum agents in, minimum code out.** Lots of AI effort exploring the options — the leanest correct result for you to own.

## How it works

Think of it as a tiny, fast software company that spins up the moment you press enter:

1. **The lead** (the one voice you hear) understands your idea and makes a plan.
2. For each piece of work it sends out **several builders at once** — each told to try a *deliberately different* approach, each in its own private sandbox so they can't trip over each other.
3. A **reviewer** and a **tester** score every attempt on one honest question: *does it run, and do the tests pass?*
4. The **smallest correct** version wins and is kept; the others are discarded.
5. A **minimalist** trims any leftover fat, and the round repeats until it stops getting better.
6. When everything's green and **you've confirmed it's what you wanted**, the **publisher** ships it to your GitHub — clean, private, and yours.

All of this runs locally through Claude Code. No extra account, no database, no external service to sign up for. dev953's tools run on **Node** (which Claude Code provides), so it behaves the same on **Windows, macOS, and Linux**.

---

## Install

dev953 installs the **same way everywhere** — two lines, typed once into Claude Code. Pick your platform below for exactly where to type them.

> **The universal command** (works on every platform):
> ```
> /plugin marketplace add GRU-953/dev953
> /plugin install dev953@dev953
> ```
> Restart Claude Code if it was already open, and `/dev953` is ready.

#### 💻 Command line (CLI)

1. Open your terminal and start Claude Code by typing `claude`.
2. Paste the two commands above (one at a time).
3. Quit (`Ctrl-C` twice) and run `claude` again so it loads.
4. Type `/dev953 "your idea"`.

*Just trying it out?* You can also run it straight from a downloaded copy, no install: `claude --plugin-dir /path/to/dev953`.

#### 🖥️ Claude desktop app (Mac / Windows)

1. Open the Claude desktop app.
2. In the message box, type the two commands above (one at a time) and send each.
3. Restart the app so the plugin loads.
4. Type `/dev953 "your idea"` and send.

The desktop app shares the same settings as the CLI — if you installed it there, it's already here too.

#### 🌐 Claude on the web (claude.ai/code)

1. Open [Claude Code on the web](https://claude.com/claude-code).
2. Type the two commands above into the prompt, one at a time.
3. Refresh so the plugin loads.
4. Type `/dev953 "your idea"`.

#### 🧩 IDE extensions (VS Code / JetBrains)

1. Open the Claude Code panel inside your editor.
2. Type the two commands above into its prompt.
3. Reload the window / restart the IDE so the plugin loads.
4. Type `/dev953 "your idea"`.

---

## How to use it

Wherever you installed it, using dev953 is the **same one line**:

```
/dev953 "describe what you want in plain words"
```

Some good first ideas to try:

```
/dev953 "a tip calculator I can use from my phone"
/dev953 "a simple personal website with my name and links"
/dev953 "a tool that renames messy photo files by date"
```

Then just answer the occasional plain-English question. **Before anything is published, dev953 shows you what it built, tells you how to see it for yourself, and asks "is this what you wanted?" Nothing goes out without your yes.**

---

## Use it from another AI assistant (MCP)

dev953 ships a small **MCP companion** so *other* AI assistants (and Claude itself) can borrow its way of working.

**What it is, honestly:** it shares dev953's **method** — its step-by-step plan, its "keep it simple" checks, its "team of coders" recipe, and its safety checklists — as tools any [MCP](https://modelcontextprotocol.io)-capable assistant can call. It does **not** run the full builder team for you (that part needs Claude Code). Think of it as dev953's *playbook on tap*, anywhere.

- **In Claude Code** — nothing to do: it's bundled with the plugin and turns on automatically.
- **In another MCP-capable assistant** — point it at this local stdio command:
  ```
  node /path/to/dev953/mcp/server.mjs
  ```

It offers five tools — `dev953_lifecycle_plan`, `dev953_swarm_recipe`, `dev953_yagni_check`, `dev953_discipline_review`, and `dev953_publish_checklist` — needs no API keys, and runs entirely on your machine.

---

## What it promises you

- 🧑‍💼 **You own everything.** Published work goes to *your* GitHub, with *you* as the only author — no trace of AI left behind.
- 🔒 **Private by default.** Every project starts private. It only becomes public if you explicitly ask.
- 💸 **No surprises with money.** Running several AI coders at once can cost money; dev953 tells you in one line *before* a costly step and never spends past a limit you can see and change. GitHub itself is free.
- ✅ **It won't pretend.** "Done" means it genuinely runs and its tests pass — verified by a separate reviewer. If it gets truly stuck, it tells you plainly what works, what's blocking it, and your options.
- 🛟 **Your secrets stay safe.** Passwords and keys are never printed, never committed, and a scan runs before anything is ever pushed.

---

## FAQ

<details>
<summary><b>Do I need to know how to code?</b></summary>
<br>
No. That's the whole point. If you can describe what you want in a sentence, you can use dev953.
</details>

<details>
<summary><b>Is it free?</b></summary>
<br>
The plugin is free and GitHub is free. The one thing that can cost money is running the AI itself (through your Claude Code usage), and dev953 always warns you in plain language before a step that could add up — and lets you set a limit.
</details>

<details>
<summary><b>Will my projects be public?</b></summary>
<br>
No — everything is created <b>private</b>, visible only to you, unless you specifically say "make it public."
</details>

<details>
<summary><b>What can it build?</b></summary>
<br>
Small, self-contained things work best to start: simple websites, command-line tools, little utilities. You can always ask — and if something isn't a good fit, dev953 tells you plainly rather than hand you something broken.
</details>

---

## Credits & inspiration

dev953 stands on the shoulders of a wonderful open-source community. It studied the projects below **for ideas only** — every capability was **re-implemented originally and minimally**, and **no code was copied**. All trademarks and licences belong to their respective authors.

<details>
<summary><b>The ideas dev953 learned from</b> (click to expand)</summary>

<br>

**Minimalism & token discipline** — "delete first, ship the least": *ponytail*, *caveman*, *headroom*.

**Methodology & workflow** — plan-before-build and hard quality gates: [Superpowers](https://github.com/obra/superpowers), *gstack*, *GSD (Get-Stuff-Done)*.

**Memory & coordination** — remembering across sessions and coordinating a team on disk: [Mem0](https://github.com/mem0ai/mem0), [Graphiti / Zep](https://github.com/getzep/graphiti), [Letta / MemGPT](https://github.com/letta-ai/letta), *Graphify*, *agentmemory*, *claude-mem*, and Manus-style file planning.

**Agent harnesses** — proven patterns for autonomous coding agents: [Aider](https://github.com/Aider-AI/aider), [OpenHands](https://github.com/All-Hands-AI/OpenHands), [Cline](https://github.com/cline/cline), [SWE-agent](https://github.com/SWE-agent/SWE-agent), [Goose](https://github.com/block/goose), [Continue](https://github.com/continuedev/continue), OpenCode, and the OpenAI Codex & Gemini CLIs.

**Review, testing & quality** — objective, adversarial verification: [code-review (official)](https://github.com/anthropics/claude-code), [Serena](https://github.com/oraios/serena), [promptfoo](https://github.com/promptfoo/promptfoo), and "one builds, another validates" (*ralph*).

**Multi-agent orchestration (the engine)** — parallel swarms, competing attempts, isolated git worktrees: [claude-flow](https://github.com/ruvnet/claude-flow), *gstack*, *oh-my-claudecode*, the *competing-subagents* pattern, and worktree orchestrators.

**Planning, autonomy & observability** — durable plans, keep-or-revert loops, cost visibility: *goalify*, *temporal-core*, AutoResearch-style ratchets, *claude-token-lens*, *agenttrace*.

Built as a plugin for **[Claude Code](https://claude.com/claude-code)** by Anthropic.

</details>

---

## License

[MIT](LICENSE) — a permissive licence that lets anyone use the code as long as they keep the licence notice. © 2026 GRU953.

<div align="center"><br>
<img src="assets/icon.svg" width="48" alt="">
<br><sub><b>dev953</b> — maximum agents in, minimum code out.</sub>
</div>
