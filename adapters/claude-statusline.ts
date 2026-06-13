#!/usr/bin/env tsx
// Claude Code statusline adapter — blue water, yellow electricity.
//
// Configure in .claude/settings.json:
//   { "statusCommand": "npx tsx adapters/claude-statusline.ts" }
//
// Claude Code runs this as a persistent process and pipes one JSON line to stdin
// on every tick. Fields used (cumulative session totals):
//   input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
//
// For click-to-open-dashboard, wrap in an OSC 8 hyperlink (iTerm2/Kitty/WezTerm):
//   ESC]8;;http://localhost:3000/dashboard\atext\ESC]8;;\a

import * as readline from "readline";
import { tokensToKwh, WATER_L_PER_KWH } from "../lib/sustainability";

const BLUE   = "\x1b[34m";
const YELLOW = "\x1b[33m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";

const DASHBOARD_URL = "http://localhost:3000/dashboard";
// OSC 8 hyperlink — works in iTerm2, Kitty, WezTerm. Falls back to plain text elsewhere.
function osc8(text: string, url: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

type TickPayload = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cost_usd?: number;
  [k: string]: unknown;
};

let prevOutput = 0;

function formatSmall(n: number, unit: string): string {
  if (n < 0.001) return `${(n * 1e6).toFixed(1)}µ${unit}`;
  if (n < 1)     return `${(n * 1000).toFixed(2)}m${unit}`;
  return `${n.toFixed(3)}${unit}`;
}

function renderTick(payload: TickPayload): string {
  const outputNow = payload.output_tokens ?? 0;
  const promptTokens = Math.max(0, outputNow - prevOutput);
  prevOutput = outputNow;

  const kwh   = tokensToKwh(promptTokens);
  const waterL = kwh * WATER_L_PER_KWH;

  const waterStr = `${BLUE}💧${formatSmall(waterL, "L")}${RESET}`;
  const energyStr = `${YELLOW}⚡${formatSmall(kwh, "Wh")}${RESET}`;  // show Wh, friendlier scale

  const link = osc8(`${DIM}[carbo]${RESET}`, DASHBOARD_URL);
  return `${waterStr} ${energyStr} ${link}`;
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const payload = JSON.parse(trimmed) as TickPayload;
    process.stdout.write(renderTick(payload) + "\n");
  } catch {
    // Silently skip malformed lines; Claude Code will show last good output.
  }
});

rl.on("close", () => process.exit(0));
