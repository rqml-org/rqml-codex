# rqml-codex

RQML spec-first enforcement for [OpenAI Codex](https://developers.openai.com/codex/) —
the Codex sibling of [rqml-claude](https://github.com/rqml-org/rqml-claude).

A Codex plugin that makes spec-first development enforced rather than
voluntary: deterministic hooks anchor every session on the project spec,
validate spec edits as they happen, and gate turn completion on the
`rqml check` verdict. Skills and the bundled `@rqml/mcp` server give the
agent the full read/record loop. The plugin contains no requirements logic
of its own — every verdict comes from the `rqml` CLI, so what blocks the
agent locally is exactly what blocks CI.

## Status

**Specification only.** The spec leads the code: [requirements.rqml](requirements.rqml)
(`RQML-CODEX-001`, draft) is authored and nothing is implemented yet.
Implementation starts once the spec is approved; `implements`/`verifiedBy`
trace edges will be recorded with `rqml link` as each artifact lands.

## Design notes (vs rqml-claude)

The enforcement shape is identical — anchor, validate, gate — but adapted to
documented Codex capabilities:

- **Hooks**: Codex `SessionStart` (context injection), `PostToolUse` on
  `apply_patch`, and `Stop` with `decision: "block"` + `stop_hook_active`
  loop protection cover the triad.
- **Skills, not slash commands**: Codex custom prompts are deprecated and not
  plugin-distributable; init/status/check ship as skills.
- **Hook trust**: plugin hooks are non-managed and fire only after the
  developer trusts them (`/hooks`). The plugin tracks whether enforcement is
  actually live and says so when it is not — see `REQ-TRUST-TRANSPARENCY`
  and the `ST-UNARMED` state in the spec.
- **Plugin format**: `.codex-plugin/plugin.json` manifest; the repo doubles
  as its own marketplace via `.agents/plugins/marketplace.json`.
