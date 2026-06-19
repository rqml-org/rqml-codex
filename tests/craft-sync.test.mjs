/**
 * REQ-CRAFT-GUARD: the vendored authoring craft must not drift from the
 * canonical source in rqml-skill. The craft lives canonically at
 * rqml-skill/references/authoring.md and is propagated here by rqml-skill's
 * craft-sync (DEC-VENDOR-CRAFT). This test fails if the vendored copy diverges
 * — do not edit skills/rqml-authoring/authoring.md locally; change it upstream.
 *
 * It skips (rather than fails) when the canonical source is unreachable, so a
 * network-less environment does not produce a spurious failure.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CANONICAL_URL =
  "https://raw.githubusercontent.com/rqml-org/rqml-skill/main/references/authoring.md";
const VENDORED = fileURLToPath(
  new URL("../skills/rqml-authoring/authoring.md", import.meta.url),
);

test("vendored authoring craft matches the canonical rqml-skill source", async (t) => {
  const vendored = await readFile(VENDORED, "utf8");

  let canonical;
  try {
    const res = await fetch(CANONICAL_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    canonical = await res.text();
  } catch (err) {
    t.skip(`canonical source unreachable (${err.message}); skipping craft drift check`);
    return;
  }

  assert.equal(
    vendored,
    canonical,
    "skills/rqml-authoring/authoring.md has drifted from rqml-skill references/authoring.md. " +
      "Do not edit the vendored copy — change it upstream in rqml-skill and let craft-sync propagate.",
  );
});
