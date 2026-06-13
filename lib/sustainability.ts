// Conversion engine — tokens → energy → water → CO₂.
// All constants are labeled and cited; replace with measured values when available.

// ~0.3 Wh per 1,000 tokens of inference for a small hosted model.
// Source: Luccioni et al., "Power Hungry Processing: Scrutinizing Energy Use in AI" (NeurIPS 2023).
export const WH_PER_1K_TOKENS = 0.3;

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
};

export type SustainabilityBreakdown = {
  energySavedKwh: number;
  energySpentKwh: number;
  waterSavedL: number;
  waterSpentL: number;
  co2SavedG: number;
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
  ecoScore: number;
  latest: UsageEvent | null;
};

export function tokensToKwh(tokens: number): number {
  return ((tokens / 1000) * WH_PER_1K_TOKENS) / 1000;
}

export function computeSustainability(
  tokensSaved: number,
  tokensSpent: number
): SustainabilityBreakdown {
  const savedKwh = tokensToKwh(tokensSaved);
  const spentKwh = tokensToKwh(tokensSpent);
  return {
    energySavedKwh: round(savedKwh, 6),
    energySpentKwh: round(spentKwh, 6),
    waterSavedL: round(savedKwh * WATER_L_PER_KWH, 6),
    waterSpentL: round(spentKwh * WATER_L_PER_KWH, 6),
    co2SavedG: round(savedKwh * CO2_G_PER_KWH, 4),
  };
}

// Pure derivation — no Redis dependency, importable anywhere including tests.
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

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
