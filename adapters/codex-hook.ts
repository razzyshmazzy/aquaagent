#!/usr/bin/env tsx
// Codex turn-stop hook adapter — prints one colored summary line per turn.
//
// Configure in codex config (codex.yaml or env):
//   hooks:
//     turn_stop: npx tsx /path/to/adapters/codex-hook.ts
//
// Codex pipes a JSON object to stdin describing the completed turn:
//   { type: "turn_stop", usage: { input_tokens: N, output_tokens: N } }
// (Fields from Codex v0.1+; adapt if your version differs.)

import { tokensToKwh, WATER_L_PER_KWH, CO2_G_PER_KWH } from "../lib/sustainability";

const BLUE    = "\x1b[34m";
const YELLOW  = "\x1b[33m";
const GREEN   = "\x1b[32m";
const DIM     = "\x1b[2m";
const BOLD    = "\x1b[1m";
const RESET   = "\x1b[0m";

type HookPayload = {
  type?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  output_tokens?: number;
  [k: string]: unknown;
};

function formatSmall(n: number, unit: string): string {
  if (n < 0.001) return `${(n * 1e6).toFixed(1)}µ${unit}`;
  if (n < 1)     return `${(n * 1000).toFixed(2)}m${unit}`;
  return `${n.toFixed(3)}${unit}`;
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let tokens = 0;
  if (raw) {
    try {
      const payload = JSON.parse(raw) as HookPayload;
      tokens =
        payload.usage?.output_tokens ??
        payload.usage?.total_tokens ??
        payload.output_tokens ??
        0;
    } catch {
      // stdin wasn't JSON — fall through with 0 tokens
    }
  }

  if (tokens === 0) return; // nothing to report

  const kwh    = tokensToKwh(tokens);
  const waterL = kwh * WATER_L_PER_KWH;
  const co2G   = kwh * CO2_G_PER_KWH;

  const parts = [
    `${DIM}AquaAgent${RESET}`,
    `${BLUE}💧 ${formatSmall(waterL, "L")} water${RESET}`,
    `${YELLOW}⚡ ${formatSmall(kwh * 1000, "Wh")} energy${RESET}`,
    `${GREEN}🌿 ${formatSmall(co2G, "gCO₂")}${RESET}`,
    `${DIM}(${tokens} tokens)${RESET}`,
  ];

  process.stderr.write(`${BOLD}  ↳ ${RESET}${parts.join("  ")}\n`);
}

main().catch(() => process.exit(0));
