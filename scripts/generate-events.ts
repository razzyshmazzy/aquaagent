// Synthetic UsageEvent generator — drives metrics without the live gateway.
// Usage: npx tsx --env-file=.env.local scripts/generate-events.ts [--count N]

import { recordUsage, getMetrics } from "../lib/metrics";

const MODELS = ["claude-sonnet-4-6", "gpt-4o-mini", "claude-opus-4-8"];
const AUTHORS = ["Alice", "Bob", "Carol", "Dave"];

const SYNTHETIC: Array<Parameters<typeof recordUsage>[0]> = [
  { cacheHit: false, tokens: 850, model: "gpt-4o-mini",       author: "Alice", ts: Date.now() },
  { cacheHit: true,  tokens: 850, model: "gpt-4o-mini",       author: "Bob",   ts: Date.now() },
  { cacheHit: false, tokens: 412, model: "claude-sonnet-4-6", author: "Carol", ts: Date.now() },
  { cacheHit: true,  tokens: 412, model: "claude-sonnet-4-6", author: "Dave",  ts: Date.now() },
  { cacheHit: true,  tokens: 320, model: "gpt-4o-mini",       author: "Alice", ts: Date.now() },
  { cacheHit: false, tokens: 980, model: "claude-opus-4-8",   author: "Bob",   ts: Date.now() },
  { cacheHit: true,  tokens: 980, model: "claude-opus-4-8",   author: "Carol", ts: Date.now() },
  { cacheHit: true,  tokens: 275, model: "gpt-4o-mini",       author: "Dave",  ts: Date.now() },
];

function randomEvent(): Parameters<typeof recordUsage>[0] {
  const cacheHit = Math.random() > 0.45;
  return {
    cacheHit,
    tokens: Math.floor(100 + Math.random() * 900),
    model: MODELS[Math.floor(Math.random() * MODELS.length)],
    author: AUTHORS[Math.floor(Math.random() * AUTHORS.length)],
    ts: Date.now(),
  };
}

const countArg = process.argv.indexOf("--count");
const count = countArg !== -1 ? parseInt(process.argv[countArg + 1], 10) : 0;

const events = count > 0
  ? Array.from({ length: count }, randomEvent)
  : SYNTHETIC;

console.log(`Recording ${events.length} synthetic usage events…`);
for (const e of events) {
  await recordUsage(e);
  const label = e.cacheHit ? "HIT " : "MISS";
  console.log(`  ${label}  ${e.tokens.toString().padStart(4)} tokens  ${e.model}  ${e.author}`);
}

const m = await getMetrics();
console.log("\nCounters after run:");
console.log(`  requests      ${m.requests}`);
console.log(`  promptsAvoided ${m.promptsAvoided}  (hit rate ${(m.cacheHitRate * 100).toFixed(1)}%)`);
console.log(`  tokensSaved   ${m.tokensSaved}`);
console.log(`  tokensSpent   ${m.tokensSpent}`);
console.log(`  waterSavedL   ${m.waterSavedL}`);
console.log(`  energySavedKwh ${m.energySavedKwh}`);
console.log(`  co2SavedG     ${m.co2SavedG}`);
console.log(`  ecoScore      ${m.ecoScore}`);
