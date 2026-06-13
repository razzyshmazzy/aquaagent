# NICO — Backend & Integration Owner

You own the brain (cache logic + metrics) and the merge. Your friend builds the UI on a branch against the contract below; that contract is frozen — if you change it, ping them first.

## Stack (MVP cut)
Next.js (App Router, TS) on Vercel · Vercel AI SDK · OpenAI `text-embedding-3-small` + a cheap chat model · Upstash Vector (similarity) · Upstash Redis (counters). No Postgres/WebSockets for the MVP.

## Your tasks

### 1. Scaffold + infra (do this first, push to `main` ASAP)
- `create-next-app` (App Router, TS), add `ai`, `@ai-sdk/openai`, `@upstash/vector`, `@upstash/redis`.
- `.env.local`: `OPENAI_API_KEY`, `UPSTASH_VECTOR_REST_URL/TOKEN`, `UPSTASH_REDIS_REST_URL/TOKEN`. Commit a `.env.example`.
- Get this on `main` early so your friend can branch off a real skeleton.

### 2. `POST /api/ask` — the core
```
embed(prompt) → vector.query(topK:1, includeMetadata)
  → if score >= 0.90: HIT  (record metrics, return cached answer + source)
  → else: MISS (generateText, record, upsert {prompt, answer, author, ts, answerTokens})
```
- Threshold lives in a constant. Start at **0.90**, tune during rehearsal.
- On a HIT, return the matched record's `author`/`ts`/`prompt` so the UI can show provenance.
- **Don't reuse generated *code* across different questions** — only reuse for clearly informational Q&A. For the demo, seeding (see #5) sidesteps this; just don't let a loose threshold serve a wrong answer live.

### 3. Metrics engine (`lib/metrics.ts`)
Everything derives from `tokensSaved`. Keep the constants labeled and swappable:
```ts
const WH_PER_1K_TOKENS = 0.3;  // estimate — cite a source
const WATER_L_PER_KWH  = 1.8;  // datacenter WUE — cite
const CO2_G_PER_KWH    = 400;  // grid intensity — cite, region-dependent
```
Maintain Redis counters: `requests`, `hits` (= promptsAvoided), `tokensSaved`. Derive rate/kwh/water/co2/ecoScore on read.

### 4. `GET /api/metrics`
Returns the totals object in the contract. Reads Redis counters, computes derived fields. This is what the dashboard polls.

### 5. Seed script + rehearsal (the demo lives or dies here)
- `scripts/seed.ts`: pre-upsert 3–4 Q&As so a HIT is guaranteed live.
- Hardcode + rehearse the two demo prompts: Alice asks A → MISS, Bob asks a near-paraphrase of A → HIT, dashboard ticks up. Remove all live randomness.

### 6. Deploy + own the merge
- Deploy to Vercel, set env in the dashboard.
- When friend's branch is ready: review, verify it hits the real `/api/ask` + `/api/metrics` (not the mock), merge, redeploy.

## Frozen API contract

**`POST /api/ask`**
```jsonc
// request
{ "prompt": "string", "author": "string" }
// response
{
  "answer": "string",
  "cacheHit": true,
  "score": 0.94,                       // null on miss
  "source": { "author": "Alice", "ts": 1718200000000, "prompt": "..." }, // null on miss
  "metrics": { /* same shape as /api/metrics, for convenience */ }
}
```

**`GET /api/metrics`**
```jsonc
{
  "requests": 12,
  "promptsAvoided": 5,
  "cacheHitRate": 0.42,    // 0..1
  "tokensSaved": 4100,
  "energyKwh": 0.0012,
  "waterL": 0.0022,
  "co2g": 0.49,
  "ecoScore": 91          // 0..100
}
```
Field names are the integration boundary. If you rename one, tell your friend before pushing.

## Suggested order
Scaffold → push `main` → `/api/ask` → metrics + `/api/metrics` → seed → deploy → merge UI.
