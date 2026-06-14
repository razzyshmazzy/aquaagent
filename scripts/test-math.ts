// Pure-math tests — no Redis dependency, runnable without .env.local
// npx tsx --env-file=.env.local scripts/test-math.ts
import { computeSustainability, computeMetrics } from "../lib/sustainability";

let pass = 0; let fail = 0;
function check(label: string, got: number, expected: number, tol = 0.0001) {
  const ok = Math.abs(got - expected) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${got} (expected ~${expected})`);
  if (ok) pass++; else fail++;
}

// Values cross-checked against the frozen-contract example in TEAMMATE_TRACKER.md
const s = computeSustainability(4100, 9000);
check("energySavedKwh", s.energySavedKwh, 0.00123,  0.00005);
check("energySpentKwh", s.energySpentKwh, 0.0027,   0.00005);
check("waterSavedL",    s.waterSavedL,    0.002214,  0.0001);
check("waterSpentL",    s.waterSpentL,    0.00486,   0.0001);
check("co2SavedG",      s.co2SavedG,      0.492,     0.01);

const m = computeMetrics(12, 5, 4100, 9000, null);
check("requests",       m.requests,       12,   0);
check("promptsAvoided", m.promptsAvoided, 5,    0);
check("cacheHitRate",   m.cacheHitRate,   0.4167, 0.001);
check("tokensSaved",    m.tokensSaved,    4100, 0);
check("tokensSpent",    m.tokensSpent,    9000, 0);
console.log(`  ecoScore: ${m.ecoScore}  (sqrt(0.4167)*100 ≈ 65)`);
console.log(`  latest:   ${m.latest}`);

// Prompt shortening — saved input tokens fold into the saved (energy→water→CO₂) side
const ss = computeSustainability(0, 9000, 1000);
check("shortening waterSavedFromShorteningL", ss.waterSavedFromShorteningL, 0.0018, 0.0001);
check("shortening folds into waterSavedL",    ss.waterSavedL,               0.0018, 0.0001);
check("shortening leaves spent untouched",    ss.waterSpentL,               0.0162, 0.0001);
const ms = computeMetrics(10, 0, 0, 9000, null, 1000);
check("metrics promptTokensSaved",            ms.promptTokensSaved,         1000,   0);

// Zero-request edge case — must not divide by zero
const z = computeMetrics(0, 0, 0, 0, null);
check("zero cacheHitRate", z.cacheHitRate, 0, 0);
check("zero ecoScore",     z.ecoScore,     0, 0);

// Latest event round-trips through computeMetrics
const evt = { cacheHit: true, tokens: 320, model: "gpt-4o-mini", author: "Bob", ts: 1718200000000 };
const mWithLatest = computeMetrics(1, 1, 320, 0, evt);
const ok = mWithLatest.latest?.author === "Bob" && mWithLatest.latest.tokens === 320;
console.log(`${ok ? "✓" : "✗"} latest event preserved`);
if (ok) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
