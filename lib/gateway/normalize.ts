import {
  DEFAULT_REPO,
  HEADER_REPO,
  HEADER_AUTHOR,
  HEADER_CACHE,
} from "@/lib/constants";

export type Provider = "anthropic" | "openai";

// What the pipeline needs out of an inbound request, regardless of provider.
export type NormalizedRequest = {
  provider: Provider;
  promptText: string; // latest user message, flattened to text
  model: string;
  repoId: string;
  author: string;
  stream: boolean;
  cacheOverride: "on" | "off" | null;
  body: Record<string, unknown>; // original body, forwarded verbatim on a miss/bypass
};

// Flatten a message `content` that may be a plain string or an array of blocks
// (Anthropic content blocks, or OpenAI multimodal parts).
function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const t = (part as { text?: unknown }).text;
          return typeof t === "string" ? t : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

// Last user-role message, flattened to text. Both providers use a `messages`
// array with `{ role, content }`; Anthropic carries the system prompt separately.
function lastUserText(body: Record<string, unknown>): string {
  const messages = body.messages;
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === "object" && (m as { role?: unknown }).role === "user") {
      return flattenContent((m as { content?: unknown }).content);
    }
  }
  return "";
}

// First non-empty value among the candidate header names.
function firstHeader(headers: Headers, names: string[]): string {
  for (const name of names) {
    const v = headers.get(name);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export function normalize(
  provider: Provider,
  body: Record<string, unknown>,
  headers: Headers
): NormalizedRequest {
  const repoId = firstHeader(headers, HEADER_REPO) || DEFAULT_REPO;
  const author = firstHeader(headers, HEADER_AUTHOR) || "anon";
  const rawOverride = firstHeader(headers, HEADER_CACHE).toLowerCase();
  const cacheOverride =
    rawOverride === "on" || rawOverride === "off" ? rawOverride : null;

  return {
    provider,
    promptText: lastUserText(body),
    model: typeof body.model === "string" ? body.model : "",
    repoId,
    author,
    stream: body.stream === true,
    cacheOverride,
    body,
  };
}
