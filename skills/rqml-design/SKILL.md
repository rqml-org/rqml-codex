---
name: rqml-design
description: "Record significant architectural decisions as ADRs in .rqml/adr/ — the Design stage of the RQML process."
---

# rqml-design

Use this skill for the **Design** stage: turn an architectural decision into an Architecture Decision Record (ADR). No behavior is added and no code is written — design precedes code.

## Workflow

1. Classify the decision into exactly one of: `required_by_spec`, `derived_from_requirements`, `discretionary_design_choice`, or `implementation_detail`. Only the first three are ADR-worthy; for an `implementation_detail`, reason about it but create no ADR.
2. Read the relevant requirements (`rqml show <REQ-ID>` or `rqml_show`) and assess what the decision touches (`rqml impact <REQ-ID>` or `rqml_impact`).
3. Weigh options with honest pros and cons, then recommend a decision tied to the requirement ids.
4. When ADR-worthy, write `.rqml/adr/NNNN-kebab-slug.md` (the next number after the highest existing one) using the canonical template (https://rqml.org/docs/development-process/design): a metadata block — Status, Date, Classification, Related requirements, Related ADRs, Affected components — then Context, Decision drivers, Options considered, Decision, Consequences, Supersession.

## Rules

- ADRs are immutable once accepted: supersede with a new ADR and mark the old one `Superseded by ADR-NNNN`; never edit or delete one.
- Optionally summarize a significant decision as a `<decision>` element, cross-referenced to the ADR by id.
- Use path inputs for RQML MCP tools. Do not implement the decision here — that is the Code stage.
