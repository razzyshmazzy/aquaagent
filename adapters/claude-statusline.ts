#!/usr/bin/env tsx
// Claude Code statusline adapter — blue water, yellow electricity.
//
// Configure in settings.json (~/.claude/settings.json or project .claude/):
//   {
//     "statusLine": {
//       "type": "command",
//       "command": "npx tsx /ABSOLUTE/PATH/TO/adapters/claude-statusline.ts"
//     }
//   }
//
// Claude Code runs the command once per update (after each assistant message,
// /compact, etc.; debounced 300ms), piping one JSON blob on stdin and rendering
// the script's stdout. We read the WHOLE blob, convert the latest response's
// output tokens to water/energy, and print one line.
//
// Schema ref: https://code.claude.com/docs/en/statusline — token counts live
// under `context_window.*`, NOT at the top level.

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { tokensToKwh, WATER_L_PER_KWH } from "../lib/sustainability";

const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const DASHBOARD_URL = "http://localhost:3000/dashboard";
// OSC 8 hyperlink — works in iTerm2, Kitty, WezTerm. Falls back to plain text.
function osc8(text: string, url: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

type StatusInput = {
  session_id?: string;
  model?: { id?: string; display_name?: string };
  workspace?: {
    current_dir?: string;
    repo?: { owner?: string; name?: string };
  };
  context_window?: {
    total_output_tokens?: number;
    total_input_tokens?: number;
    current_usage?: { output_tokens?: number };
  };
  // legacy / fallback field names
  output_tokens?: number;
  [k: string]: unknown;
};

function formatSmall(n: number, unit: string): string {
  if (n <= 0) return `0${unit}`;
  if (n < 0.001) return `${(n * 1e6).toFixed(1)}µ${unit}`;
  if (n < 1) return `${(n * 1000).toFixed(2)}m${unit}`;
  return `${n.toFixed(3)}${unit}`;
}

// Output tokens of the most recent API response (per-turn on Claude Code
// >= 2.1.132; close enough for a live readout otherwise).
function latestOutputTokens(p: StatusInput): number {
  return (
    p.context_window?.total_output_tokens ??
    p.context_window?.current_usage?.output_tokens ??
    p.output_tokens ??
    0
  );
}

function render(input: StatusInput): string {
  const tokens = latestOutputTokens(input);
  const kwh = tokensToKwh(tokens);
  const waterL = kwh * WATER_L_PER_KWH;

  const waterStr = `${BLUE}💧${formatSmall(waterL, "L")}${RESET}`;
  const energyStr = `${YELLOW}⚡${formatSmall(kwh * 1000, "Wh")}${RESET}`; // kWh -> Wh
  const link = osc8(`${DIM}[carbo]${RESET}`, DASHBOARD_URL);
  return `${waterStr} ${energyStr} ${link}`;
}

function repoId(input: StatusInput): string {
  const r = input.workspace?.repo;
  if (r?.owner && r?.name) return `${r.owner}/${r.name}`;
  const dir = input.workspace?.current_dir;
  if (dir) return dir.split("/").filter(Boolean).pop() || "local";
  return "local";
}

// Fire-and-forget: report this turn's usage to the gateway deployment, stored
// under the dev's GitHub login. Deduped per session by token count so the many
// statusline ticks per turn (compact, permission changes, …) report only once.
// Enabled by env on the statusLine command: CARBO_INGEST_URL + CARBO_AUTHOR
// (+ optional CARBO_INGEST_SECRET). Disabled (display-only) when unset.
function maybeReport(input: StatusInput): void {
  const url = process.env.CARBO_INGEST_URL;
  const author = process.env.CARBO_AUTHOR;
  if (!url || !author) return;

  const tokens = latestOutputTokens(input);
  if (tokens <= 0) return;

  const sid = (input.session_id ?? "default").replace(/[^a-zA-Z0-9_-]/g, "");
  const statePath = join(tmpdir(), `carbo-report-${sid}.json`);
  try {
    const prev = JSON.parse(readFileSync(statePath, "utf8")) as { tokens?: number };
    if (prev?.tokens === tokens) return; // same turn — already reported
  } catch {
    // no prior state — fall through and report
  }
  try {
    writeFileSync(statePath, JSON.stringify({ tokens }));
  } catch {
    // can't persist dedup state — still report once
  }

  const payload = JSON.stringify({
    author,
    repo: repoId(input),
    tokens,
    model: input.model?.id ?? null,
  });
  const args = ["-s", "-m", "3", "-X", "POST", "-H", "content-type: application/json"];
  const secret = process.env.CARBO_INGEST_SECRET;
  if (secret) args.push("-H", `x-carbo-ingest-secret: ${secret}`);
  args.push("-d", payload, `${url.replace(/\/+$/, "")}/api/usage`);

  try {
    spawn("curl", args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // curl unavailable — skip reporting, never break the status bar
  }
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let input: StatusInput = {};
  if (raw) {
    try {
      input = JSON.parse(raw) as StatusInput;
    } catch {
      // Malformed input — render the zero line rather than crashing the bar.
    }
  }

  process.stdout.write(render(input) + "\n"); // display first (instant)
  maybeReport(input); // then report (deduped, detached, non-blocking)
}

main();
