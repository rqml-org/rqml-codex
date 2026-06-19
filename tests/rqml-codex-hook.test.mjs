import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { findProjectSpec } from "../lib/rqml-codex-core.mjs";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const hookScript = path.join(repoRoot, "hooks", "rqml-codex-hook.mjs");
const skillScript = path.join(repoRoot, "scripts", "rqml-codex.mjs");

test("plugin metadata declares the required Codex components", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const mcp = JSON.parse(await fs.readFile(path.join(repoRoot, ".mcp.json"), "utf8"));
  const hooks = JSON.parse(await fs.readFile(path.join(repoRoot, "hooks", "hooks.json"), "utf8"));
  const marketplace = JSON.parse(await fs.readFile(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), "utf8"));

  assert.equal(manifest.name, "rqml");
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(mcp.mcpServers.rqml.command, "npx");
  assert.deepEqual(mcp.mcpServers.rqml.args, ["-y", "@rqml/mcp"]);
  assert.ok(hooks.hooks.SessionStart);
  assert.ok(hooks.hooks.PreToolUse);
  assert.ok(hooks.hooks.PostToolUse);
  assert.ok(hooks.hooks.Stop);
  assert.equal(marketplace.plugins[0].name, "rqml");
  assert.equal(marketplace.plugins[0].source.path, "./");
  assert.equal(marketplace.plugins[0].policy.installation, "AVAILABLE");
});

test("bundled skills are discoverable and delegate to RQML tools", async () => {
  const expected = {
    "rqml-init": [/rqml init/, /\/hooks/, /rqml validate/],
    "rqml-status": [/rqml status --json/, /enforcement/, /path inputs/],
    "rqml-check": [/rqml check/, /rqml show <REQ-ID>/, /rqml link/],
    "rqml-authoring": [/rqml skeleton/, /rqml validate/, /authoring\.md/],
    "rqml-design": [/\.rqml\/adr\//, /Classify/, /immutable once accepted/],
    "rqml-plan": [/\.rqml\/plan\.md/, /READY/, /rqml link/],
    "rqml-review": [/rqml approve <REQ-ID>/, /rqml matrix --status draft,review/, /pre-implementation gate/],
  };

  for (const [skillName, patterns] of Object.entries(expected)) {
    const contents = await fs.readFile(path.join(repoRoot, "skills", skillName, "SKILL.md"), "utf8");
    const frontmatter = parseFrontmatter(contents);
    assert.equal(frontmatter.name, skillName);
    assert.ok(frontmatter.description.length > 20);
    assert.ok(frontmatter.description.length < 160);
    for (const pattern of patterns) {
      assert.match(contents, pattern);
    }
  }
});

test("SessionStart is dormant without an RQML spec", async () => {
  const fixture = await makeFixture();
  const result = runHook("session-start", {
    cwd: fixture.cwd,
    session_id: "s-dormant",
    hook_event_name: "SessionStart",
  }, {
    PATH: "",
    PLUGIN_DATA: fixture.pluginData,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("SessionStart injects RQML status and loop guidance", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, {
    statusJson: {
      path: path.join(fixture.cwd, "requirements.rqml"),
      docId: "DOC-001",
      version: "2.1.0",
      status: "draft",
      requirements: 2,
      edges: 3,
      uncoveredGoals: [],
      unverifiedRequirements: ["REQ-2"],
      unimplementedRequirements: ["REQ-1"],
      prematureImplementations: [],
      danglingReferences: 0,
      lintFindings: 0,
    },
  });

  const result = runHook("session-start", {
    cwd: fixture.cwd,
    session_id: "s-anchor",
    hook_event_name: "SessionStart",
  }, fixture.env);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  const context = payload.hookSpecificOutput.additionalContext;
  assert.match(context, /DOC-001/);
  assert.match(context, /Requirements: 2; trace edges: 3/);
  assert.match(context, /five-stage RQML process/);
  assert.match(context, /\.rqml\/adr\//);
  assert.match(context, /\.rqml\/plan\.md/);
  assert.match(context, /rqml show <REQ-ID>/);
  assert.match(context, /rqml link/);
});

test("PostToolUse blocks with verbatim validation diagnostics for RQML edits", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, {
    validateExit: 1,
    validateMessage: "duplicate id REQ-1",
  });

  const result = runHook("post-tool-use", {
    cwd: fixture.cwd,
    session_id: "s-validate",
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: requirements.rqml\n@@\n*** End Patch\n",
    },
  }, fixture.env);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /Command: rqml validate requirements\.rqml --strictness standard/);
  assert.match(payload.reason, /duplicate id REQ-1/);
});

test("PostToolUse ignores non-RQML edits", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, {
    validateExit: 1,
    validateMessage: "should not run",
  });

  const result = runHook("post-tool-use", {
    cwd: fixture.cwd,
    session_id: "s-non-rqml",
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: README.md\n@@\n*** End Patch\n",
    },
  }, fixture.env);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("PreToolUse blocks edits to code implementing a non-approved requirement", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, {
    gateExit: 2,
    gateMessage: "src/a.ts implements REQ-B, which is not approved",
  });

  const result = runHook("pre-tool-use", {
    cwd: fixture.cwd,
    session_id: "s-gate",
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** End Patch\n" },
  }, fixture.env);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  // Current PreToolUse shape: hookSpecificOutput.permissionDecision "deny"
  // (not the legacy top-level decision:"block").
  assert.equal(payload.decision, undefined);
  assert.equal(payload.hookSpecificOutput.permissionDecision, "deny");
  assert.match(payload.hookSpecificOutput.permissionDecisionReason, /not approved/);
  assert.match(payload.hookSpecificOutput.permissionDecisionReason, /Command: rqml gate src\/a\.ts/);
});

test("PreToolUse allows edits when the approval gate is clear", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, { gateExit: 0 });

  const result = runHook("pre-tool-use", {
    cwd: fixture.cwd,
    session_id: "s-gate-ok",
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** End Patch\n" },
  }, fixture.env);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("PreToolUse ignores .rqml edits (validation and check own those)", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, { gateExit: 2, gateMessage: "should not run" });

  const result = runHook("pre-tool-use", {
    cwd: fixture.cwd,
    session_id: "s-gate-rqml",
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: requirements.rqml\n@@\n*** End Patch\n" },
  }, fixture.env);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("Stop blocks on rqml check failure with reproducible diagnostics", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, {
    checkExit: 2,
    checkMessage: "changed implementation diagnostic",
  });

  const result = runHook("stop", {
    cwd: fixture.cwd,
    session_id: "s-stop",
    hook_event_name: "Stop",
    stop_hook_active: false,
  }, fixture.env);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /RQML check failed/);
  assert.match(payload.reason, /Command: rqml check requirements\.rqml --strictness standard/);
  assert.match(payload.reason, /changed implementation diagnostic/);
});

test("Stop fails open after an active stop-hook continuation", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin, {
    checkExit: 2,
    checkMessage: "still failing",
  });

  const result = runHook("stop", {
    cwd: fixture.cwd,
    session_id: "s-stop-active",
    hook_event_name: "Stop",
    stop_hook_active: true,
  }, fixture.env);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, undefined);
  assert.match(payload.systemMessage, /Failing open/);
  assert.match(payload.systemMessage, /still failing/);
});

test("Missing rqml CLI warns once per session and never blocks", async () => {
  const fixture = await makeFixture({ withSpec: true });
  const input = {
    cwd: fixture.cwd,
    session_id: "s-missing-cli",
    hook_event_name: "Stop",
  };
  const env = {
    PATH: "",
    PLUGIN_DATA: fixture.pluginData,
  };

  const first = runHook("stop", input, env);
  const second = runHook("stop", input, env);

  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.match(JSON.parse(first.stdout).systemMessage, /npm install -g @rqml\/cli/);
  assert.equal(second.stdout, "");
});

// REQ-WORKSPACE-FANOUT: a directory with no governing spec but package specs
// beneath it is a workspace, not dormant. SessionStart surfaces the units and
// Stop gates them all with `rqml check --workspace`.
test("SessionStart surfaces workspace package specs at a spec-less root", async () => {
  const fixture = await makeFixture(); // no spec directly in cwd
  await installFakeRqml(fixture.bin, {
    workspaceUnits: [
      { docId: "PKG-A", status: "draft" },
      { docId: "PKG-B", status: "approved" },
    ],
  });

  const result = runHook("session-start", {
    cwd: fixture.cwd,
    session_id: "s-ws",
    hook_event_name: "SessionStart",
  }, fixture.env);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  const context = payload.hookSpecificOutput.additionalContext;
  assert.match(context, /workspace/i);
  assert.match(context, /PKG-A/);
  assert.match(context, /PKG-B/);
  assert.match(context, /rqml check --workspace/);
});

test("SessionStart stays dormant at a spec-less root with no workspace units", async () => {
  const fixture = await makeFixture();
  await installFakeRqml(fixture.bin, { workspaceUnits: [] });

  const result = runHook("session-start", {
    cwd: fixture.cwd,
    session_id: "s-ws-empty",
    hook_event_name: "SessionStart",
  }, fixture.env);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("Stop fans out to rqml check --workspace and blocks on a failing unit", async () => {
  const fixture = await makeFixture();
  await installFakeRqml(fixture.bin, {
    workspaceCheckExit: 2,
    workspaceCheckMessage: "PKG-B: changed implementation",
  });

  const result = runHook("stop", {
    cwd: fixture.cwd,
    session_id: "s-ws-stop",
    hook_event_name: "Stop",
    stop_hook_active: false,
  }, fixture.env);

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /workspace check failed/i);
  assert.match(payload.reason, /Command: rqml check --workspace --strictness standard/);
  assert.match(payload.reason, /PKG-B: changed implementation/);
});

test("Stop lets the turn end when the workspace check passes", async () => {
  const fixture = await makeFixture();
  await installFakeRqml(fixture.bin, { workspaceCheckExit: 0 });

  const result = runHook("stop", {
    cwd: fixture.cwd,
    session_id: "s-ws-stop-ok",
    hook_event_name: "Stop",
  }, fixture.env);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

// REQ-DISCOVERY: the governing spec is the nearest enclosing one, found by
// checking cwd then each parent directory — so a session in a subdirectory of a
// governed project is governed, not dormant.
test("findProjectSpec resolves the governing spec from a subdirectory (nearest enclosing)", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "rqml-codex-disc-"));
  try {
    writeFileSync(path.join(root, "requirements.rqml"), "<rqml/>");
    const deep = path.join(root, "pkg", "src");
    mkdirSync(deep, { recursive: true });
    assert.equal(findProjectSpec(root), path.join(root, "requirements.rqml"));
    assert.equal(findProjectSpec(deep), path.join(root, "requirements.rqml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findProjectSpec returns null with no spec in cwd or any parent", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "rqml-codex-bare-"));
  try {
    mkdirSync(path.join(root, ".rqml")); // a .rqml directory is not a spec
    const sub = path.join(root, "pkg", "src");
    mkdirSync(sub, { recursive: true });
    assert.equal(findProjectSpec(root), null);
    assert.equal(findProjectSpec(sub), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Nearest-enclosing precedence: a nested package spec governs its own subtree
// even when an ancestor also holds a spec (the closer one wins).
test("findProjectSpec: a nested package spec wins over the repository-root spec", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "rqml-codex-nested-"));
  try {
    mkdirSync(path.join(root, ".git")); // bound the upward walk at the repo root
    writeFileSync(path.join(root, "requirements.rqml"), "<rqml/>");
    const pkg = path.join(root, "packages", "a");
    const pkgSrc = path.join(pkg, "src");
    mkdirSync(pkgSrc, { recursive: true });
    writeFileSync(path.join(pkg, "requirements.rqml"), "<rqml/>");

    // cwd under packages/a resolves to packages/a's spec, not the root's.
    assert.equal(findProjectSpec(pkgSrc), path.join(pkg, "requirements.rqml"));
    assert.equal(findProjectSpec(pkg), path.join(pkg, "requirements.rqml"));
    // A sibling location with no nearer spec still resolves to the root spec.
    assert.equal(findProjectSpec(root), path.join(root, "requirements.rqml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The repository boundary stops the walk: a spec above a .git marker does not
// govern a session inside the repo (no escaping into a parent repo/workspace).
test("findProjectSpec: a .git directory bounds the walk and shadows an outer spec", () => {
  const outer = mkdtempSync(path.join(os.tmpdir(), "rqml-codex-bound-"));
  try {
    writeFileSync(path.join(outer, "requirements.rqml"), "<rqml/>"); // outside the repo
    const repo = path.join(outer, "repo");
    const sub = path.join(repo, "src");
    mkdirSync(sub, { recursive: true });
    mkdirSync(path.join(repo, ".git")); // repo boundary, no spec inside the repo

    assert.equal(findProjectSpec(sub), null);
    assert.equal(findProjectSpec(repo), null);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

// A .git FILE (git worktrees and submodules use a file, not a directory) is an
// equally valid boundary marker — existsSync treats both alike.
test("findProjectSpec: a .git file bounds the walk like a .git directory", () => {
  const outer = mkdtempSync(path.join(os.tmpdir(), "rqml-codex-worktree-"));
  try {
    writeFileSync(path.join(outer, "requirements.rqml"), "<rqml/>"); // outside the worktree
    const repo = path.join(outer, "wt");
    const sub = path.join(repo, "src");
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(repo, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");

    assert.equal(findProjectSpec(sub), null);
    assert.equal(findProjectSpec(repo), null);
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

// A directory holding a single non-requirements.rqml spec resolves to that file.
test("findProjectSpec: a sole non-requirements.rqml spec is the governing spec", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "rqml-codex-sole-"));
  try {
    writeFileSync(path.join(root, "product.rqml"), "<rqml/>");
    const sub = path.join(root, "src");
    mkdirSync(sub, { recursive: true });

    assert.equal(findProjectSpec(root), path.join(root, "product.rqml"));
    assert.equal(findProjectSpec(sub), path.join(root, "product.rqml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("status helper reports unconfirmed enforcement without hook state", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin);

  const result = spawnSync(process.execPath, [skillScript, "status"], {
    cwd: fixture.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}${path.delimiter}${process.env.PATH || ""}`,
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /RQML status - DOC-TEST/);
  assert.match(result.stdout, /Enforcement: inactive or unconfirmed/);
  assert.match(result.stdout, /\/hooks/);
});

test("Stop invokes rqml check with AGENTS.md strictness", async () => {
  const fixture = await makeFixture({ withSpec: true });
  await fs.writeFile(path.join(fixture.cwd, "AGENTS.md"), "Strictness: `strict`\n", "utf8");
  const logPath = path.join(fixture.cwd, "rqml-args.log");
  await installFakeRqml(fixture.bin, {
    checkExit: 0,
    logPath,
  });

  const result = runHook("stop", {
    cwd: fixture.cwd,
    session_id: "s-strict",
    hook_event_name: "Stop",
  }, fixture.env);

  assert.equal(result.status, 0);
  const log = await fs.readFile(logPath, "utf8");
  assert.match(log, /check requirements\.rqml --strictness strict --json/);
});

async function makeFixture(options = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "rqml-codex-test-"));
  const bin = path.join(cwd, "bin");
  const pluginData = path.join(cwd, "plugin-data");
  await fs.mkdir(bin);
  await fs.mkdir(pluginData);
  if (options.withSpec) {
    await fs.writeFile(path.join(cwd, "requirements.rqml"), "<rqml/>\n", "utf8");
  }
  return {
    cwd,
    bin,
    pluginData,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`,
      PLUGIN_DATA: pluginData,
    },
  };
}

function runHook(eventName, input, env) {
  return spawnSync(process.execPath, [hookScript, eventName], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env,
  });
}

async function installFakeRqml(binDir, options = {}) {
  const statusJson = JSON.stringify(options.statusJson || {
    path: "requirements.rqml",
    docId: "DOC-TEST",
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
  const validateExit = Number(options.validateExit || 0);
  const checkExit = Number(options.checkExit || 0);
  const gateExit = Number(options.gateExit || 0);
  const validateMessage = options.validateMessage || "validation failed";
  const checkMessage = options.checkMessage || "check failed";
  const gateMessage = options.gateMessage || "gate finding";
  const logPath = options.logPath || "";
  const workspaceUnits = Array.isArray(options.workspaceUnits) ? options.workspaceUnits : [];
  const workspaceAmbiguous = Array.isArray(options.workspaceAmbiguous) ? options.workspaceAmbiguous : [];
  const workspaceStatusJson = JSON.stringify({
    command: "status",
    root: "/workspace",
    verdict: "pass",
    exitCode: 0,
    units: workspaceUnits.map((unit) => {
      const unitPath = unit.path || `/workspace/${unit.docId}/requirements.rqml`;
      return {
        path: unitPath,
        code: 0,
        result: { docId: unit.docId, status: unit.status || "draft", path: unitPath },
      };
    }),
    ambiguous: workspaceAmbiguous,
  });
  const workspaceCheckExit = Number(options.workspaceCheckExit || 0);
  const workspaceCheckMessage = options.workspaceCheckMessage || "workspace check failed";
  const script = `#!/bin/sh
if [ -n "${escapeShell(logPath)}" ]; then
  printf '%s\\n' "$*" >> "${escapeShell(logPath)}"
fi
case "$1" in
  status)
    case "$*" in
      *--workspace*)
        printf '%s\\n' '${workspaceStatusJson.replace(/'/g, "'\\''")}'
        exit 0
        ;;
      *)
        printf '%s\\n' '${statusJson.replace(/'/g, "'\\''")}'
        exit 0
        ;;
    esac
    ;;
  validate)
    if [ ${validateExit} -ne 0 ]; then
      printf '%s\\n' '${validateMessage.replace(/'/g, "'\\''")}' >&2
      exit ${validateExit}
    fi
    printf 'valid\\n'
    exit 0
    ;;
  check)
    case "$*" in
      *--workspace*)
        if [ ${workspaceCheckExit} -ne 0 ]; then
          printf '%s\\n' '${workspaceCheckMessage.replace(/'/g, "'\\''")}' >&2
          exit ${workspaceCheckExit}
        fi
        printf '✓ workspace check: 0 spec(s)\\n'
        exit 0
        ;;
      *--json*)
        if [ ${checkExit} -ne 0 ]; then
          printf '{"verdict":"fail","strictness":"standard","diagnostics":["%s"]}\\n' '${checkMessage.replace(/'/g, "'\\''")}'
          exit ${checkExit}
        fi
        printf '{"verdict":"pass","strictness":"standard","diagnostics":[]}\\n'
        exit 0
        ;;
      *)
        if [ ${checkExit} -ne 0 ]; then
          printf '%s\\n' '${checkMessage.replace(/'/g, "'\\''")}' >&2
          exit ${checkExit}
        fi
        printf 'check pass\\n'
        exit 0
        ;;
    esac
    ;;
  gate)
    if [ ${gateExit} -ne 0 ]; then
      printf '%s\\n' '${gateMessage.replace(/'/g, "'\\''")}'
      exit ${gateExit}
    fi
    printf 'no findings\\n'
    exit 0
    ;;
  init)
    printf 'initialized\\n'
    exit 0
    ;;
esac
printf 'usage\\n' >&2
exit 64
`;
  const rqmlPath = path.join(binDir, "rqml");
  await fs.writeFile(rqmlPath, script, { mode: 0o755 });
}

function escapeShell(value) {
  return String(value).replace(/(["\\$`])/g, "\\$1");
}

function parseFrontmatter(contents) {
  const match = contents.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, "expected YAML frontmatter");
  const parsed = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!field) {
      continue;
    }
    parsed[field[1]] = field[2].replace(/^"|"$/g, "");
  }
  return parsed;
}
