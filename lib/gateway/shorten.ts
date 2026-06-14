import { estimateTokens } from "@/lib/tokens";

// Prompt compaction applied before forwarding a cache MISS upstream.
//
// Real agent prompts arrive padded with redundant whitespace (deep indentation,
// trailing spaces, stacked blank lines). Collapsing it leaves an equivalent
// prompt — we never reorder, summarize, or drop meaningful text — so the model
// receives the same instruction with fewer input tokens. Those removed tokens
// are real work the upstream never ingests, so the gateway counts them as saved
// (folded into the same energy → water → CO₂ conversion as cache hits).
//
// Deterministic and cheap on purpose: no extra model call on the hot path.
export function shortenPrompt(text: string): string {
  return text
    .replace(/[ \t]+/g, " ") // collapse runs of spaces/tabs to one
    .replace(/ *\n/g, "\n") // strip spaces before a newline
    .replace(/\n{3,}/g, "\n\n") // cap blank-line runs at one
    .trim();
}

// Estimated input tokens removed by shortening. Never negative.
export function promptTokensSaved(original: string, shortened: string): number {
  return Math.max(0, estimateTokens(original) - estimateTokens(shortened));
}

// Return a shallow clone of `body` with the last user message's text replaced by
// the shortened version — but ONLY when that content is a plain string. Array /
// multimodal content (Anthropic blocks, OpenAI parts) is left untouched so we
// never corrupt structured parts; in that case the original body is returned.
export function withShortenedPrompt(
  body: Record<string, unknown>,
  shortened: string
): Record<string, unknown> {
  const messages = body.messages;
  if (!Array.isArray(messages)) return body;

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === "object" && (m as { role?: unknown }).role === "user") {
      if (typeof (m as { content?: unknown }).content !== "string") return body;
      const clonedMessages = messages.slice();
      clonedMessages[i] = { ...(m as object), content: shortened };
      return { ...body, messages: clonedMessages };
    }
  }
  return body;
}
