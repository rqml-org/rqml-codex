<!-- Canonical RQML monorepo spec-scope & discovery model. Source of truth: rqml-org/rqml-skill (references/monorepo.md). -->
<!-- canonical-version: 1 -->

# RQML in a monorepo: spec scope and discovery

How RQML decides which specification governs a given file when one repository holds
more than one spec. Full reference: https://rqml.org/docs/monorepo.

## One spec per project

Each project has exactly one specification (conventionally `requirements.rqml`) and
one co-located `.rqml/` directory, both in that project's own directory. A directory
*named* `.rqml` is not a spec — only the `requirements.rqml` file (or a sole `*.rqml`
file) is.

## What a spec governs

A spec governs the directory it sits in and every **subdirectory** of that directory,
however deeply nested. A spec never governs a **parent directory** of the one it sits
in, and never governs a sibling project.

When one spec's directory is itself a subdirectory of another spec's directory, the
**nearer** spec governs that subdirectory and everything inside it; the other spec
governs everything else inside its own directory. Governance is never inherited or
merged between specs — for any file, exactly one spec governs it: the **nearest
enclosing** one.

## How a tool finds the governing spec (discovery)

Given a working file or directory, the tooling looks for a `requirements.rqml` in that
directory. If none is there, it looks in the **parent directory**, then that
directory's parent, and so on, stopping at the first `requirements.rqml` it finds (the
nearest enclosing spec) or at the repository root. Pass an explicit path or
`--base-dir <dir>` to override.

## Working across several specs

- `rqml check --workspace` gates every discovered spec in the repository at once and
  returns one aggregated exit code.
- `--all` and `--ignore <glob>` scope which specs a workspace command considers.
- `rqml_discover` (MCP) lists the specs a repository contains.

## Information between specs

A requirement in one spec refers to a requirement in another **only** through a trace
edge with a document locator (the other spec's URI + id) — never by where spec files
are placed. Placement decides governance scope and nothing else; every cross-spec
relationship is an explicit trace edge.

## Deciding whether to add a nested spec

Add a second spec only when a subdirectory is a distinct project that should be governed
on its own. The new spec then governs that subdirectory and its subdirectories, and the
surrounding spec stops governing them. If you only want existing requirements to keep
applying, do **not** add a spec — let the nearest enclosing spec govern, and link across
specs with trace edges where a real dependency exists.

## Canonical source

This file is maintained in rqml-skill and synced into the rqml-claude and rqml-codex
plugins; do not edit a vendored copy. Bump `canonical-version` above whenever the
content changes.
