import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const KNOWN_STRICTNESS = new Set(["relaxed", "standard", "strict", "certified"]);
const RQML_INSTALL_COMMAND = "npm install -g @rqml/cli";
const RQML_TIMEOUT_MS = 15000;

export async function readStdin(stream) {
  let payload = "";
  for await (const chunk of stream) {
    payload += chunk;
  }
  return payload;
}

export function handleHook(eventName, input = {}, env = process.env) {
  const normalized = normalizeEventName(eventName || input.hook_event_name);
  const cwd = path.resolve(String(input.cwd || process.cwd()));
  const specPath = findProjectSpec(cwd);

  if (specPath === null) {
    return ok();
  }

  const strictness = readStrictness(cwd);
  recordHookEvent(env, input, normalized, cwd, specPath, strictness);

  if (normalized === "session-start") {
    return handleSessionStart(input, env, cwd, specPath, strictness);
  }
  if (normalized === "post-tool-use") {
    return handlePostToolUse(input, env, cwd, strictness);
  }
  if (normalized === "pre-tool-use") {
    return handlePreToolUse(input, env, cwd);
  }
  if (normalized === "stop") {
    return handleStop(input, env, cwd, specPath, strictness);
  }
  return ok();
}

export function handleSkill(command, env = process.env, cwd = process.cwd()) {
  const specPath = findProjectSpec(cwd);
  const strictness = readStrictness(cwd);

  if (command === "status") {
    if (specPath === null) {
      return {
        exitCode: 0,
        stdout: "RQML status: dormant. No .rqml spec document was found in this project root.\n",
        stderr: "",
      };
    }
    const status = runRqml(["status", specArg(cwd, specPath), "--strictness", strictness, "--json"], cwd, env);
    if (isCliUnavailable(status)) {
      return {
        exitCode: 0,
        stdout: `${toolchainWarning()}\n`,
        stderr: "",
      };
    }
    const statusText = status.exitCode === 0
      ? `${formatStatusSummary(parseJson(status.stdout), strictness)}\n`
      : formatCommandResult(status.command, status);
    const enforcement = formatEnforcementState(readHookState(env, cwd), env);
    return {
      exitCode: 0,
      stdout: `${statusText}\n${enforcement}\n`,
      stderr: "",
    };
  }

  if (command === "check") {
    if (specPath === null) {
      return {
        exitCode: 0,
        stdout: "RQML check: dormant. No .rqml spec document was found in this project root.\n",
        stderr: "",
      };
    }
    const result = runRqml(["check", specArg(cwd, specPath), "--strictness", strictness], cwd, env);
    if (isCliUnavailable(result)) {
      return {
        exitCode: 0,
        stdout: `${toolchainWarning()}\n`,
        stderr: "",
      };
    }
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  if (command === "init") {
    const result = runRqml(["init", cwd], cwd, env);
    if (isCliUnavailable(result)) {
      return {
        exitCode: 0,
        stdout: `${toolchainWarning()}\n`,
        stderr: "",
      };
    }
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  return {
    exitCode: 64,
    stdout: "",
    stderr: "Usage: rqml-codex <status|check|init>\n",
  };
}

function handleSessionStart(input, env, cwd, specPath, strictness) {
  const args = ["status", specArg(cwd, specPath), "--strictness", strictness, "--json"];
  const status = runRqml(args, cwd, env);
  if (isCliUnavailable(status)) {
    return warnOnce(env, input, cwd, toolchainWarning());
  }

  const report = parseJson(status.stdout);
  const summary = report === null
    ? formatCommandResult(status.command, status)
    : formatStatusSummary(report, strictness);
  const additionalContext = [
    summary,
    "Follow the five-stage RQML process (rqml.org/docs/development-process): Spec (specify before coding) · Design (record significant decisions as ADRs in .rqml/adr/ — the rqml-design skill) · Plan (.rqml/plan.md — the rqml-plan skill) · Code (read with `rqml show <REQ-ID>` or `rqml_show`, assess blast radius with `rqml impact <REQ-ID>` or `rqml_impact`, implement only specified behavior, then record traces with `rqml link` or `rqml_link`) · Verify (finish only when `rqml check` passes).",
    "Use path inputs for RQML MCP tools. Do not inline whole RQML documents or hand-edit trace XML.",
    "Enforcement: active for this session because the RQML SessionStart hook fired.",
  ].join("\n\n");

  return jsonOutput({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  });
}

function handlePostToolUse(input, env, cwd, strictness) {
  const touchedFiles = touchedRqmlFiles(input, cwd);
  if (touchedFiles.length === 0) {
    return ok();
  }

  for (const filePath of touchedFiles) {
    const args = ["validate", specArg(cwd, filePath), "--strictness", strictness];
    const validation = runRqml(args, cwd, env);
    if (isCliUnavailable(validation)) {
      return warnOnce(env, input, cwd, toolchainWarning());
    }
    if (validation.exitCode !== 0) {
      return jsonOutput({
        decision: "block",
        reason: formatCommandResult(validation.command, validation),
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: "The edited RQML document did not validate. Repair the spec before continuing.",
        },
      });
    }
  }

  return ok();
}

function handlePreToolUse(input, env, cwd) {
  // REQ-HOOK-PREIMPL: before a code edit, deny it when the file implements a
  // requirement that is not approved (consulting `rqml gate`, the toolchain's
  // deterministic verdict — no model in the path). Where Codex emits no pre-edit
  // event this branch simply never runs, and the Stop gate + rqml-review skill
  // remain the enforcement (graceful degradation). Fails open.
  const files = touchedCodeFiles(input, cwd);
  if (files.length === 0) {
    return ok();
  }
  for (const filePath of files) {
    const gate = runRqml(["gate", specArg(cwd, filePath)], cwd, env);
    if (isCliUnavailable(gate)) {
      return warnOnce(env, input, cwd, toolchainWarning());
    }
    if (gate.exitCode === 2) {
      const reason = [
        "Approval-before-implementation gate: this edit implements a requirement that is not yet approved.",
        formatCommandResult(gate.command, gate),
        "Get the requirement approved first (review it with the rqml-review skill, then `rqml approve <REQ-ID>`), or repoint the trace edge. Net-new, not-yet-linked code is governed by the Stop gate.",
      ].join("\n\n");
      return jsonOutput({
        decision: "block",
        reason,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: "Edit blocked: it implements a non-approved requirement.",
        },
      });
    }
  }
  return ok();
}

function handleStop(input, env, cwd, specPath, strictness) {
  const jsonArgs = ["check", specArg(cwd, specPath), "--strictness", strictness, "--json"];
  const checkJson = runRqml(jsonArgs, cwd, env);
  if (isCliUnavailable(checkJson)) {
    return warnOnce(env, input, cwd, toolchainWarning());
  }

  if (checkJson.exitCode === 0) {
    return ok();
  }

  if (checkJson.exitCode === 64) {
    return warnOnce(env, input, cwd, toolchainWarning());
  }

  const humanArgs = ["check", specArg(cwd, specPath), "--strictness", strictness];
  const checkHuman = runRqml(humanArgs, cwd, env);
  const diagnostics = formatCommandResult(checkHuman.command, checkHuman);

  if (input.stop_hook_active === true) {
    return jsonOutput({
      systemMessage: [
        "RQML check is still failing after a previous stop-gate continuation.",
        "Failing open to avoid an infinite stop-hook loop.",
        diagnostics,
      ].join("\n\n"),
    });
  }

  return jsonOutput({
    decision: "block",
    reason: [
      "RQML check failed. Resolve the findings before ending the turn.",
      diagnostics,
    ].join("\n\n"),
  });
}

export function findProjectSpec(cwd) {
  const conventional = path.join(cwd, "requirements.rqml");
  try {
    if (fs.existsSync(conventional)) {
      return conventional;
    }
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const rqml = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".rqml"))
      .map((entry) => entry.name)
      .sort()[0];
    return rqml ? path.join(cwd, rqml) : null;
  } catch {
    return null;
  }
}

export function readStrictness(cwd) {
  let cursor = path.resolve(cwd);
  while (true) {
    const agentsPath = path.join(cursor, "AGENTS.md");
    try {
      const contents = fs.readFileSync(agentsPath, "utf8");
      const match = contents.match(/Strictness:\s*`?([A-Za-z]+)`?/i);
      if (match && KNOWN_STRICTNESS.has(match[1].toLowerCase())) {
        return match[1].toLowerCase();
      }
    } catch {
      // Keep walking upward until there are no more parent directories.
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return "standard";
    }
    cursor = parent;
  }
}

function touchedRqmlFiles(input, cwd) {
  const candidates = new Set();
  const toolInput = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  for (const key of ["file_path", "path", "target_file"]) {
    if (typeof toolInput[key] === "string" && toolInput[key].endsWith(".rqml")) {
      candidates.add(resolveInsideCwd(cwd, toolInput[key]));
    }
  }

  if (typeof toolInput.command === "string") {
    for (const line of toolInput.command.split(/\r?\n/)) {
      const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+\.rqml)\s*$/);
      if (match) {
        candidates.add(resolveInsideCwd(cwd, match[1]));
      }
    }
  }

  return Array.from(candidates);
}

function touchedCodeFiles(input, cwd) {
  const candidates = new Set();
  const toolInput = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  for (const key of ["file_path", "path", "target_file"]) {
    const value = toolInput[key];
    if (typeof value === "string" && !value.endsWith(".rqml")) {
      candidates.add(resolveInsideCwd(cwd, value));
    }
  }
  if (typeof toolInput.command === "string") {
    for (const line of toolInput.command.split(/\r?\n/)) {
      const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
      if (match && !match[1].trim().endsWith(".rqml")) {
        candidates.add(resolveInsideCwd(cwd, match[1]));
      }
    }
  }
  return Array.from(candidates);
}

function resolveInsideCwd(cwd, rawPath) {
  return path.resolve(cwd, rawPath.trim());
}

function runRqml(args, cwd, env) {
  const command = formatCommand(["rqml", ...args]);
  const result = spawnSync("rqml", args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: RQML_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (result.error) {
    return {
      command,
      exitCode: result.error.code === "ENOENT" ? 64 : 1,
      stdout: result.stdout || "",
      stderr: result.stderr || result.error.message || "",
      errorCode: result.error.code,
    };
  }

  return {
    command,
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    errorCode: null,
  };
}

function isCliUnavailable(result) {
  return result.errorCode === "ENOENT" || result.exitCode === 64;
}

function formatStatusSummary(report, strictness) {
  if (report === null) {
    return "RQML status: unavailable. The CLI did not return a JSON status report.";
  }
  return [
    `RQML status - ${report.docId || "unknown"} (${report.version || "unknown"}, ${report.status || "unknown"})`,
    `Spec: ${report.path || "unknown"}`,
    `Strictness: ${strictness}`,
    `Requirements: ${numberOrUnknown(report.requirements)}; trace edges: ${numberOrUnknown(report.edges)}`,
    `Uncovered goals: ${count(report.uncoveredGoals)}`,
    `Unverified requirements: ${count(report.unverifiedRequirements)}`,
    `Unimplemented requirements: ${count(report.unimplementedRequirements)}`,
    `Premature implementations: ${count(report.prematureImplementations)}`,
    `Dangling refs: ${numberOrUnknown(report.danglingReferences)}; lint findings: ${numberOrUnknown(report.lintFindings)}`,
  ].join("\n");
}

function formatCommandResult(command, result) {
  const diagnostics = [result.stdout, result.stderr].filter(Boolean).join("");
  return [
    `Command: ${command}`,
    `Exit code: ${result.exitCode}`,
    "Diagnostics:",
    diagnostics.trimEnd() || "(no diagnostics)",
  ].join("\n");
}

function toolchainWarning() {
  return [
    "RQML enforcement is inactive because the rqml CLI is unavailable or returned a usage error.",
    `Install the toolchain with: ${RQML_INSTALL_COMMAND}`,
    "Failing open: no action was blocked.",
  ].join("\n");
}

function warnOnce(env, input, cwd, message) {
  const key = sanitizeKey(String(input.session_id || cwd));
  const dir = warningDir(env);
  if (dir === null) {
    return jsonOutput({ systemMessage: message });
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, `${key}.warned`);
    if (fs.existsSync(marker)) {
      return ok();
    }
    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  } catch {
    return jsonOutput({ systemMessage: message });
  }
  return jsonOutput({ systemMessage: message });
}

function recordHookEvent(env, input, eventName, cwd, specPath, strictness) {
  const file = stateFile(env);
  if (file === null) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const state = readJsonFile(file) || { sessions: {}, workspaces: {} };
    const now = new Date().toISOString();
    const sessionId = String(input.session_id || "unknown");
    const payload = {
      sessionId,
      eventName,
      cwd,
      specPath,
      strictness,
      lastHookAt: now,
    };
    state.sessions[sessionId] = payload;
    state.workspaces[cwd] = payload;
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch {
    // Hook-state telemetry must never affect enforcement.
  }
}

function readHookState(env, cwd) {
  const file = stateFile(env);
  if (file === null) {
    return null;
  }
  const state = readJsonFile(file);
  if (!state || typeof state !== "object") {
    return null;
  }
  const sessionId = env.RQML_CODEX_SESSION_ID || env.CODEX_SESSION_ID;
  if (sessionId && state.sessions && state.sessions[sessionId]) {
    return state.sessions[sessionId];
  }
  return state.workspaces ? state.workspaces[path.resolve(cwd)] || null : null;
}

function formatEnforcementState(state, env) {
  if (!env.PLUGIN_DATA) {
    return "Enforcement: inactive or unconfirmed. This command cannot see PLUGIN_DATA, so it cannot prove current-session hooks are live. In Codex, use /hooks to trust plugin hooks and start a new session.";
  }
  if (state === null) {
    return "Enforcement: inactive. No RQML hook has recorded activity for this workspace/session. Use /hooks to trust the plugin hooks, then start a new session. If plugin hooks are unavailable on this Codex surface, use the documented global-hooks fallback.";
  }
  return `Enforcement: hook activity recorded (${state.eventName}) at ${state.lastHookAt}. Current-session enforcement is live only when this session also received the SessionStart RQML context.`;
}

function stateFile(env) {
  if (!env.PLUGIN_DATA) {
    return null;
  }
  return path.join(env.PLUGIN_DATA, "rqml-codex-state.json");
}

function warningDir(env) {
  if (env.PLUGIN_DATA) {
    return path.join(env.PLUGIN_DATA, "warnings");
  }
  return path.join(os.tmpdir(), "rqml-codex-plugin", "warnings");
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function parseJson(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function normalizeEventName(eventName) {
  return String(eventName || "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function specArg(cwd, specPath) {
  const relative = path.relative(cwd, specPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }
  return specPath;
}

function formatCommand(parts) {
  return parts.map(shellQuote).join(" ");
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) {
    return text;
  }
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function count(value) {
  return Array.isArray(value) ? value.length : numberOrUnknown(value);
}

function numberOrUnknown(value) {
  return typeof value === "number" ? String(value) : "unknown";
}

function sanitizeKey(key) {
  return key.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 160);
}

function jsonOutput(payload) {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(payload, null, 2)}\n`,
    stderr: "",
  };
}

function ok() {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
  };
}
