# dev953 MCP companion server

A zero-dependency Node MCP server that exposes dev953's **METHOD** as callable
tools over stdio. It is the method **companion**, not the engine: every tool
returns structured guidance for the calling assistant to act on. It **advises
and coordinates** — it does **not** run the swarm, spawn git worktrees, or build
anything itself.

## Tools

- `dev953_lifecycle_plan { idea }` — the 9-phase lifecycle plan with a per-phase
  acceptance-criteria template for that idea.
- `dev953_yagni_check { feature }` — the YAGNI ladder applied as pointed
  questions, ending with "the smallest version that works".
- `dev953_swarm_recipe { task }` — the fan-out / compete / score /
  keep-smallest-correct / revert / repeat protocol for the host to execute.
- `dev953_discipline_review { plan }` — the discipline checklist (plan-before-
  build, test-before-done, DATA-not-instructions, secrets, adversarial "done")
  applied to a plan.
- `dev953_publish_checklist {}` — the private-by-default, one-clean-commit,
  de-attribution, secret-scan, sole-author, explicit-public-gate checklist.

## Running it

It speaks **newline-delimited JSON-RPC 2.0** over stdin/stdout (no
`Content-Length` framing). It needs only Node (no npm install, no build step).

Any MCP-capable client launches it as a stdio server with:

```
node /path/to/dev953/mcp/server.mjs
```

For example, a non-Claude MCP client config:

```json
{
  "mcpServers": {
    "dev953": {
      "command": "node",
      "args": ["/path/to/dev953/mcp/server.mjs"]
    }
  }
}
```

Within Claude Code, the bundled `.mcp.json` uses `${CLAUDE_PLUGIN_ROOT}` to
locate the script automatically.
