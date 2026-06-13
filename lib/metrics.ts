import { redis } from "./clients";
import { computeSustainability } from "./sustainability";

// Frozen contract — Nico's gateway calls recordUsage(e) on every cacheable request.
// Never rename these fields.
export type UsageEvent = {
  cacheHit: boolean;
  tokens: number; // tokens saved (hit) or spent (miss)
  model: string;
  author: string;
  ts: number; // epoch ms
};

// GET /api/metrics response shape. Expand freely; the gateway never reads it.
export type Metrics = {
  requests: number;
  promptsAvoided: number;
  cacheHitRate: number;
  tokensSaved: number;
  tokensSpent: number;
  energySavedKwh: number;
  energySpentKwh: number;
  waterSavedL: number;
  waterSpentL: number;
  co2SavedG: number;
  ecoScore: number;
  latest: UsageEvent | null;
};

const K = {
  requests: "carbo:requests",
  hits: "carbo:hits",
  tokensSaved: "carbo:tokensSaved",
  tokensSpent: "carbo:tokensSpent",
  latest: "carbo:latest",
} as const;

export async function recordUsage(e: UsageEvent): Promise<void> {
  const p = redis.pipeline();
  p.incr(K.requests);
  if (e.cacheHit) {
    p.incr(K.hits);
    if (e.tokens > 0) p.incrby(K.tokensSaved, e.tokens);
  } else {
    if (e.tokens > 0) p.incrby(K.tokensSpent, e.tokens);
  }
  p.set(K.latest, JSON.stringify(e));
  await p.exec();
}

export async function getMetrics(): Promise<Metrics> {
  const [requests, hits, tokensSaved, tokensSpent, latestRaw] = await Promise.all([
    redis.get<number>(K.requests),
    redis.get<number>(K.hits),
    redis.get<number>(K.tokensSaved),
    redis.get<number>(K.tokensSpent),
    redis.get<string>(K.latest),
  ]);

  const latest = latestRaw ? (JSON.parse(latestRaw) as UsageEvent) : null;
  return computeMetrics(
    requests ?? 0,
    hits ?? 0,
    tokensSaved ?? 0,
    tokensSpent ?? 0,
    latest
  );
}

export function computeMetrics(
  requests: number,
  hits: number,
  tokensSaved: number,
  tokensSpent: number,
  latest: UsageEvent | null = null
): Metrics {
  const cacheHitRate = requests === 0 ? 0 : hits / requests;
  // Saturating reward — 50% hit rate → 71 score, 75% → 87, 100% → 100.
  const ecoScore = requests === 0 ? 0 : Math.round(100 * Math.sqrt(cacheHitRate));
  const s = computeSustainability(tokensSaved, tokensSpent);

  return {
    requests,
    promptsAvoided: hits,
    cacheHitRate: round(cacheHitRate, 4),
    tokensSaved,
    tokensSpent,
    energySavedKwh: s.energySavedKwh,
    energySpentKwh: s.energySpentKwh,
    waterSavedL: s.waterSavedL,
    waterSpentL: s.waterSpentL,
    co2SavedG: s.co2SavedG,
    ecoScore,
    latest,
  };
}

export async function resetMetrics(): Promise<void> {
  await redis.del(K.requests, K.hits, K.tokensSaved, K.tokensSpent, K.latest);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
