---
name: rqml-init
description: "Adopt RQML in a project: scaffold the spec, elicit initial requirements, and arm the Codex RQML hooks."
---

# rqml-init

Use this skill when a developer wants to adopt RQML in a repository or create the first real RQML specification.

## Workflow

1. Run `rqml status` first. If no spec exists, run `rqml init` in the project root.
2. Elicit the goal, scope, acceptance criteria, constraints, and strictness level before drafting behavior.
3. Add or refine requirements in the `.rqml` file. Keep behavior specified before implementation.
4. Validate immediately with `rqml validate`.
5. Run `rqml status` and summarize the current coverage/drift state.
6. Tell the developer to review and trust this plugin's hooks with `/hooks`, then start a new session so SessionStart anchoring is active.

## Rules

- Do not invent requirements silently. Capture assumptions as notes or issues.
- Use `rqml skeleton req` for new requirement structure when helpful.
- Use path-based RQML MCP inputs when MCP tools are available.
- Record implementation and test traces with `rqml link` or `rqml_link`; do not hand-edit trace XML.
