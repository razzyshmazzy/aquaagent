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
  if (!text) return false;
  if (text.length > MAX_CACHEABLE_CHARS) return false;
  if (text.includes("```")) return false; // contains a code fence

  // Requests carrying tools are agent/code workflows — bypass.
  if (Array.isArray(req.body.tools) && req.body.tools.length > 0) return false;

  return true;
}
