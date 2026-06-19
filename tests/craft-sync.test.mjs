/**
 * REQ-CRAFT-GUARD: the vendored reference docs must not drift from their
 * canonical sources in rqml-skill. They live canonically at
 * rqml-skill/references/{authoring,monorepo}.md and are propagated here by
 * rqml-skill's craft-sync (DEC-VENDOR-CRAFT). These tests fail if a vendored
 * copy diverges — do not edit skills/rqml-authoring/*.md locally; change them
 * upstream.
 *
 * Each skips (rather than fails) when the canonical source is unreachable, so a
 * network-less environment does not produce a spurious failure.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAW = "https://raw.githubusercontent.com/rqml-org/rqml-skill/main/references";
const REFS = ["authoring.md", "monorepo.md"];

for (const name of REFS) {
  test(`vendored ${name} matches the canonical rqml-skill source`, async (t) => {
    const vendored = await readFile(
      fileURLToPath(new URL(`../skills/rqml-authoring/${name}`, import.meta.url)),
      "utf8",
    );

    let canonical;
    try {
      const res = await fetch(`${RAW}/${name}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      canonical = await res.text();
    } catch (err) {
      t.skip(`canonical source unreachable (${err.message}); skipping ${name} drift check`);
      return;
    }

    assert.equal(
      vendored,
      canonical,
      `skills/rqml-authoring/${name} has drifted from rqml-skill references/${name}. ` +
        "Do not edit the vendored copy — change it upstream in rqml-skill and let craft-sync propagate.",
    );
  });
}
