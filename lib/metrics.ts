import { redis } from "./clients";
import { computeMetrics, type UsageEvent, type Metrics } from "./sustainability";

export type { UsageEvent, Metrics } from "./sustainability";
export { computeMetrics } from "./sustainability";

const K = {
  requests: "carbo:requests",
  hits: "carbo:hits",
  tokensSaved: "carbo:tokensSaved",
  tokensSpent: "carbo:tokensSpent",
  promptTokensSaved: "carbo:promptTokensSaved",
  latest: "carbo:latest",
} as const;

export async function recordUsage(e: UsageEvent): Promise<void> {
  const p = redis.pipeline();
  p.incr(K.requests);
  if (e.cacheHit) {
    p.incr(K.hits);
    if (e.tokens > 0) p.incrby(K.tokensSaved, e.tokens);
  } else {
    if (e.tokens > 0) p.incrby(K.tokensSpent, e.tokens);
  }
  // Prompt-shortening savings accrue on forwarded (miss) requests, independent
  // of the hit/miss token split above.
  if (e.promptTokensSaved && e.promptTokensSaved > 0) {
    p.incrby(K.promptTokensSaved, e.promptTokensSaved);
  }
  p.set(K.latest, e); // Upstash serializes objects; don't pre-stringify (it round-trips to "[object Object]")
  await p.exec();
}

export async function getMetrics(): Promise<Metrics> {
  const [requests, hits, tokensSaved, tokensSpent, promptTokensSaved, latestRaw] =
    await Promise.all([
      redis.get<number>(K.requests),
      redis.get<number>(K.hits),
      redis.get<number>(K.tokensSaved),
      redis.get<number>(K.tokensSpent),
      redis.get<number>(K.promptTokensSaved),
      redis.get<UsageEvent>(K.latest), // Upstash auto-deserializes back to the object
    ]);

  const latest = latestRaw ?? null;
  return computeMetrics(
    requests ?? 0,
    hits ?? 0,
    tokensSaved ?? 0,
    tokensSpent ?? 0,
    latest,
    promptTokensSaved ?? 0
  );
}

export async function resetMetrics(): Promise<void> {
  await redis.del(
    K.requests,
    K.hits,
    K.tokensSaved,
    K.tokensSpent,
    K.promptTokensSaved,
    K.latest
  );
}
