<p align="center">
  <img src="https://rqml.org/img/RQML_logo_transparent.png" alt="RQML logo" width="280">
</p>

<h1 align="center">Make Codex code from the spec, not from a fading chat thread.</h1>

<p align="center">
  <strong>rqml-codex</strong> is the RQML plugin for
  <a href="https://developers.openai.com/codex/">OpenAI Codex</a>. It anchors
  every session on your requirements, traces the code and tests Codex writes
  back to them, and lets a turn finish only when the deterministic
  <code>rqml check</code> gate passes — locally and in CI.
</p>

<p align="center">
  <a href="docs/quickstart.md">Quickstart</a> •
  <a href="docs/why-rqml-codex.md">Why rqml-codex</a> •
  <a href="docs/troubleshooting.md">Troubleshooting</a> •
  <a href="https://rqml.org">RQML</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@rqml/cli?label=%40rqml%2Fcli&color=8568ab" alt="@rqml/cli on npm">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
</p>

---

## What is RQML?

[RQML](https://rqml.org) is Requirements Markup Language: a human-readable,
tool-readable way to make software intent explicit. A project keeps a durable
requirements artifact, usually `requirements.rqml`, with goals, scenarios,
requirements, verification, and trace links.

That matters more when agents write code. Codex can implement quickly, but it
cannot reliably infer all of the product boundaries, edge cases, non-functional
requirements, or prior decisions that live outside the prompt. RQML gives the
agent structured context and gives the team a deterministic way to ask: does
the code still match the spec?

The verdict is not model judgment. `rqml check` validates the spec, checks
coverage and drift, and fails when implementation or tests no longer line up
with the requirement trace.

## What this plugin does

`rqml-codex` packages the RQML loop for Codex:

- **Session anchoring**: trusted hooks run `rqml status` at session start and
  inject the current spec, coverage, and drift state into Codex context.
- **Spec-edit feedback**: edits to `.rqml` files are validated immediately, so
  invalid requirements are repaired in the same turn.
- **Completion gate**: the stop hook runs `rqml check` before the turn ends.
  Failing findings are returned to the agent as the continuation reason.
- **Spec-first skills**: `rqml-init`, `rqml-status`, `rqml-design`,
  `rqml-plan`, `rqml-check`, `rqml-review`, and `rqml-authoring` give Codex
  explicit entry points for the RQML workflow.
- **Agent tools**: the bundled `@rqml/mcp` server exposes `show`, `impact`,
  `link`, `skeleton`, `check`, and related commands without loading the whole
  XML document into the prompt.
- **CI parity**: local hooks, tests, and CI all rely on the same RQML CLI
  verdicts.

The plugin contains no requirements engine of its own. It is a thin Codex
adapter over the RQML CLI and MCP server.

## First 10 minutes

1. Install Node.js 18 or newer and confirm the RQML CLI works:

   ```bash
   npx -y @rqml/cli status
   ```

2. Add this repository as a Codex plugin marketplace:

   ```bash
   codex plugin marketplace add rqml-org/rqml-codex
   ```

   Then open the Codex plugin directory, choose the RQML marketplace entry, and
   install or enable the plugin. For local development, this repository already
   carries `.agents/plugins/marketplace.json`.

3. In the target repository, start Codex and ask:

   ```text
   Use rqml-init to adopt RQML in this repo.
   ```

   The skill scaffolds or updates the RQML project, elicits real requirements,
   and walks you through the hook trust flow.

4. Trust the plugin hooks when Codex asks you to review them. Until this is
   done, skills and MCP tools still work, but automatic anchoring and stop-time
   enforcement are inactive.

5. Run the loop once:

   ```bash
   rqml status
   rqml show REQ-...
   rqml impact REQ-...
   # implement
   rqml link REQ-... path/to/implementation
   rqml link REQ-... path/to/test --type verifiedBy
   rqml check
   ```

See [docs/quickstart.md](docs/quickstart.md) for the full first-green-check
walkthrough.

## Daily workflow

Use Codex normally, but make the spec the starting point:

```text
Use rqml-status to re-anchor on the current spec.
Draft requirements before coding this change.
Use rqml-check and resolve every finding before finishing.
```

For a typical change:

1. **Spec**: add or update approved requirements before implementation.
2. **Design**: use `rqml-design` when a decision should become an ADR.
3. **Plan**: use `rqml-plan` for staged implementation work.
4. **Code**: read with `rqml show`, assess blast radius with `rqml impact`,
   implement, and record `implements` links with `rqml link`.
5. **Verify**: add tests, record `verifiedBy` links, and finish with
   `rqml check`.

## Trust and limits

Codex plugin hooks are reviewed by the host. Until the developer trusts them,
the plugin is installed but not enforcing automatically. `rqml-status` and
`rqml-check` report that state rather than implying protection that is not
active.

The pre-edit hook is a fast feedback guardrail, not a complete security
boundary. Some file writes can bypass pre-tool events. The authoritative gate
is the stop hook plus CI running the same `rqml check` and strict check.

If the RQML CLI is missing, hooks fail open so Codex is not bricked by a local
tooling issue. CI remains the unconditional backstop.

## Monorepos

The governing spec is the nearest enclosing `requirements.rqml`. A Codex
session inside a package is governed by that package or parent spec. At a
workspace root with no spec of its own but package specs beneath it, the plugin
surfaces the package specs and the stop gate uses the workspace check.

See [skills/rqml-authoring/monorepo.md](skills/rqml-authoring/monorepo.md) for
the canonical monorepo guidance bundled with the authoring skill.

## Learn more

- [Why rqml-codex exists](docs/why-rqml-codex.md)
- [Quickstart](docs/quickstart.md)
- [Troubleshooting](docs/troubleshooting.md)
- [RQML user guide](https://rqml.org/docs/user-guide/)
- [RQML tooling](https://rqml.org/docs/tooling/)
- [Codex plugin docs](https://developers.openai.com/codex/plugins)

## Plugin layout

- `.codex-plugin/plugin.json`: Codex plugin manifest for the `rqml` plugin.
- `.mcp.json`: bundled `@rqml/mcp` server launched through `npx`.
- `hooks/hooks.json`: SessionStart, PreToolUse, PostToolUse, and Stop bindings.
- `hooks/rqml-codex-hook.mjs`: hook entrypoint.
- `lib/rqml-codex-core.mjs`: deterministic adapter over the `rqml` CLI.
- `scripts/rqml-codex.mjs`: helper used by bundled skills.
- `skills/`: RQML Codex workflows.
- `docs/`: human-facing adoption and troubleshooting docs.
- `tests/`: hook, installed-layout, CI, craft-sync, and docs validation tests.

## Verification

```bash
npm test
node scripts/validate-plugin.mjs
rqml check
rqml check --strictness strict
```

The installed-layout smoke test uses a fake `rqml` binary and does not require
a real Codex host install. The craft drift guard skips, rather than fails,
when the canonical upstream reference is unreachable.
