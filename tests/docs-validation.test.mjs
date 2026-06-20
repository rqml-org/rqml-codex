import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

test("documentation validation accepts conversion docs and install-surface copy", async () => {
  const result = runValidator(repoRoot);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /RQML_logo_transparent\.png/);
  assert.match(readme, /<h1 align="center">Make Codex code from the spec, not from a fading chat thread\.<\/h1>/);
  assert.match(readme, /<a href="docs\/quickstart\.md">Quickstart<\/a>/);
  assert.match(readme, /<a href="docs\/why-rqml-codex\.md">Why rqml-codex<\/a>/);
  assert.match(readme, /<a href="docs\/troubleshooting\.md">Troubleshooting<\/a>/);
  assert.match(readme, /img\.shields\.io\/npm\/v\/@rqml\/cli/);
  assert.match(readme, /img\.shields\.io\/badge\/license-MIT-blue/);
  assert.match(readme, /## What is RQML\?/);
  assert.match(readme, /## First 10 minutes/);
  assert.match(readme, /\(docs\/quickstart\.md\)/);
  assert.match(readme, /\(docs\/why-rqml-codex\.md\)/);
  assert.match(readme, /\(docs\/troubleshooting\.md\)/);

  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, ".codex-plugin", "plugin.json"), "utf8"));
  assert.deepEqual(manifest.interface.defaultPrompt, [
    "Adopt RQML in this repo.",
    "Draft requirements before coding this change.",
    "Check whether this implementation still matches the spec.",
  ]);
});

test("plugin validator fails when README loses a required docs link", async () => {
  const copy = await copyRepo();
  const readmePath = path.join(copy, "README.md");
  const readme = await fs.readFile(readmePath, "utf8");
  await fs.writeFile(
    readmePath,
    readme
      .replaceAll("(docs/quickstart.md)", "(https://example.com/quickstart)")
      .replaceAll('href="docs/quickstart.md"', 'href="https://example.com/quickstart"'),
    "utf8",
  );

  const result = runValidator(copy);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README\.md must link to docs\/quickstart\.md/);
});

test("plugin validator fails on a broken relative documentation link", async () => {
  const copy = await copyRepo();
  const docPath = path.join(copy, "docs", "quickstart.md");
  await fs.appendFile(docPath, "\n[Broken local link](missing-local-doc.md)\n", "utf8");

  const result = runValidator(copy);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /broken relative link: missing-local-doc\.md/);
});

test("plugin validator fails on weak default prompts", async () => {
  const copy = await copyRepo();
  const manifestPath = path.join(copy, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.interface.defaultPrompt = [
    "Show RQML status for this repo.",
    "Run the RQML check gate.",
    "Draft requirements for this change.",
  ];
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = runValidator(copy);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /defaultPrompt missing: Adopt RQML in this repo\./);
});

function runValidator(root) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "validate-plugin.mjs"), root], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

async function copyRepo() {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), "rqml-codex-docs-"));
  await fs.cp(repoRoot, destination, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.endsWith(`${path.sep}.git`),
  });
  return destination;
}
