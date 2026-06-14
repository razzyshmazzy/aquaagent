// Conversion engine — tokens → energy → water → CO₂.
// All constants are labeled and cited; replace with measured values when available.

// ~1.0 Wh per 1,000 tokens of inference for a frontier hosted model (Claude/GPT-4 class).
// Source: Luccioni et al., "Power Hungry Processing: Watts Driving the Cost of AI Deployment"
// (NeurIPS 2023) — text generation measured at 0.12–10 Wh per page (~375 tokens);
// mid-range frontier estimate used here. Smaller models may be 3–10× lower.
export const WH_PER_1K_TOKENS = 1.0;

// Datacenter water usage effectiveness, including cooling towers and power-plant water.
// ~1.8 L per kWh of IT load. Source: Shehabi et al., "US Data Center Energy Usage Report" (LBNL, 2016).
export const WATER_L_PER_KWH = 1.8;

// Grid carbon intensity for a US-average mixed grid.
// Source: EPA eGRID2022 national average (~386 gCO₂eq/kWh, rounded up 4% for margin).
export const CO2_G_PER_KWH = 400;

// Frozen contract — must match UsageEvent in lib/metrics.ts.
export type UsageEvent = {
  cacheHit: boolean;
  tokens: number;
  model: string;
  author: string;
  ts: number;
  // Optional: estimated input tokens removed by prompt shortening on a forwarded
  // (miss) request. Independent of `tokens` (which is the answer/output count).
  promptTokensSaved?: number;
};

export type SustainabilityBreakdown = {
  energySavedKwh: number;
  energySpentKwh: number;
  waterSavedL: number;
  waterSpentL: number;
  co2SavedG: number;
  // Portion of waterSavedL attributable to prompt shortening (vs cache hits).
  waterSavedFromShorteningL: number;
};

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
  // Cumulative input tokens removed by prompt shortening, and the slice of
  // waterSavedL it accounts for.
  promptTokensSaved: number;
  waterSavedFromShorteningL: number;
  ecoScore: number;
  latest: UsageEvent | null;
};

export function tokensToKwh(tokens: number): number {
  return ((tokens / 1000) * WH_PER_1K_TOKENS) / 1000;
}

export function computeSustainability(
  tokensSaved: number,
  tokensSpent: number,
  promptTokensSaved = 0
): SustainabilityBreakdown {
  // Prompt-shortening savings join cache-hit savings on the saved side: water is
  // derived from energy, so adding the removed tokens to the energy basis keeps
  // waterSavedL === energySavedKwh * WATER_L_PER_KWH internally consistent.
  const savedKwh = tokensToKwh(tokensSaved + promptTokensSaved);
  const spentKwh = tokensToKwh(tokensSpent);
  const shorteningKwh = tokensToKwh(promptTokensSaved);
  return {
    energySavedKwh: round(savedKwh, 6),
    energySpentKwh: round(spentKwh, 6),
    waterSavedL: round(savedKwh * WATER_L_PER_KWH, 6),
    waterSpentL: round(spentKwh * WATER_L_PER_KWH, 6),
    co2SavedG: round(savedKwh * CO2_G_PER_KWH, 4),
    waterSavedFromShorteningL: round(shorteningKwh * WATER_L_PER_KWH, 6),
  };
}

// Pure derivation — no Redis dependency, importable anywhere including tests.
export function computeMetrics(
  requests: number,
  hits: number,
  tokensSaved: number,
  tokensSpent: number,
  latest: UsageEvent | null = null,
  promptTokensSaved = 0
): Metrics {
  const cacheHitRate = requests === 0 ? 0 : hits / requests;
  // Saturating reward — 50% hit rate → 71 score, 75% → 87, 100% → 100.
  const ecoScore = requests === 0 ? 0 : Math.round(100 * Math.sqrt(cacheHitRate));
  const s = computeSustainability(tokensSaved, tokensSpent, promptTokensSaved);

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
    promptTokensSaved,
    waterSavedFromShorteningL: s.waterSavedFromShorteningL,
    ecoScore,
    latest,
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
