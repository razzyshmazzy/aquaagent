// Carbo — tunable constants. Keep these labeled and swappable (per NICO.md #3).

// --- Cache behavior ---------------------------------------------------------
// Cosine similarity required to serve a cached answer. Cosine sim from Upstash
// Vector is normalized to [0, 1]. Start at 0.90; tune during rehearsal so a
// loose threshold never serves a wrong answer live.
export const SIMILARITY_THRESHOLD = 0.9;

// --- Models -----------------------------------------------------------------
export const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims
export const CHAT_MODEL = "gpt-4o-mini"; // cheap chat model for MISS generation

// NOTE: the sustainability constants (energy/water/CO2) live in lib/metrics.ts,
// which is owned by the metrics dev. See WhenBranched.md.
