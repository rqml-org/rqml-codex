# rqml-codex

RQML spec-first enforcement for [OpenAI Codex](https://developers.openai.com/codex/) —
the Codex sibling of [rqml-claude](https://github.com/rqml-org/rqml-claude).

A Codex plugin that makes spec-first development enforced rather than
voluntary: deterministic hooks anchor every session on the project spec and
the [five-stage RQML process](https://rqml.org/docs/development-process),
validate spec edits as they happen, and gate turn completion on the
`rqml check` verdict. Skills and the bundled `@rqml/mcp` server give the
agent the full read/record loop — including `rqml-design` (record decisions
as ADRs in `.rqml/adr/`) and `rqml-plan` (maintain `.rqml/plan.md`). The
plugin contains no requirements logic of its own — every verdict comes from
the `rqml` CLI, so what blocks the agent locally is exactly what blocks CI.

## Status

Initial plugin implementation is present. The spec still leads the code:
[requirements.rqml](requirements.rqml) (`RQML-CODEX-001`, draft) defines the
required behavior, and implementation/test trace edges are recorded with
`rqml link`.

## Design notes (vs rqml-claude)

The enforcement shape is identical — anchor, validate, gate — but adapted to
documented Codex capabilities:

- **Hooks**: Codex `SessionStart` (context injection), `PostToolUse` on
  `apply_patch`, and `Stop` with `decision: "block"` + `stop_hook_active`
  loop protection cover the triad.
- **Skills, not slash commands**: Codex custom prompts are deprecated and not
  plugin-distributable; init/status/design/plan/check ship as skills.
- **Hook trust**: plugin hooks are non-managed and fire only after the
  developer trusts them (`/hooks`). The plugin tracks whether enforcement is
  actually live and says so when it is not — see `REQ-TRUST-TRANSPARENCY`
  and the `ST-UNARMED` state in the spec.
- **Plugin format**: `.codex-plugin/plugin.json` manifest; the repo doubles
  as its own marketplace via `.agents/plugins/marketplace.json`.

## Plugin layout

- `.codex-plugin/plugin.json` - Codex plugin manifest for the `rqml` plugin.
- `.mcp.json` - bundled `@rqml/mcp` server launched through `npx`.
- `hooks/hooks.json` - SessionStart, PostToolUse, and Stop hook bindings.
- `hooks/rqml-codex-hook.mjs` - hook entrypoint.
- `lib/rqml-codex-core.mjs` - deterministic adapter over the `rqml` CLI.
- `scripts/rqml-codex.mjs` - helper used by bundled skills.
- `skills/` - `rqml-init`, `rqml-status`, `rqml-design`, `rqml-plan`,
  `rqml-check`, and `rqml-authoring` workflows.
- `tests/` - hook behavior tests with a fake `rqml` binary.

## Verification

```bash
npm test
python3 /path/to/validate_plugin.py .
rqml check
```

The plugin validator needs PyYAML available to the Python interpreter running
it. The hook tests do not require network access or an installed `@rqml/mcp`
server.
