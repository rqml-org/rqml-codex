---
name: rqml-authoring
description: Author and review RQML requirements with clear statements, acceptance criteria, and traceable IDs.
---

# rqml-authoring

Use this skill when editing `.rqml` requirements, reviewing requirement quality,
or adding traceable specification content.

The **full authoring craft** — document structure, statement quality, identity &
lifecycle, and traceability — is in **`authoring.md`** in this skill directory:
the canonical guide, vendored from
[rqml-skill](https://github.com/rqml-org/rqml-skill). Read it for depth, and do
not edit it here — the upstream craft-sync keeps it current.

In a monorepo, the spec that governs a file is the **nearest enclosing**
`requirements.rqml` — its own directory, then each parent directory. See
**`monorepo.md`** for the scope and discovery rules.

## Non-negotiables

- Validate after every edit: `rqml validate` — never leave the spec invalid.
- Record trace links with `rqml link` / `rqml_link`, never by hand.
- Use `rqml skeleton <req|edge|testCase|stateMachine>`; never invent element shapes.
- Read before you write: `rqml show <ID>`, `rqml impact <ID>`.
- Finish only when `rqml check` passes — the Stop gate enforces it.

## In Codex

The `rqml_*` MCP tools are available; prefer their `path` inputs over inlining
documents. Companion skills run the five-stage process: `rqml-init`,
`rqml-status`, `rqml-design`, `rqml-plan`, `rqml-review`, `rqml-check`.

Full craft: `authoring.md` · Monorepo scope: `monorepo.md` · Canonical docs: https://rqml.org/docs/
