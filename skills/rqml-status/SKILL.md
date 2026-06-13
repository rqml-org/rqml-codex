---
name: rqml-status
description: Re-anchor a Codex session on RQML status, coverage, drift, and hook enforcement state.
---

# rqml-status

Use this skill to re-anchor on the current RQML specification and determine whether Codex enforcement is live.

## Workflow

1. Run `rqml status --json` in the project root.
2. If this plugin's bundled script is available, run `node <plugin-root>/scripts/rqml-codex.mjs status` for the enforcement-state check.
3. Report the spec docId, strictness, coverage gaps, drift/dangling refs, and lint count.
4. State the enforcement posture plainly:
   - Active only if the current session received RQML hook context or the helper can confirm current-session hook activity.
   - Inactive or unconfirmed if hooks have not fired; direct the developer to `/hooks` and the documented fallback installation.

## Rules

- Use `rqml show <REQ-ID>` or `rqml_show` for details instead of rereading the whole spec.
- Use path inputs for MCP tools.
- Do not say enforcement is active merely because the plugin is installed.
