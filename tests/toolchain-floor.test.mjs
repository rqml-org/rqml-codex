/**
 * TC-FLOOR and TC-FLOOR-SYNC (REQ-CLI-FLOOR).
 *
 * The floor check warns when the installed rqml CLI is older than the minimum
 * this plugin honours — and, just as importantly, stays silent otherwise. A gate
 * that nags about version numbers gets switched off, and then it protects
 * nobody, so the silent cases are tested as carefully as the loud one.
 *
 * The sync test pulls the canonical declaration and skips when it is
 * unreachable, matching the craft drift guard: a network-less run must not fail
 * spuriously.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { compareVersions, readFloor } from "../lib/rqml-codex-core.mjs";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const hookScript = path.join(repoRoot, "hooks", "rqml-codex-hook.mjs");
const CANONICAL = "https://rqml.org/toolchain-floor.json";
const FLOOR = JSON.parse(readFileSync(path.join(repoRoot, "toolchain-floor.json"), "utf8"));

/**
 * A fixture whose PATH carries a stand-in rqml reporting `version`. Its `status`
 * answers with a minimal report so SessionStart reaches the floor check; every
 * other subcommand is a usage error, which the hooks already fail open on.
 */
async function fixtureWithCli(version) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "rqml-codex-floor-"));
  const bin = path.join(cwd, "bin");
  const pluginData = path.join(cwd, "plugin-data");
  await fs.mkdir(bin);
  await fs.mkdir(pluginData);
  await fs.writeFile(path.join(cwd, "requirements.rqml"), "<rqml/>\n", "utf8");
  const statusJson = JSON.stringify({
    path: "requirements.rqml",
    docId: "DOC-FLOOR",
    version: "2.1.0",
    status: "draft",
    requirements: 1,
    edges: 0,
    uncoveredGoals: [],
    unverifiedRequirements: [],
    unimplementedRequirements: [],
    prematureImplementations: [],
    danglingReferences: 0,
    lintFindings: 0,
  });
  await fs.writeFile(
    path.join(bin, "rqml"),
    `#!/bin/sh\n` +
      `case "$1" in\n` +
      `  --version) printf '%s\\n' '${version}'; exit 0 ;;\n` +
      `  status) printf '%s\\n' '${statusJson.replace(/'/g, "'\\''")}'; exit 0 ;;\n` +
      `esac\n` +
      `printf 'usage\\n' >&2\nexit 64\n`,
    { mode: 0o755 },
  );
  return {
    cwd,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`,
      PLUGIN_DATA: pluginData,
    },
  };
}

function runSessionStart(fixture, sessionId) {
  const result = spawnSync(process.execPath, [hookScript, "session-start"], {
    input: JSON.stringify({ session_id: sessionId, cwd: fixture.cwd }),
    encoding: "utf8",
    env: fixture.env,
  });
  return {
    status: result.status,
    payload: JSON.parse(result.stdout || "{}"),
  };
}

const sid = () => `floor-${Math.floor(Math.random() * 1e9)}`;

/** Shift a semantic version by `delta` minor releases, clamped at zero. */
function shift(version, delta) {
  const [major, minor, patch] = version.split("-")[0].split(".").map(Number);
  return delta < 0 && minor === 0
    ? `${Math.max(0, major - 1)}.0.${patch}`
    : `${major}.${Math.max(0, minor + delta)}.${patch}`;
}

// ---------------------------------------------------------------------------
// TC-FLOOR — CRIT-FLOOR-BELOW / CRIT-FLOOR-SATISFIED / CRIT-FLOOR-UNREADABLE
// ---------------------------------------------------------------------------

test("TC-FLOOR: an under-floor CLI warns once, names the versions, blocks nothing", async () => {
  const below = shift(FLOOR.cliFloor, -1);
  const fixture = await fixtureWithCli(below);
  const session = sid();

  const first = runSessionStart(fixture, session);
  assert.equal(first.status, 0, "the session is never blocked over a version");
  assert.match(first.payload.systemMessage, new RegExp(`rqml ${below.replace(/\./g, "\\.")}`));
  assert.match(first.payload.systemMessage, new RegExp(FLOOR.cliFloor.replace(/\./g, "\\.")));
  assert.match(first.payload.systemMessage, /npm install -g @rqml\/cli/);
  assert.ok(first.payload.hookSpecificOutput.additionalContext, "the anchor is still injected");

  const second = runSessionStart(fixture, session);
  assert.equal(second.payload.systemMessage, undefined, "warned only once per session");
  assert.ok(second.payload.hookSpecificOutput.additionalContext, "but the anchor keeps coming");
});

test("TC-FLOOR: a CLI at or above the floor is never mentioned, however new", async () => {
  for (const version of [FLOOR.cliFloor, shift(FLOOR.cliFloor, 9)]) {
    const fixture = await fixtureWithCli(version);
    const result = runSessionStart(fixture, sid());
    assert.equal(result.payload.systemMessage, undefined, `${version} should produce no warning`);
  }
});

test("TC-FLOOR: an unreadable version is silent, not a guess", async () => {
  const fixture = await fixtureWithCli("not-a-version");
  const result = runSessionStart(fixture, sid());
  assert.equal(result.status, 0);
  assert.equal(result.payload.systemMessage, undefined);
});

test("TC-FLOOR: the floor warning does not consume the missing-toolchain warning", async () => {
  // Distinct markers: an under-floor session that later loses the CLI entirely
  // must still get the install hint, and vice versa.
  const fixture = await fixtureWithCli(shift(FLOOR.cliFloor, -1));
  const session = sid();
  const first = runSessionStart(fixture, session);
  assert.match(first.payload.systemMessage, /is below the/);

  const stripped = { ...fixture, env: { ...fixture.env, PATH: "/nonexistent-bin" } };
  const second = runSessionStart(stripped, session);
  assert.match(second.payload.systemMessage, /npm install -g @rqml\/cli/);
  assert.match(second.payload.systemMessage, /unavailable or returned a usage error/);
});

// ---------------------------------------------------------------------------
// TC-FLOOR-SYNC — CRIT-FLOOR-VENDORED / CRIT-FLOOR-OVERRIDE
// ---------------------------------------------------------------------------

test("TC-FLOOR-SYNC: the vendored floor matches the published ecosystem declaration", async (t) => {
  let canonical;
  try {
    const res = await fetch(CANONICAL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    canonical = await res.text();
  } catch (err) {
    t.skip(`canonical declaration unreachable (${err.message}); skipping the drift check`);
    return;
  }

  assert.equal(
    readFileSync(path.join(repoRoot, "toolchain-floor.json"), "utf8"),
    canonical,
    "toolchain-floor.json has drifted from the canonical declaration. Do not edit the vendored " +
      `copy — change it in rqml-org/rqml (integrations/toolchain-floor.json) and re-vendor from ${CANONICAL}.`,
  );
});

test("TC-FLOOR-SYNC: a plugin floor may be raised above the ecosystem value, never lowered", () => {
  const declared = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).rqmlToolchain?.floor;
  if (declared !== undefined && declared !== "inherit") {
    assert.ok(
      compareVersions(declared, FLOOR.cliFloor) >= 0,
      `package.json declares floor ${declared}, below the ecosystem floor ${FLOOR.cliFloor}. ` +
        "A plugin may need a newer toolchain than the ecosystem baseline, never an older one.",
    );
  }
  assert.equal(readFloor(repoRoot), declared && declared !== "inherit" ? declared : FLOOR.cliFloor);
});

test("TC-FLOOR-SYNC: a missing vendored declaration disables the check rather than guessing", async () => {
  const bare = await fs.mkdtemp(path.join(os.tmpdir(), "rqml-codex-nofloor-"));
  assert.equal(readFloor(bare), null);
});
