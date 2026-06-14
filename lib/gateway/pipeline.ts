import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { normalize, type Provider } from "./normalize";
import { isCacheable } from "./tiering";
import { shortenPrompt, promptTokensSaved as estPromptTokensSaved, withShortenedPrompt } from "./shorten";
import { lookup, store } from "./cache";
import { recordUsage } from "@/lib/metrics";
import { estimateTokens } from "@/lib/tokens";
import { CHAT_MODEL } from "@/lib/constants";
import type { CachedAnswer } from "@/lib/clients";
import { persistInteraction, type PersistInput } from "@/lib/db/persist";
import * as anthropic from "./anthropic";
import * as openai from "./openai";

// Each provider module exposes the same surface; dispatch by request format.
const providers = { anthropic, openai } as const;

// Persist an interaction OFF the hot path. Next `after()` runs this once the
// response has flushed, so it never blocks or delays streaming. Failures are
// logged (message only — never the prompt/answer) and swallowed.
function schedulePersist(input: PersistInput): void {
  after(async () => {
    try {
      await persistInteraction(input);
    } catch (err) {
      console.error(
        "[carbo] persist failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  });
}

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
      schedulePersist({
        id: randomUUID(),
        repoId: norm.repoId,
        author: norm.author,
        prompt: norm.promptText,
        answer: hit.answer.answer,
        model: norm.model || CHAT_MODEL,
        cacheHit: true,
        tokens,
        matchedInteractionId: hit.answer.interactionId ?? null,
      });
      return p.synthesize(hit.answer.answer, norm.model, norm.stream);
    }

    // MISS — compact the prompt, forward the shorter version upstream, then
    // record, cache, and respond. The removed input tokens never reach the model.
    const shortened = shortenPrompt(norm.promptText);
    const promptTokensSaved = estPromptTokensSaved(norm.promptText, shortened);
    const forwardBody =
      promptTokensSaved > 0 ? withShortenedPrompt(norm.body, shortened) : norm.body;

    const { text, answerTokens } = await p.forward(forwardBody, req.headers);
    await recordUsage({
      cacheHit: false,
      tokens: answerTokens,
      model: norm.model || CHAT_MODEL,
      author: norm.author,
      ts: Date.now(),
      promptTokensSaved,
    });
    // This row's id is stamped into the vector metadata so a future hit can
    // point matched_interaction_id back at it.
    const interactionId = randomUUID();
    const record: CachedAnswer = {
      prompt: norm.promptText,
      answer: text,
      author: norm.author,
      ts: Date.now(),
      answerTokens,
      interactionId,
    };
    await store(norm.repoId, embedding, record);
    schedulePersist({
      id: interactionId,
      repoId: norm.repoId,
      author: norm.author,
      prompt: norm.promptText,
      answer: text,
      model: norm.model || CHAT_MODEL,
      cacheHit: false,
      tokens: answerTokens,
      promptTokensSaved,
      matchedInteractionId: null,
    });
    return p.synthesize(text, norm.model, norm.stream);
  } catch (err) {
    const message = err instanceof Error ? err.message : "gateway error";
    return Response.json({ error: message }, { status: 502 });
  }
}
