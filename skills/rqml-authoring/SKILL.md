---
name: rqml-authoring
description: Author and review RQML requirements with clear statements, acceptance criteria, and traceable IDs.
---

# rqml-authoring

Use this skill when editing `.rqml` requirements, reviewing requirement quality, or adding traceable specification content.

## Authoring Rules

- Start from intent: actor, system behavior, observable outcome, and constraints.
- Use normative language deliberately: MUST/SHALL for required behavior, SHOULD for preferred behavior, MAY for optional behavior.
- Keep each requirement testable. Add acceptance criteria for behavior that needs clear verification.
- Use `rqml skeleton req`, `rqml skeleton edge`, and `rqml skeleton testCase` when structure is uncertain.
- Validate with `rqml validate` after every spec edit.
- Use `rqml link` or `rqml_link` for trace edges; do not hand-edit trace XML.

## Review Checklist

- Requirement statement is specific enough to implement.
- Acceptance criteria name observable inputs and outcomes.
- IDs follow the repository convention.
- Trace links connect goals, requirements, implementation, and tests.
- No behavior is added to code without a requirement.
