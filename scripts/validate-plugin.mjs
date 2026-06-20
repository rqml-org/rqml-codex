#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = path.resolve(process.argv[2] || DEFAULT_ROOT);
const errors = [];

function main() {
  const manifest = readJson(".codex-plugin/plugin.json");
  const mcp = readJson(".mcp.json");
  const hooks = readJson("hooks/hooks.json");
  const marketplace = readJson(".agents/plugins/marketplace.json");

  if (manifest) validateManifest(manifest);
  if (mcp) validateMcp(mcp);
  if (hooks) validateHooks(hooks, manifest);
  if (marketplace && manifest) validateMarketplace(marketplace, manifest);
  validateSkills(manifest);
  validateDocs(manifest);
  validateNoPlaceholders();

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`✗ ${error}`);
    }
    process.exit(1);
  }

  console.log(`✓ plugin validation passed — ${pluginRoot}`);
}

function validateManifest(manifest) {
  requireString(manifest, "name", ".codex-plugin/plugin.json");
  if (typeof manifest.name === "string" && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.name)) {
    fail("manifest name must be kebab-case and 64 characters or fewer");
  }
  requireString(manifest, "version", ".codex-plugin/plugin.json");
  if (typeof manifest.version === "string" && !isSemver(manifest.version)) {
    fail(`manifest version is not strict semver: ${manifest.version}`);
  }
  requireString(manifest, "description", ".codex-plugin/plugin.json");
  requireObject(manifest.author, "author", ".codex-plugin/plugin.json");
  if (manifest.author && typeof manifest.author === "object") {
    requireString(manifest.author, "name", ".codex-plugin/plugin.json author");
  }

  for (const field of ["homepage", "repository"]) {
    if (field in manifest) requireHttpsUrl(manifest[field], `manifest ${field}`);
  }
  if (typeof manifest.license !== "string" || manifest.license.length === 0) {
    fail("manifest license must be a non-empty string");
  }
  if (!Array.isArray(manifest.keywords) || manifest.keywords.some((item) => typeof item !== "string" || item.length === 0)) {
    fail("manifest keywords must be a non-empty string array");
  }

  validateManifestPath(manifest.skills, "skills");
  validateManifestPath(manifest.mcpServers, "mcpServers");
  if ("hooks" in manifest) validateManifestPath(manifest.hooks, "hooks");
  if ("apps" in manifest) validateManifestPath(manifest.apps, "apps");

  const iface = manifest.interface;
  requireObject(iface, "interface", ".codex-plugin/plugin.json");
  if (iface && typeof iface === "object") {
    for (const field of ["displayName", "shortDescription", "longDescription", "developerName", "category"]) {
      requireString(iface, field, "manifest interface");
    }
    if (!Array.isArray(iface.capabilities) || iface.capabilities.some((item) => typeof item !== "string" || item.length === 0)) {
      fail("manifest interface.capabilities must be a non-empty string array");
    }
    for (const field of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      requireHttpsUrl(iface[field], `manifest interface.${field}`);
    }
    if (Array.isArray(iface.defaultPrompt)) {
      if (iface.defaultPrompt.length > 3) fail("manifest interface.defaultPrompt must contain at most 3 entries");
      for (const prompt of iface.defaultPrompt) {
        if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > 128) {
          fail("manifest interface.defaultPrompt entries must be 1-128 character strings");
        }
      }
    }
    if (iface.brandColor && !/^#[0-9A-Fa-f]{6}$/.test(iface.brandColor)) {
      fail("manifest interface.brandColor must be a #RRGGBB hex color");
    }
    for (const field of ["composerIcon", "logo"]) {
      if (field in iface) validateManifestPath(iface[field], `interface.${field}`);
    }
    if (Array.isArray(iface.screenshots)) {
      for (const shot of iface.screenshots) validateManifestPath(shot, "interface.screenshots[]");
    }
  }

  if (!("hooks" in manifest) && !exists("hooks/hooks.json")) {
    fail("manifest omits hooks, so default hooks/hooks.json must exist");
  }
}

function validateMcp(mcp) {
  const servers = mcp.mcpServers || mcp.mcp_servers || mcp;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    fail(".mcp.json must contain an MCP server map");
    return;
  }
  if (!servers.rqml || typeof servers.rqml !== "object") {
    fail(".mcp.json must define the rqml MCP server");
    return;
  }
  if (servers.rqml.command !== "npx") {
    fail('.mcp.json rqml server command must be "npx"');
  }
  if (!Array.isArray(servers.rqml.args) || servers.rqml.args.join(" ") !== "-y @rqml/mcp") {
    fail('.mcp.json rqml server args must be ["-y", "@rqml/mcp"]');
  }
}

function validateHooks(config, manifest) {
  if (!config || typeof config !== "object" || !config.hooks || typeof config.hooks !== "object") {
    fail("hooks/hooks.json must contain a hooks object");
    return;
  }
  if (manifest && "hooks" in manifest) {
    fail("this plugin should rely on default hooks/hooks.json discovery, not a manifest hooks field");
  }
  for (const event of ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]) {
    if (!Array.isArray(config.hooks[event]) || config.hooks[event].length === 0) {
      fail(`hooks/hooks.json must define ${event}`);
      continue;
    }
    for (const [groupIndex, group] of config.hooks[event].entries()) {
      if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) {
        fail(`${event}[${groupIndex}] must contain a hooks array`);
        continue;
      }
      for (const [hookIndex, hook] of group.hooks.entries()) {
        const label = `${event}[${groupIndex}].hooks[${hookIndex}]`;
        if (!hook || typeof hook !== "object") {
          fail(`${label} must be an object`);
          continue;
        }
        if (hook.type !== "command") fail(`${label}.type must be "command"`);
        requireString(hook, "command", label);
        if (typeof hook.command === "string") {
          if (!hook.command.includes("${PLUGIN_ROOT}")) {
            fail(`${label}.command must reference \${PLUGIN_ROOT}`);
          }
          const relativeScript = hook.command.match(/\$\{PLUGIN_ROOT\}\/([^ ]+)/);
          if (relativeScript && !exists(relativeScript[1])) {
            fail(`${label}.command references missing plugin file ${relativeScript[1]}`);
          }
        }
        if ("statusMessage" in hook && typeof hook.statusMessage !== "string") {
          fail(`${label}.statusMessage must be a string when present`);
        }
      }
      if ((event === "PreToolUse" || event === "PostToolUse") && typeof group.matcher !== "string") {
        fail(`${event}[${groupIndex}].matcher must be a string`);
      }
    }
  }
}

function validateMarketplace(marketplace, manifest) {
  requireString(marketplace, "name", ".agents/plugins/marketplace.json");
  if (marketplace.interface) {
    requireString(marketplace.interface, "displayName", "marketplace interface");
  }
  if (!Array.isArray(marketplace.plugins)) {
    fail("marketplace plugins must be an array");
    return;
  }
  const entry = marketplace.plugins.find((plugin) => plugin && plugin.name === manifest.name);
  if (!entry) {
    fail(`marketplace must contain plugin entry ${manifest.name}`);
    return;
  }
  if (!entry.source || typeof entry.source !== "object") {
    fail("marketplace plugin source must be an object");
  } else {
    if (entry.source.source !== "local") fail('marketplace plugin source.source must be "local"');
    if (typeof entry.source.path !== "string" || !entry.source.path.startsWith("./")) {
      fail('marketplace plugin source.path must start with "./"');
    }
  }
  if (!entry.policy || typeof entry.policy !== "object") {
    fail("marketplace plugin policy is required");
  } else {
    if (!["NOT_AVAILABLE", "AVAILABLE", "INSTALLED_BY_DEFAULT"].includes(entry.policy.installation)) {
      fail("marketplace policy.installation has an unsupported value");
    }
    if (!["ON_INSTALL", "ON_USE"].includes(entry.policy.authentication)) {
      fail("marketplace policy.authentication has an unsupported value");
    }
  }
  requireString(entry, "category", "marketplace plugin entry");
}

function validateSkills(manifest) {
  const skillsPath = manifest && manifest.skills ? manifest.skills : "./skills/";
  const skillsRoot = resolvePluginPath(skillsPath);
  if (!skillsRoot || !fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
    fail(`skills path does not exist or is not a directory: ${skillsPath}`);
    return;
  }
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(skillsRoot, entry.name);
    const skillPath = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      fail(`skill ${entry.name} is missing SKILL.md`);
      continue;
    }
    const contents = fs.readFileSync(skillPath, "utf8");
    const frontmatter = parseFrontmatter(contents);
    if (!frontmatter) {
      fail(`skill ${entry.name} is missing frontmatter`);
      continue;
    }
    if (frontmatter.name !== entry.name) {
      fail(`skill ${entry.name} frontmatter name must match directory`);
    }
    if (typeof frontmatter.description !== "string" || frontmatter.description.length < 20 || frontmatter.description.length > 160) {
      fail(`skill ${entry.name} description must be 20-160 characters`);
    }
  }
}

function validateDocs(manifest) {
  const requiredDocs = [
    "README.md",
    "docs/quickstart.md",
    "docs/why-rqml-codex.md",
    "docs/troubleshooting.md",
  ];
  for (const relative of requiredDocs) {
    if (!exists(relative)) {
      fail(`missing required documentation: ${relative}`);
      continue;
    }
    const contents = fs.readFileSync(path.join(pluginRoot, relative), "utf8");
    validateMarkdownLinks(relative, contents);
  }

  if (exists("README.md")) {
    const readme = fs.readFileSync(path.join(pluginRoot, "README.md"), "utf8");
    for (const fragment of [
      '<img src="https://rqml.org/img/RQML_logo_transparent.png" alt="RQML logo" width="280">',
      '<h1 align="center">Make Codex code from the spec, not from a fading chat thread.</h1>',
      '<a href="docs/quickstart.md">Quickstart</a>',
      '<a href="docs/why-rqml-codex.md">Why rqml-codex</a>',
      '<a href="docs/troubleshooting.md">Troubleshooting</a>',
      "https://img.shields.io/npm/v/@rqml/cli",
      "https://img.shields.io/badge/license-MIT-blue",
    ]) {
      if (!readme.includes(fragment)) fail(`README.md missing required header fragment: ${fragment}`);
    }
    for (const section of [
      "## What is RQML?",
      "## What this plugin does",
      "## First 10 minutes",
      "## Daily workflow",
      "## Trust and limits",
    ]) {
      if (!readme.includes(section)) fail(`README.md missing required section: ${section}`);
    }
    for (const doc of ["docs/quickstart.md", "docs/why-rqml-codex.md", "docs/troubleshooting.md"]) {
      if (!readme.includes(`](${doc})`)) fail(`README.md must link to ${doc}`);
    }
  }

  if (exists("requirements.rqml")) {
    const spec = fs.readFileSync(path.join(pluginRoot, "requirements.rqml"), "utf8");
    for (const id of ["REQ-DOCS-CONVERSION", "REQ-DOCS-ONBOARDING", "REQ-DOCS-SURFACES"]) {
      if (!spec.includes(`id="${id}"`)) fail(`requirements.rqml missing documentation requirement ${id}`);
    }
    for (const doc of ["README.md", "docs/quickstart.md", "docs/why-rqml-codex.md", "docs/troubleshooting.md"]) {
      if (!spec.includes(`uri="${doc}"`)) fail(`requirements.rqml missing trace link for ${doc}`);
    }
    if (!spec.includes('uri=".codex-plugin/plugin.json"') || !spec.includes("REQ-DOCS-SURFACES")) {
      fail("requirements.rqml must trace install-surface docs to .codex-plugin/plugin.json");
    }
  }

  if (manifest) validateInstallSurfaceCopy(manifest);
}

function validateInstallSurfaceCopy(manifest) {
  const iface = manifest && manifest.interface;
  if (!iface || typeof iface !== "object") return;
  const combined = [
    manifest.description,
    iface.shortDescription,
    iface.longDescription,
  ].filter((value) => typeof value === "string").join("\n");
  if (!/\brequirements?\b/i.test(combined) && !/\bspec\b/i.test(combined)) {
    fail("manifest install-surface copy must mention requirements or spec outcomes");
  }
  if (!/\brqml check\b/i.test(combined)) {
    fail("manifest install-surface copy must mention the rqml check gate");
  }

  const prompts = Array.isArray(iface.defaultPrompt) ? iface.defaultPrompt : [];
  for (const prompt of [
    "Adopt RQML in this repo.",
    "Draft requirements before coding this change.",
    "Check whether this implementation still matches the spec.",
  ]) {
    if (!prompts.includes(prompt)) fail(`manifest interface.defaultPrompt missing: ${prompt}`);
  }
}

function validateMarkdownLinks(relative, contents) {
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of contents.matchAll(linkPattern)) {
    const target = normalizeMarkdownTarget(match[1]);
    if (!target || isExternalTarget(target) || target.startsWith("#")) continue;
    const withoutFragment = target.split("#")[0];
    if (!withoutFragment) continue;
    const resolved = path.resolve(pluginRoot, path.dirname(relative), withoutFragment);
    if (resolved !== pluginRoot && !resolved.startsWith(`${pluginRoot}${path.sep}`)) {
      fail(`${relative} contains link escaping plugin root: ${target}`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      fail(`${relative} contains broken relative link: ${target}`);
    }
  }
}

function normalizeMarkdownTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    return trimmed.slice(1, trimmed.indexOf(">"));
  }
  const match = trimmed.match(/^([^\s]+)(?:\s+["'][^"']*["'])?$/);
  return match ? match[1] : trimmed;
}

function isExternalTarget(target) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target);
}

function validateNoPlaceholders() {
  for (const relative of [
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "hooks/hooks.json",
    ".agents/plugins/marketplace.json",
  ]) {
    if (!exists(relative)) continue;
    const contents = fs.readFileSync(path.join(pluginRoot, relative), "utf8");
    if (contents.includes("[TODO:")) fail(`${relative} contains a TODO placeholder`);
  }
}

function readJson(relative) {
  const file = path.join(pluginRoot, relative);
  if (!fs.existsSync(file)) {
    fail(`missing required file: ${relative}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${relative} is not valid JSON: ${error.message}`);
    return null;
  }
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return null;
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return null;
  const result = {};
  for (const line of markdown.slice(4, end).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    result[match[1]] = unquote(match[2].trim());
  }
  return result;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function validateManifestPath(value, label) {
  if (typeof value !== "string") {
    fail(`manifest ${label} must be a string path`);
    return;
  }
  const resolved = resolvePluginPath(value);
  if (!value.startsWith("./")) {
    fail(`manifest ${label} path must start with ./`);
  }
  if (!resolved) return;
  if (!fs.existsSync(resolved)) {
    fail(`manifest ${label} path does not exist: ${value}`);
  }
}

function resolvePluginPath(value) {
  if (typeof value !== "string") return null;
  const resolved = path.resolve(pluginRoot, value);
  if (resolved !== pluginRoot && !resolved.startsWith(`${pluginRoot}${path.sep}`)) {
    fail(`path escapes plugin root: ${value}`);
    return null;
  }
  return resolved;
}

function requireString(object, field, context) {
  if (!object || typeof object[field] !== "string" || object[field].length === 0) {
    fail(`${context} must define non-empty string ${field}`);
  }
}

function requireObject(value, field, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${context} must define object ${field}`);
  }
}

function requireHttpsUrl(value, label) {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    fail(`${label} must be an absolute https:// URL`);
  }
}

function isSemver(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}

function exists(relative) {
  return fs.existsSync(path.join(pluginRoot, relative));
}

function fail(message) {
  errors.push(message);
}

main();
