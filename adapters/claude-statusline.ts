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

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let line = `${BLUE}💧0L${RESET} ${YELLOW}⚡0Wh${RESET}`;
  if (raw) {
    try {
      line = render(JSON.parse(raw) as StatusInput);
    } catch {
      // Malformed input — keep the zero line rather than crashing the status bar.
    }
  }
  process.stdout.write(line + "\n");
}

main();
