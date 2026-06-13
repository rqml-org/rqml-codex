import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

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
    "rqml-authoring": [/rqml skeleton req/, /rqml validate/, /No behavior is added/],
    "rqml-design": [/\.rqml\/adr\//, /Classify/, /immutable once accepted/],
    "rqml-plan": [/\.rqml\/plan\.md/, /READY/, /rqml link/],
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
  const validateMessage = options.validateMessage || "validation failed";
  const checkMessage = options.checkMessage || "check failed";
  const logPath = options.logPath || "";
  const script = `#!/bin/sh
if [ -n "${escapeShell(logPath)}" ]; then
  printf '%s\\n' "$*" >> "${escapeShell(logPath)}"
fi
case "$1" in
  status)
    printf '%s\\n' '${statusJson.replace(/'/g, "'\\''")}'
    exit 0
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
