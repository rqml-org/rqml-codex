#!/usr/bin/env node
import { handleSkill } from "../lib/rqml-codex-core.mjs";

const command = process.argv[2] || "";
const result = handleSkill(command, process.env, process.cwd());

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
