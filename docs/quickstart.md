# rqml-codex quickstart

This walkthrough gets a repository from "plugin installed" to the first green
RQML gate.

## 1. Check prerequisites

Use Node.js 18 or newer. The plugin calls the RQML CLI, so install it (the
hooks need `rqml` on your PATH):

```bash
npm install -g @rqml/cli
rqml status
```

In an uninitialized repo, `status` may report that no spec exists. That is
fine; the goal is to confirm the CLI runs. (One-off without a global install:
`npx -y @rqml/cli status`.)

## 2. Install the plugin

Add this repository as a Codex marketplace source:

```bash
codex plugin marketplace add rqml-org/rqml-codex
```

Then open the Codex plugin directory, choose the RQML marketplace entry, and
install or enable the plugin. If you are testing from a local checkout, the
repository already includes `.agents/plugins/marketplace.json`.

## 3. Adopt RQML in the target repo

Start Codex in the project you want to govern and ask:

```text
Use rqml-init to adopt RQML in this repo.
```

The skill should:

- create or update `requirements.rqml`;
- elicit real project goals, requirements, acceptance criteria, and risks;
- scaffold `AGENTS.md`, or merge the RQML guidance into an existing one as a
  managed block — your own content is preserved, and re-running `rqml init`
  refreshes the block in place;
- explain how to trust the plugin hooks.

Do not start implementation until the new requirements are reviewed and
approved according to your project's strictness level.

## 4. Trust hooks

Codex treats plugin-bundled hooks as reviewable commands. Use the host's hook
review flow when prompted. Until trusted, the plugin is useful but unarmed:
skills and MCP tools work, while automatic session anchoring, spec validation,
and stop-time enforcement do not fire.

After trust is granted, start a fresh session and run:

```text
Use rqml-status to re-anchor on the current spec.
```

The output should say enforcement is active or explain why it is not.

## 5. Make one requirement-backed change

Pick one requirement and inspect it:

```bash
rqml show REQ-...
rqml impact REQ-...
```

Implement only the specified behavior. If the requirement is missing or wrong,
update the spec first and get it approved before coding.

Record trace links:

```bash
rqml link REQ-... path/to/implementation
rqml link REQ-... path/to/test --type verifiedBy
```

Then run:

```bash
npm test
rqml check
```

The first successful loop is complete when tests pass and `rqml check` exits
zero.

## Expected result

A healthy setup has:

- a valid `requirements.rqml`;
- Codex skills available for `rqml-init`, `rqml-status`, and `rqml-check`;
- hook status reported honestly as active or inactive;
- implementation and test trace links for new requirements;
- a passing `rqml check` locally and in CI.
