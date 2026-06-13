import { normalize, type Provider } from "./normalize";
import { isCacheable } from "./tiering";
import { lookup, store } from "./cache";
import { recordUsage } from "@/lib/metrics";
import { estimateTokens } from "@/lib/tokens";
import { CHAT_MODEL } from "@/lib/constants";
import type { CachedAnswer } from "@/lib/clients";
import * as anthropic from "./anthropic";
import * as openai from "./openai";

// Each provider module exposes the same surface; dispatch by request format.
const providers = { anthropic, openai } as const;

// The gateway core (NICO_MERGING_NEXT #3):
//   normalize -> tier -> [bypass | hit | miss]
export async function handle(provider: Provider, req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const p = providers[provider];
  const norm = normalize(provider, body, req.headers);

  // Code-gen / tool-use / long requests: transparent passthrough, no cache.
  if (!isCacheable(norm)) {
    return p.passthrough(norm.body, req.headers);
  }

  try {
    // Embed once; reused for the upsert on a miss.
    const { embedding, hit } = await lookup(norm.repoId, norm.promptText);

    // HIT — serve the cached answer in this request's wire format, no upstream call.
    if (hit) {
      const tokens = hit.answer.answerTokens ?? estimateTokens(hit.answer.answer);
      await recordUsage({
        cacheHit: true,
        tokens,
        model: norm.model || CHAT_MODEL,
        author: norm.author,
        ts: Date.now(),
      });
      return p.synthesize(hit.answer.answer, norm.model, norm.stream);
    }

    // MISS — forward upstream (non-streaming), record, cache, then respond.
    const { text, answerTokens } = await p.forward(norm.body, req.headers);
    await recordUsage({
      cacheHit: false,
      tokens: answerTokens,
      model: norm.model || CHAT_MODEL,
      author: norm.author,
      ts: Date.now(),
    });
    const record: CachedAnswer = {
      prompt: norm.promptText,
      answer: text,
      author: norm.author,
      ts: Date.now(),
      answerTokens,
    };
    await store(norm.repoId, embedding, record);
    return p.synthesize(text, norm.model, norm.stream);
  } catch (err) {
    const message = err instanceof Error ? err.message : "gateway error";
    return Response.json({ error: message }, { status: 502 });
  }
}
