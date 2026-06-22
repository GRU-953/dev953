# dev953

**Type a plain idea. Get a finished, tested project — shipped privately to your GitHub.**

dev953 is a small team of AI coders that lives inside [Claude Code](https://claude.com/claude-code).
You describe what you want in everyday words. It does the rest: thinks through the
idea, designs the simplest version, builds it, tests that it really works, fixes what's
broken, and — once you say "yes, that's it" — publishes it to your own GitHub account.

You never have to make a technical decision. You hear one calm voice the whole way.

## What it does

```
/dev953 "a website that shows today's weather for my town"
```

From that one line, dev953 runs the whole journey:

> brainstorm → ideate → design → plan → build → test → fix → update → publish

Under the hood it works like a tiny software company: several AI coders try the idea
**different ways at the same time**, check each other's work, and keep only the
smallest version that actually runs and passes its tests. You only ever talk to the
lead — in plain English.

## How to install

In Claude Code, run these two lines once:

```
/plugin marketplace add GRU-953/dev953
/plugin install dev953@dev953
```

That's it. Now `/dev953` is ready to use.

*(Developer alternative: `claude --plugin-dir /path/to/dev953` loads it without installing.)*

## How to use it

1. Type `/dev953 "your idea in plain words"`.
2. Answer the occasional plain-English question if it asks one.
3. Before anything is published, it shows you what it built and how to see it for
   yourself — and asks **"is this what you wanted?"** Nothing goes public without your yes.

## What it promises you

- **You own everything.** Published projects go to *your* GitHub, with *you* as the
  only author. No trace of the AI is left behind.
- **Private by default.** Every project starts as a private repository. It only
  becomes public if you explicitly ask.
- **No surprises with money.** Running several AI coders at once can cost money.
  dev953 always tells you in one line before a costly step, and never spends past a
  limit you can see and change.
- **It won't pretend.** "Done" means the project genuinely runs and its tests pass —
  checked by a separate reviewer, not graded by the coder that wrote it. If it gets
  truly stuck, it tells you plainly what works, what's blocking it, and your options.
- **Your secrets stay safe.** Passwords and keys are never printed, never committed,
  and a scan runs before anything is ever pushed.

## What's inside (for the curious)

One command, six skills, five helper agents, two safety checks, and a small local
folder (`.dev953/`) that remembers progress so a run can survive a restart. No
external services, no database. See [`docs/`](docs/) for the design notes.

## Licence

MIT — a permissive licence that lets anyone use the code, as long as they keep the
licence notice. You can change this any time.
