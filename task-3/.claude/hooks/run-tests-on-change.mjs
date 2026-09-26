#!/usr/bin/env node
// Dev-time Claude Code hook (distinct from the runtime src/hooks/hookRunner.ts
// guardrail hooks — see README's "Hooks" section for the two-mechanism split).
// PostToolUse: whenever Claude Code edits a file under src/, run only the
// Vitest tests related to that file, so regressions in agent/skill/guardrail
// logic are caught immediately during development, not at the next full run.
import { spawnSync } from "node:child_process";

function readStdin() {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  return new Promise((resolve) => {
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

const raw = await readStdin();
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path;
if (!filePath || !/\/src\/.*\.ts$/.test(filePath)) {
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["vitest", "related", "--run", "--passWithNoTests", filePath],
  { cwd: process.cwd(), encoding: "utf-8" },
);

process.stdout.write(result.stdout ?? "");
if (result.status !== 0) {
  process.stderr.write(
    `Tests related to ${filePath} failed after this edit:\n${result.stderr ?? ""}`,
  );
  process.exit(2);
}
process.exit(0);
