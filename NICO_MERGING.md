# NICO — Merging Coding-Agent Sessions

You own the collaborative core: take separate developers' coding-agent interactions and fold them into one shared, deduplicated session so the same work isn't done twice. You do **not** touch the water/electricity math — you just emit one usage event per ask (contract below) that your friend's tracker consumes. That event is the only thing connecting your two halves, so you can build entirely in parallel.

## Stack (MVP cut)
Next.js (App Router, TS) on Vercel · Vercel AI SDK · OpenAI `text-embedding-3-small` + a cheap chat model · Upstash Vector (semantic store) · Upstash Redis (session state). No Postgres/WebSockets for the MVP.

## Your tasks

### 1. Scaffold + infra (push to `main` first)
- `create-next-app` (App Router, TS); add `ai`, `@ai-sdk/openai`, `@upstash/vector`, `@upstash/redis`.
- `.env.local` + committed `.env.example`: `OPENAI_API_KEY`, `UPSTASH_VECTOR_REST_URL/TOKEN`, `UPSTASH_REDIS_REST_URL/TOKEN`.
- Get the skeleton on `main` early so your friend can branch off it.

### 2. Session model
- A **shared session keyed by repo** (e.g. `session:{repoId}`). Devs "join" it; their agent prompts/answers flow into one history.
- Each stored interaction: `{ id, prompt, answer, embedding, author, ts, answerTokens }` upserted to Upstash Vector with the repo as a namespace/filter.
- Keep a lightweight live-roster in Redis (who's active) so you can show a merged session and attribute reuse.

### 3. The merge / reuse pipeline (`POST /api/ask`)
```
embed(prompt) → vector.query(namespace=repo, topK:1, includeMetadata)
  → score >= 0.90 ? HIT (reuse stored answer)
                  : MISS (generateText, then upsert the new interaction)
```
- Threshold is a constant; start **0.90**, tune at rehearsal.
- Only reuse for clearly informational Q&A; don't serve one question's *generated code* for a different question. Seeding (below) keeps the demo safe.
- On a HIT, return provenance (`author`/`ts`/`prompt` of the match) so the UI can show "reused from Alice, 10 min ago."

### 4. Concurrency / true "merging"
- Two devs hitting the same repo session at once must not clobber each other. Upserts are keyed by `id` (last-write-wins is fine for MVP). 
- A near-simultaneous duplicate is the money shot: Alice MISS stores it, Bob's paraphrase seconds later HITs it. Make sure the store write completes before the next query (await the upsert).

### 5. Emit usage events  ← the boundary to your friend
On **every** ask, after deciding hit/miss, call:
```ts
await recordUsage({
  cacheHit,                         // true on reuse
  tokens: cacheHit ? match.answerTokens : usage.completionTokens,
  model, author, ts: Date.now(),
});
```
`recordUsage` is **your friend's** function. While they build it, stub it:
```ts
export const recordUsage = async (e) => { console.log("usage", e); };
```
Swap the stub for their import when you merge. Don't change the event shape without telling them.

### 6. Seed + rehearse
- `scripts/seed.ts`: pre-upsert 3–4 interactions so a HIT is guaranteed live.
- Hardcode + rehearse: Alice asks A → MISS, Bob asks a near-paraphrase → HIT, provenance shows, and (via your events) the tracker ticks up. Kill all live randomness.

### 7. Deploy + own the merge
Deploy to Vercel, set env. When friend's branch is ready: review, wire their real `recordUsage` + `/api/metrics` in place of stubs, merge, redeploy.

## Frozen contract — usage event (you produce)
```ts
type UsageEvent = {
  cacheHit: boolean;   // true = work avoided
  tokens: number;      // answer tokens — "saved" if hit, "spent" if miss
  model: string;       // e.g. "gpt-4o-mini"
  author: string;
  ts: number;          // epoch ms
};
// your friend implements:  recordUsage(e: UsageEvent): Promise<void>
```
This shape is shared. If you add/rename a field, ping your friend before pushing.

## Suggested order
Scaffold → push `main` → session model → `/api/ask` reuse → recordUsage calls (stubbed) → seed → deploy → integrate friend's tracker → merge.
