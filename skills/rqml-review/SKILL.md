---
name: rqml-review
description: "Review draft and review requirements with the developer and approve the accepted ones before implementation."
---

# rqml-review

Use this skill for the review→accept checkpoint: only approved requirements drive implementation (REQ-STATUS-ENUM). Never approve on the developer's behalf — surface each requirement and let them decide.

## Workflow

1. List what is awaiting acceptance: `rqml matrix --status draft,review` — the not-yet-approved requirements with their goals and coverage. For whole-spec context use `rqml overview` (optionally `--section`/`--id` to scope), or the `rqml_overview` / `rqml_matrix` MCP tools with path inputs.
2. For each pending requirement, read it in full with `rqml show <REQ-ID>` (or `rqml_show`) and present it with a brief, honest assessment — is it atomic, testable, correctly typed and prioritized?
3. For each requirement the developer accepts, record it deterministically with `rqml approve <REQ-ID>`. Leave the rest as draft/review and note any to rework.
4. Confirm with `rqml matrix --status draft,review` — the accepted requirements should no longer appear.

## Rules

- Do not implement a requirement until it is approved; the pre-implementation gate denies edits to code that traces to a non-approved requirement.
- Use path inputs for RQML MCP tools. Do not hand-edit status attributes — `rqml approve` performs the transition, preserving formatting.
