# Changelog

All notable changes to dev953 are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-06-23

### Changed

- The plan/test gate (`hooks/gate.mjs`) now stays **inert when no run is active**
  (no `.dev953/` store present) instead of failing closed, so the plugin can be
  installed at user/global scope without policing unrelated sessions. All in-run
  protections are unchanged: once a run's store exists, the gate-marker
  validation, phase gates, irreversible-op confirmation, and test-before-done
  block all apply exactly as before — and because `rm -rf .dev953` is itself a
  gated irreversible op, the store cannot be removed mid-run to reach the
  pass-through. A missing/corrupt `state.json` while the store exists still fails
  closed.

## [1.2.0] - 2026-06-23

### Added

- A bundled MCP companion server that exposes dev953's method — lifecycle plan,
  swarm recipe, YAGNI check, discipline review, and publish checklist — to any
  MCP-capable assistant.
- A single-file `.mcpb` bundle for one-click use in Claude Desktop.

### Changed

- Re-implemented the entire executable layer (two hooks plus helper scripts) as
  zero-dependency Node.js (`.mjs`), so it runs the same on Windows, macOS, and
  Linux.
- Rebranded to the GRU953 identity (teal seedling, Figtree typeface).
- Relicensed to Apache-2.0.

### Fixed

- The run-lock now uses process-liveness with a race-safe atomic reclaim,
  replacing the previous stale-lock handling.
- Cross-platform path handling throughout, fixing breakage on Windows.

### Security

- Hardened after a multi-expert audit:
  - The gate now recomputes and validates its own tamper-marker.
  - The publish-command gate and the secret scanner share a single matcher, so
    they can't drift apart.
  - Irreversible operations now require a fresh, op-bound confirmation token.
  - Fixed a ReDoS (regular-expression denial of service) in the secret scanner.

## [1.1.0] - 2026-06-23

### Added

- Cross-platform Node port plus an MCP companion (first cut).

## [1.0.0] - 2026-06-23

### Added

- First release: one `/dev953` command, the swarm engine, a local
  memory/coordination store, two safety hooks, and private-by-default
  publishing.

[1.2.1]: https://github.com/GRU953/dev953/compare/v1.2.0...main
[1.2.0]: https://github.com/GRU953/dev953/releases/tag/v1.2.0
[1.1.0]: https://github.com/GRU953/dev953/releases/tag/v1.1.0
[1.0.0]: https://github.com/GRU953/dev953/releases/tag/v1.0.0
