import { randomUUID } from "node:crypto";
import { embed, generateText } from "ai";
import { openai, vector, type CachedAnswer } from "@/lib/clients";
import { SIMILARITY_THRESHOLD, EMBED_MODEL, CHAT_MODEL } from "@/lib/constants";
import { getMetrics, recordUsage } from "@/lib/metrics";
import { answerTokensFrom, estimateTokens } from "@/lib/tokens";

export const runtime = "nodejs";

// POST /api/ask
//   embed(prompt) -> vector.query(topK:1)
//     score >= THRESHOLD -> HIT  (record, return cached answer + provenance)
//     else                -> MISS (generate, record, upsert)
export async function POST(req: Request) {
  let body: { prompt?: unknown; author?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const author =
    typeof body.author === "string" && body.author.trim()
      ? body.author.trim()
      : "anon";

  if (!prompt) {
    return Response.json(
      { error: "`prompt` is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  // 1. Embed the prompt.
  const { embedding } = await embed({
    model: openai.embedding(EMBED_MODEL),
    value: prompt,
  });

  // 2. Nearest cached prompt.
  const results = await vector.query({
    vector: embedding,
    topK: 1,
    includeMetadata: true,
  });
  const top = results[0];

  // 3a. HIT — serve the cached answer.
  if (top && top.score >= SIMILARITY_THRESHOLD) {
    const cached = top.metadata as unknown as CachedAnswer;
    const tokensSaved = cached.answerTokens ?? estimateTokens(cached.answer);

    // Emit the usage event (work avoided), then read back the totals.
    await recordUsage({
      cacheHit: true,
      tokens: tokensSaved,
      model: CHAT_MODEL,
      author,
      ts: Date.now(),
    });
    const metrics = await getMetrics();

    return Response.json({
      answer: cached.answer,
      cacheHit: true,
      score: top.score,
      source: {
        author: cached.author,
        ts: cached.ts,
        prompt: cached.prompt,
      },
      metrics,
    });
  }

  // 3b. MISS — generate, record, and cache for next time.
  const { text, usage } = await generateText({
    model: openai(CHAT_MODEL),
    prompt,
  });
  const answerTokens = answerTokensFrom(
    usage as unknown as Record<string, unknown>,
    text
  );

  // Emit the usage event (tokens spent), then cache for next time.
  await recordUsage({
    cacheHit: false,
    tokens: answerTokens,
    model: CHAT_MODEL,
    author,
    ts: Date.now(),
  });

  const record: CachedAnswer = {
    prompt,
    answer: text,
    author,
    ts: Date.now(),
    answerTokens,
  };
  await vector.upsert({
    id: randomUUID(),
    vector: embedding,
    metadata: record as unknown as Record<string, unknown>,
  });

  const metrics = await getMetrics();

  return Response.json({
    answer: text,
    cacheHit: false,
    score: null,
    source: null,
    metrics,
  });
}
