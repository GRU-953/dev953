# Contributing to dev953

dev953 — an autonomous multi-agent coding team for Claude Code, a GRU953
project.

Thanks for wanting to help. This guide keeps things simple so you can get
started quickly.

## Getting set up

dev953 is a Claude Code plugin. There's no install step beyond cloning and
loading it:

```sh
git clone https://github.com/GRU953/dev953.git
claude --plugin-dir ./dev953
```

That points Claude Code at the plugin directory. From there, the `/dev953`
command is available in your session.

## How the code is laid out

The executable layer is zero-dependency Node.js, written as `.mjs` files (two
hooks plus a few helper scripts). There is **no build step** and **no package
to install** — the files run as-is on Windows, macOS, and Linux.

To sanity-check a change before you open a pull request:

```sh
# 1. Make sure every script still parses.
node --check hooks/your-hook.mjs

# 2. Run the hook fixtures to confirm behavior.
node hooks/your-hook.mjs < tests/fixtures/some-input.json
```

If a script parses and the fixtures behave as expected, you're in good shape.
Please add or update a fixture when you change hook behavior.

## Branching and releases

- We work **trunk-based**: branch off `main`, keep branches **short-lived**, and
  open a pull request early.
- Pull requests are **squash-merged** into `main`, so each change lands as one
  tidy commit.
- Releases are tagged with **SemVer** (`MAJOR.MINOR.PATCH`). User-facing changes
  go in `CHANGELOG.md`.

## Signing off your commits (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/).
There is **no CLA**. You just certify that you wrote the change, or otherwise
have the right to submit it, by signing off each commit:

```sh
git commit -s -m "Fix the thing"
```

That adds a `Signed-off-by: Your Name <you@example.com>` line. Commits without a
sign-off can't be merged.

## Review and merge

1. Open a pull request describing what changed and why.
2. A maintainer reviews it — expect a little back-and-forth, it's normal.
3. Once it's approved and checks pass, a maintainer squash-merges it.

Small, focused pull requests are easiest to review and land fastest.

## Be kind, report safely

- By taking part you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
- Found a security issue? Please don't open a public issue — follow
  [SECURITY.md](SECURITY.md) to report it privately.

That's it. Thanks for contributing.
