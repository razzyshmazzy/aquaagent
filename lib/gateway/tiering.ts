import { MAX_CACHEABLE_CHARS } from "@/lib/constants";
import type { NormalizedRequest } from "./normalize";

// Decide whether a request may be served from / written to the shared cache.
//
// MVP heuristic: only short, natural-language questions are cache-eligible. Real
// coding-agent traffic carries tools, huge system prompts, and code — it fails
// this gate and forwards untouched. Conservative on purpose (NICO_MERGING_NEXT
// #3): never reuse one question's generated *code* for another. The header
// override (x-carbo-cache) lets the demo force the decision.
export function isCacheable(req: NormalizedRequest): boolean {
  if (req.cacheOverride === "on") return true;
  if (req.cacheOverride === "off") return false;

  const text = req.promptText;
  if (!text) return false; // tool-result turns carry no user text — bypass
  if (text.length > MAX_CACHEABLE_CHARS) return false; // long = code/complex
  if (text.includes("```")) return false; // contains a code fence

  // NOTE: we deliberately do NOT bypass purely because `tools` is present —
  // real agents (Claude Code, Codex) attach their toolset to every request, so
  // that would bypass everything. The text heuristics above (short, fence-free,
  // non-empty user message) are what gate code vs. informational Q&A. Use the
  // x-zenflow-cache header to force the decision per request.
  return true;
}
