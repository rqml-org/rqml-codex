# Why rqml-codex exists

Codex accelerates implementation. RQML makes sure the accelerated work is still
aimed at the right target.

Without a durable specification, an agent session can drift toward whatever is
most plausible from the current prompt. Long sessions compact. Decisions hide
in chat. Requirements get implied rather than stated. Tests verify behavior
that nobody explicitly asked for.

RQML fixes the shape of the work: intent is captured as a structured,
reviewable requirements artifact; code and tests trace back to requirement IDs;
and deterministic checks catch drift when implementation changes after it was
linked.

## What RQML gives Codex

- **Stable intent**: requirements, acceptance criteria, constraints, and
  scenarios live in the repo instead of only in conversation.
- **Better context**: Codex can inspect one requirement with `rqml show`, assess
  blast radius with `rqml impact`, and avoid loading the whole XML file into
  the prompt.
- **Traceability**: `rqml link` records which files implement and verify a
  requirement.
- **Drift detection**: `rqml check` catches invalid specs, missing coverage,
  dangling references, and changed linked artifacts.
- **Deterministic verdicts**: models may help author requirements, but they do
  not decide whether the gate passes.

## What the Codex plugin adds

RQML works from the CLI by itself. The plugin makes it hard for Codex to ignore
the loop:

- `SessionStart` anchors the session on `rqml status`;
- `PostToolUse` validates spec edits immediately;
- `PreToolUse` provides fast feedback for edits tied to unapproved
  requirements when the host emits the event;
- `Stop` runs the final `rqml check` gate;
- skills give developers named workflows for init, status, design, planning,
  review, checking, and authoring;
- MCP tools expose the RQML engine to the agent without duplicating logic in
  the plugin.

The result is not more ceremony for its own sake. It is a shorter feedback loop
between "what we meant," "what Codex changed," and "how we know it still
matches."

## Who it is for

Use `rqml-codex` when:

- Codex is making substantive product or platform changes;
- undocumented behavior would be costly;
- multiple agents or humans touch the same codebase;
- you need CI to catch spec/code/test drift;
- you want a repo-local memory of intent that survives session boundaries.

Skip it for throwaway experiments where requirements are intentionally
informal. Use relaxed strictness for prototypes that need a lighter loop.

## What it is not

`rqml-codex` is not a code generator, not an AI reviewer, and not a replacement
for stakeholder judgment. It is an enforcement adapter over the RQML toolchain:
Codex can help draft and implement, but the repository-owned spec and the
deterministic RQML gate decide whether the work is complete.
