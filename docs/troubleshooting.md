# rqml-codex troubleshooting

## `rqml` is missing

Symptom: hooks warn that the RQML CLI is unavailable, or `rqml check` is not
found.

Fix:

```bash
npx -y @rqml/cli check
```

For repeated local use, install the CLI in the project or make sure your PATH
can find it. Hooks fail open when the CLI is missing so Codex does not get
stuck, but CI should still run the gate explicitly.

## Enforcement says inactive

Symptom: `rqml-status` reports inactive or unconfirmed enforcement.

Common causes:

- plugin hooks have not been trusted yet;
- hook trust was invalidated by a plugin update;
- the Codex surface you are using did not deliver plugin hooks;
- `PLUGIN_DATA` is unavailable, so hook activity cannot be confirmed.

Fix: run the Codex hook review flow, trust the RQML plugin hooks, then start a
new session and run `rqml-status` again. If hooks still do not fire, rely on
manual `rqml-check` plus CI until the host surface supports the hook path.

## No spec is found

Symptom: the plugin is dormant and does not inject context.

Fix: add a governing RQML spec. By convention this is `requirements.rqml` at
the project root:

```text
Use rqml-init to adopt RQML in this repo.
```

In monorepos, the plugin uses the nearest enclosing `requirements.rqml`. A
session inside a package should find that package or parent spec. A workspace
root with package specs beneath it should use the workspace check.

## The stop hook blocks the turn

Symptom: Codex cannot finish because `rqml check` returned findings.

Fix the finding rather than bypassing it:

- invalid spec: repair `requirements.rqml`;
- unimplemented requirement: implement the approved requirement or change the
  spec through review;
- unverified requirement: add a test and record a `verifiedBy` link;
- drifted artifact: inspect the changed file, confirm it still satisfies the
  requirement, and refresh the trace link if appropriate;
- dangling reference: fix or remove the broken trace.

Then rerun:

```bash
rqml check
```

## CI fails but local hooks passed

CI is the backstop. It may catch issues that local hooks missed because hooks
were untrusted, the CLI was missing locally, or a file was changed through a
path that bypassed a pre-tool event.

Run the same gates locally:

```bash
npm test
node scripts/validate-plugin.mjs
rqml check
rqml check --strictness strict
```

Fix the first deterministic failure before retrying the rest.

## Plugin validation fails

Symptom: `node scripts/validate-plugin.mjs` reports manifest, docs, skill, MCP,
or hook layout errors.

Fix the named file. The validator checks the installed plugin contract this
repo owns: manifest metadata, default hook discovery, MCP config, skills,
required docs, README links, and install-surface prompts.
