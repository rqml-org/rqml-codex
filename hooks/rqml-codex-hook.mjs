#!/usr/bin/env node
import { handleHook, readStdin } from "../lib/rqml-codex-core.mjs";

const eventName = process.argv[2] || "";

try {
  const rawInput = await readStdin(process.stdin);
  const input = rawInput.trim() ? JSON.parse(rawInput) : {};
  const result = handleHook(eventName, input, process.env);

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(
    `rqml-codex hook failed open: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 0;
}
