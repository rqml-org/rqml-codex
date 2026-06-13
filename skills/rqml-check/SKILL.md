---
name: rqml-check
description: Run the RQML gate and resolve validation, coverage, and drift findings through the spec-first loop.
---

# rqml-check

Use this skill when the developer asks to run or satisfy the RQML gate.

## Workflow

1. Run `rqml check` in the project root. Use the project's declared strictness.
2. For each finding, inspect the relevant requirement with `rqml show <REQ-ID>` and check blast radius with `rqml impact <REQ-ID>` before editing.
3. Resolve findings by specifying, implementing, fixing, or linking. Use `rqml link <REQ-ID> <path>` for implementation traces and `rqml link <REQ-ID> <test-path> --type verifiedBy` for tests.
4. Re-run `rqml check` until it passes.
5. If hooks are not live or cannot be confirmed, say enforcement is inactive or unconfirmed and direct the developer to `/hooks`.

## Rules

- Do not waive or hide diagnostics.
- Keep CLI diagnostics verbatim when reporting a block.
- Prefer RQML MCP tools with path inputs when available.
