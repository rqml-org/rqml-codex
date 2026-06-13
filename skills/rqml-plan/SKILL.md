---
name: rqml-plan
description: "Draft or update the staged implementation plan at .rqml/plan.md — the Plan stage of the RQML process."
---

# rqml-plan

Use this skill for the **Plan** stage: break approved requirements into a staged implementation plan written for coding agents, stored at `.rqml/plan.md`. No code is written here — the plan is what the Code stage follows.

## Workflow

1. Read the spec (`rqml status`, `rqml show <REQ-ID>`) and any ADRs in `.rqml/adr/`. State **READY** if the spec is sufficient to begin, or **NOT READY** with the blocking gaps and which stage (Spec or Design) to return to first.
2. Write `.rqml/plan.md` as markdown stages with checkboxes. Each stage names its **Goal**, **Requirements** (by id), **Files** to create or modify, **Verification** commands, and the trace edges to record once it lands.
3. Frame every stage as a self-contained agent task — what to do, which files, what inputs (spec sections, ADRs, existing code), how to verify. Do not estimate human time. Honor the ADRs.

## Rules

- Preserve completed `[x]` stages when regenerating the plan.
- Use path inputs for RQML MCP tools.
- Implement nothing here; that is the Code stage (`rqml show` → `rqml impact` → implement → `rqml link` → `rqml check`).
