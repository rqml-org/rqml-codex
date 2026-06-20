import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

test("installed layout smoke executes default plugin hook commands", async () => {
  const installedRoot = await copyInstalledPlugin();
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin);

  const manifest = await readJson(path.join(installedRoot, ".codex-plugin", "plugin.json"));
  assert.equal(manifest.hooks, undefined, "default hooks/hooks.json discovery should be sufficient");

  const hooks = await readJson(path.join(installedRoot, "hooks", "hooks.json"));
  const env = {
    ...process.env,
    PATH: `${fixture.bin}${path.delimiter}${process.env.PATH || ""}`,
    PLUGIN_ROOT: installedRoot,
    PLUGIN_DATA: fixture.pluginData,
    RQML_CODEX_SESSION_ID: "s-installed",
  };

  const beforeStatus = runInstalledScript(installedRoot, "status", fixture.cwd, env);
  assert.equal(beforeStatus.status, 0);
  assert.match(beforeStatus.stdout, /Enforcement: inactive/);
  assert.match(beforeStatus.stdout, /\/hooks/);

  const sessionStart = runHookCommand(hooks, "SessionStart", {
    cwd: fixture.cwd,
    session_id: "s-installed",
    hook_event_name: "SessionStart",
    source: "startup",
  }, fixture.cwd, env);
  assert.equal(sessionStart.status, 0, sessionStart.stderr);
  assert.match(JSON.parse(sessionStart.stdout).hookSpecificOutput.additionalContext, /Enforcement: active/);

  const preToolUse = runHookCommand(hooks, "PreToolUse", {
    cwd: fixture.cwd,
    session_id: "s-installed",
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** End Patch\n" },
  }, fixture.cwd, env);
  assert.equal(preToolUse.status, 0, preToolUse.stderr);
  assert.equal(preToolUse.stdout, "");

  const postToolUse = runHookCommand(hooks, "PostToolUse", {
    cwd: fixture.cwd,
    session_id: "s-installed",
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: requirements.rqml\n@@\n*** End Patch\n" },
  }, fixture.cwd, env);
  assert.equal(postToolUse.status, 0, postToolUse.stderr);
  assert.equal(postToolUse.stdout, "");

  const stop = runHookCommand(hooks, "Stop", {
    cwd: fixture.cwd,
    session_id: "s-installed",
    hook_event_name: "Stop",
    stop_hook_active: false,
  }, fixture.cwd, env);
  assert.equal(stop.status, 0, stop.stderr);
  assert.equal(stop.stdout, "");

  const state = await readJson(path.join(fixture.pluginData, "rqml-codex-state.json"));
  assert.equal(state.sessions["s-installed"].cwd, fixture.cwd);
  assert.equal(state.sessions["s-installed"].specPath, path.join(fixture.cwd, "requirements.rqml"));
  assert.equal(state.workspaces[fixture.cwd].eventName, "stop");

  const afterStatus = runInstalledScript(installedRoot, "status", fixture.cwd, env);
  assert.equal(afterStatus.status, 0);
  assert.match(afterStatus.stdout, /Enforcement: hook activity recorded/);
  assert.match(afterStatus.stdout, /Current-session enforcement is live/);
});

test("installed hook command fails without PLUGIN_ROOT", async () => {
  const installedRoot = await copyInstalledPlugin();
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin);
  const hooks = await readJson(path.join(installedRoot, "hooks", "hooks.json"));
  const command = firstHookCommand(hooks, "SessionStart");

  const result = spawnSync(command, {
    cwd: fixture.cwd,
    input: JSON.stringify({
      cwd: fixture.cwd,
      session_id: "s-no-root",
      hook_event_name: "SessionStart",
      source: "startup",
    }),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}${path.delimiter}${process.env.PATH || ""}`,
      PLUGIN_DATA: fixture.pluginData,
    },
    shell: true,
  });

  assert.notEqual(result.status, 0);
});

test("installed status reports unconfirmed enforcement without PLUGIN_DATA", async () => {
  const installedRoot = await copyInstalledPlugin();
  const fixture = await makeFixture({ withSpec: true });
  await installFakeRqml(fixture.bin);

  const result = runInstalledScript(installedRoot, "status", fixture.cwd, {
    ...process.env,
    PATH: `${fixture.bin}${path.delimiter}${process.env.PATH || ""}`,
    PLUGIN_ROOT: installedRoot,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /inactive or unconfirmed/);
  assert.match(result.stdout, /PLUGIN_DATA/);
});

test("plugin validator accepts the installed layout", async () => {
  const installedRoot = await copyInstalledPlugin();
  const result = runValidator(installedRoot);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /plugin validation passed/);
});

test("plugin validator fails on a missing skill manifest", async () => {
  const installedRoot = await copyInstalledPlugin();
  await fs.rm(path.join(installedRoot, "skills", "rqml-status", "SKILL.md"));
  const result = runValidator(installedRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing SKILL\.md/);
});

test("plugin validator fails on invalid MCP config", async () => {
  const installedRoot = await copyInstalledPlugin();
  await fs.writeFile(path.join(installedRoot, ".mcp.json"), JSON.stringify({
    mcpServers: { rqml: { command: "rqml-mcp", args: [] } },
  }, null, 2));
  const result = runValidator(installedRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /rqml server command/);
});

test("plugin validator fails on an invalid hook command path", async () => {
  const installedRoot = await copyInstalledPlugin();
  const hooksPath = path.join(installedRoot, "hooks", "hooks.json");
  const hooks = await readJson(hooksPath);
  hooks.hooks.SessionStart[0].hooks[0].command = "node ${PLUGIN_ROOT}/hooks/missing.mjs session-start";
  await fs.writeFile(hooksPath, `${JSON.stringify(hooks, null, 2)}\n`);

  const result = runValidator(installedRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /references missing plugin file/);
});

test("CI workflow runs plugin validation and RQML parity gates", async () => {
  const workflow = await fs.readFile(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\n\s+- main/);
  assert.match(workflow, /node-version:\s*"20"/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /node scripts\/validate-plugin\.mjs/);
  assert.match(workflow, /npx -y @rqml\/cli check\b/);
  assert.match(workflow, /npx -y @rqml\/cli check --strictness strict/);
});

function runHookCommand(hooks, eventName, input, cwd, env) {
  const command = firstHookCommand(hooks, eventName).replaceAll("${PLUGIN_ROOT}", env.PLUGIN_ROOT);
  return spawnSync(command, {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    env,
    shell: true,
  });
}

function firstHookCommand(hooks, eventName) {
  const group = hooks.hooks[eventName] && hooks.hooks[eventName][0];
  assert.ok(group, `missing hook group ${eventName}`);
  const hook = group.hooks && group.hooks[0];
  assert.ok(hook, `missing command hook ${eventName}`);
  assert.equal(hook.type, "command");
  return hook.command;
}

function runInstalledScript(installedRoot, command, cwd, env) {
  return spawnSync(process.execPath, [path.join(installedRoot, "scripts", "rqml-codex.mjs"), command], {
    cwd,
    encoding: "utf8",
    env,
  });
}

function runValidator(installedRoot) {
  return spawnSync(process.execPath, [path.join(installedRoot, "scripts", "validate-plugin.mjs"), installedRoot], {
    cwd: installedRoot,
    encoding: "utf8",
    env: process.env,
  });
}

async function makeFixture(options = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "rqml-codex-installed-"));
  const bin = path.join(cwd, "bin");
  const pluginData = path.join(cwd, "plugin-data");
  await fs.mkdir(bin);
  await fs.mkdir(pluginData);
  if (options.withSpec) {
    await fs.writeFile(path.join(cwd, "requirements.rqml"), "<rqml/>\n", "utf8");
  }
  return { cwd, bin, pluginData };
}

async function installFakeRqml(binDir) {
  const script = `#!/bin/sh
case "$1" in
  status)
    printf '%s\\n' '{"path":"requirements.rqml","docId":"DOC-INSTALLED","version":"2.1.0","status":"draft","requirements":1,"edges":0,"uncoveredGoals":[],"unverifiedRequirements":[],"unimplementedRequirements":[],"prematureImplementations":[],"danglingReferences":0,"lintFindings":0}'
    exit 0
    ;;
  validate)
    printf 'valid\\n'
    exit 0
    ;;
  check)
    case "$*" in
      *--json*)
        printf '{"verdict":"pass","strictness":"standard","diagnostics":[]}\\n'
        exit 0
        ;;
      *)
        printf 'check pass\\n'
        exit 0
        ;;
    esac
    ;;
  gate)
    exit 0
    ;;
esac
printf 'unexpected rqml command: %s\\n' "$*" >&2
exit 64
`;
  const file = path.join(binDir, "rqml");
  await fs.writeFile(file, script, { mode: 0o755 });
  await fs.chmod(file, 0o755);
}

async function copyInstalledPlugin() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rqml-codex-plugin-"));
  await copyTree(repoRoot, root);
  return root;
}

async function copyTree(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyTree(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
