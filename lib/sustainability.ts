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

export type SustainabilityBreakdown = {
  energySavedKwh: number;
  energySpentKwh: number;
  waterSavedL: number;
  waterSpentL: number;
  co2SavedG: number;
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

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
