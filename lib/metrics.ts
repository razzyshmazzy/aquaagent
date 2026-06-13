import { redis } from "./clients";
import { computeMetrics, type UsageEvent, type Metrics } from "./sustainability";

export type { UsageEvent, Metrics } from "./sustainability";
export { computeMetrics } from "./sustainability";

const K = {
  requests: "carbo:requests",
  hits: "carbo:hits",
  tokensSaved: "carbo:tokensSaved",
  tokensSpent: "carbo:tokensSpent",
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
  p.set(K.latest, JSON.stringify(e));
  await p.exec();
}

export async function getMetrics(): Promise<Metrics> {
  const [requests, hits, tokensSaved, tokensSpent, latestRaw] = await Promise.all([
    redis.get<number>(K.requests),
    redis.get<number>(K.hits),
    redis.get<number>(K.tokensSaved),
    redis.get<number>(K.tokensSpent),
    redis.get<string>(K.latest),
  ]);

  const latest = latestRaw ? (JSON.parse(latestRaw) as UsageEvent) : null;
  return computeMetrics(
    requests ?? 0,
    hits ?? 0,
    tokensSaved ?? 0,
    tokensSpent ?? 0,
    latest
  );
}

export async function resetMetrics(): Promise<void> {
  await redis.del(K.requests, K.hits, K.tokensSaved, K.tokensSpent, K.latest);
}
