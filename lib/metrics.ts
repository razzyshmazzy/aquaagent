import { redis } from "./clients";

// =============================================================================
// METRICS — OWNED BY THE METRICS DEV (branch off main). See WhenBranched.md.
//
// The integration boundary is two functions and two shapes:
//   - recordUsage(e: UsageEvent)  — /api/ask calls this on EVERY ask.
//   - getMetrics(): Promise<Metrics> — /api/metrics and /api/ask read this.
// Keep those signatures stable; everything inside is yours to tune.
// =============================================================================

// --- Sustainability estimates (tune these; keep them cited) ------------------
// Energy per 1k tokens of inference. ~0.3 Wh/1k tokens is an order-of-magnitude
// estimate for a small hosted model (cf. Luccioni et al. 2024).
const WH_PER_1K_TOKENS = 0.3;
// Datacenter water usage effectiveness incl. power generation. ~1.8 L/kWh.
const WATER_L_PER_KWH = 1.8;
// Grid carbon intensity (region-dependent). ~400 gCO2/kWh for a mixed grid.
const CO2_G_PER_KWH = 400;

// --- Frozen contract: the usage event /api/ask produces ----------------------
export type UsageEvent = {
  cacheHit: boolean; // true = work avoided (reuse)
  tokens: number; // answer tokens — "saved" if hit, "spent" if miss
  model: string; // e.g. "gpt-4o-mini"
  author: string;
  ts: number; // epoch ms
};

// The /api/metrics contract shape (also embedded in /api/ask responses).
export type Metrics = {
  requests: number;
  promptsAvoided: number;
  cacheHitRate: number; // 0..1
  tokensSaved: number;
  energyKwh: number;
  waterL: number;
  co2g: number;
  ecoScore: number; // 0..100
};

// Redis counter keys. Only three are stored; everything else is derived on read.
const KEYS = {
  requests: "carbo:requests", // total /api/ask calls
  hits: "carbo:hits", // cache hits === promptsAvoided
  tokensSaved: "carbo:tokensSaved", // generation tokens avoided by hits
} as const;

// Called on every ask. Bumps requests; on a hit also bumps promptsAvoided and
// the tokens saved by reuse.
export async function recordUsage(e: UsageEvent): Promise<void> {
  const pipe = redis.pipeline();
  pipe.incr(KEYS.requests);
  if (e.cacheHit) {
    pipe.incr(KEYS.hits);
    if (e.tokens > 0) pipe.incrby(KEYS.tokensSaved, e.tokens);
  }
  await pipe.exec();
}

// Read counters and compute the full derived metrics object.
export async function getMetrics(): Promise<Metrics> {
  const [requests, hits, tokensSaved] = await Promise.all([
    redis.get<number>(KEYS.requests),
    redis.get<number>(KEYS.hits),
    redis.get<number>(KEYS.tokensSaved),
  ]);
  return computeMetrics(requests ?? 0, hits ?? 0, tokensSaved ?? 0);
}

// Pure derivation — easy to unit test and tune.
export function computeMetrics(
  requests: number,
  hits: number,
  tokensSaved: number
): Metrics {
  const cacheHitRate = requests === 0 ? 0 : hits / requests;

  // tokensSaved -> Wh -> kWh, then water and CO2 from the saved energy.
  const energyKwh = ((tokensSaved / 1000) * WH_PER_1K_TOKENS) / 1000;
  const waterL = energyKwh * WATER_L_PER_KWH;
  const co2g = energyKwh * CO2_G_PER_KWH;

  // Eco score: a saturating reward for cache hit rate so modest reuse still
  // reads well on the dashboard. 0 when nothing's happened yet. Tunable.
  const ecoScore =
    requests === 0 ? 0 : Math.round(100 * Math.sqrt(cacheHitRate));

  return {
    requests,
    promptsAvoided: hits,
    cacheHitRate: round(cacheHitRate, 4),
    tokensSaved,
    energyKwh: round(energyKwh, 6),
    waterL: round(waterL, 6),
    co2g: round(co2g, 4),
    ecoScore,
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// Reset all counters (used by the seed script's --reset / --flush flags).
export async function resetMetrics(): Promise<void> {
  await redis.del(KEYS.requests, KEYS.hits, KEYS.tokensSaved);
}
