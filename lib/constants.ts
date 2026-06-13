// Carbo — tunable constants. Keep these labeled and swappable (per NICO.md #3).

// --- Cache behavior ---------------------------------------------------------
// Cosine similarity required to serve a cached answer. Cosine sim from Upstash
// Vector is normalized to [0, 1]. Start at 0.90; tune during rehearsal so a
// loose threshold never serves a wrong answer live.
export const SIMILARITY_THRESHOLD = 0.9;

// --- Models -----------------------------------------------------------------
export const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims
export const CHAT_MODEL = "gpt-4o-mini"; // fallback model label for usage events

// --- Gateway: tiering -------------------------------------------------------
// Only short, natural-language questions are cache-eligible. Real agent traffic
// (huge system prompts, tool calls, code) exceeds this and forwards untouched.
// Conservative on purpose: a loose gate must never serve cached code.
export const MAX_CACHEABLE_CHARS = 400;

// --- Gateway: request scoping ----------------------------------------------
// The shared cache is namespaced per repo. Agents pass these as headers; the
// default keeps the demo working as one shared namespace even without config.
export const DEFAULT_REPO = "default";
// Agents send the zenflow-prefixed headers; the carbo-prefixed names are kept
// as a fallback for older configs. Checked in this order.
export const HEADER_REPO = ["x-zenflow-repo", "x-carbo-repo"];
export const HEADER_AUTHOR = ["x-zenflow-author", "x-carbo-author"];
export const HEADER_CACHE = ["x-zenflow-cache", "x-carbo-cache"]; // "on" | "off"

// --- Gateway: upstream model APIs ------------------------------------------
export const ANTHROPIC_UPSTREAM = "https://api.anthropic.com/v1/messages";
export const OPENAI_UPSTREAM = "https://api.openai.com/v1/chat/completions";
export const ANTHROPIC_VERSION = "2023-06-01"; // default if client omits it

// NOTE: the sustainability constants (energy/water/CO2) live in lib/metrics.ts,
// which is owned by the metrics dev. See WhenBranched.md.
