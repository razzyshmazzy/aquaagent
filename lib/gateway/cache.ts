import { randomUUID } from "node:crypto";
import { embed } from "ai";
import { openai, vector, type CachedAnswer } from "@/lib/clients";
import { EMBED_MODEL, SIMILARITY_THRESHOLD } from "@/lib/constants";

export type CacheHit = {
  score: number;
  answer: CachedAnswer;
};

// Embed the prompt and look up the nearest cached answer in the repo's
// namespace. Returns the embedding (reused for upsert on a miss) and the top
// match if it clears the similarity threshold.
export async function lookup(
  repoId: string,
  promptText: string
): Promise<{ embedding: number[]; hit: CacheHit | null }> {
  const { embedding } = await embed({
    model: openai.embedding(EMBED_MODEL),
    value: promptText,
  });

  const results = await vector.namespace(repoId).query({
    vector: embedding,
    topK: 1,
    includeMetadata: true,
  });

  const top = results[0];
  if (top && top.score >= SIMILARITY_THRESHOLD) {
    return {
      embedding,
      hit: { score: top.score, answer: top.metadata as unknown as CachedAnswer },
    };
  }
  return { embedding, hit: null };
}

// Store a freshly generated answer in the repo's namespace so the next
// near-paraphrase — from either agent — hits it.
export async function store(
  repoId: string,
  embedding: number[],
  record: CachedAnswer
): Promise<void> {
  await vector.namespace(repoId).upsert({
    id: randomUUID(),
    vector: embedding,
    metadata: record as unknown as Record<string, unknown>,
  });
}
