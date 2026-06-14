# AquaAgent

A semantic answer cache that turns avoided LLM calls into a sustainability story.
Ask a question; if a near-identical one was asked before, we serve the cached
answer instead of regenerating — and tally the tokens, energy, water, and CO₂
saved.

Stack: Next.js (App Router, TS) · Vercel AI SDK · OpenAI `text-embedding-3-small`
+ `gpt-4o-mini` · Upstash Vector (similarity) · Upstash Redis (counters).

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in keys:
   - `OPENAI_API_KEY`
   - `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN`
     — **the Upstash Vector index must be dimension 1536, cosine similarity**
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
3. `npm run seed` to populate the cache (see below).
4. `npm run dev` → http://localhost:3000

## Seeding & demo prep

```bash
npm run seed              # upsert the seed Q&As
npm run seed -- --reset   # also zero the metric counters first
npm run seed -- --flush   # also wipe ALL cached vectors first (clean slate)
```

Before a live demo run `npm run seed -- --flush` for a clean slate. The rehearsed
demo pair is **not** seeded so the miss→hit transition happens on stage:

- **Alice** asks _"What are the main benefits of caching API responses?"_ → **MISS**
  (generates + caches).
- **Bob** asks _"Why is it useful to cache responses from an API?"_ → **HIT**
  (~0.92 similarity), dashboard ticks up.

Constants live in `lib/constants.ts`. The similarity threshold is `0.90`.

## API contract (frozen)

### `POST /api/ask`
```jsonc
// request
{ "prompt": "string", "author": "string" }
// response
{
  "answer": "string",
  "cacheHit": true,
  "score": 0.94,                                            // null on miss
  "source": { "author": "Alice", "ts": 1718200000000, "prompt": "..." }, // null on miss
  "metrics": { /* same shape as GET /api/metrics */ }
}
```

### `GET /api/metrics`
```jsonc
{
  "requests": 12,
  "promptsAvoided": 5,
  "cacheHitRate": 0.42,   // 0..1
  "tokensSaved": 4100,
  "energyKwh": 0.0012,
  "waterL": 0.0022,
  "co2g": 0.49,
  "ecoScore": 91          // 0..100
}
```

Field names are the integration boundary — don't rename without telling the UI owner.

## Layout

- `app/api/ask/route.ts` — embed → vector query → HIT (cached) or MISS (generate + upsert).
- `app/api/metrics/route.ts` — reads Redis counters, returns derived totals.
- `lib/metrics.ts` — Redis counters (`requests`, `hits`, `tokensSaved`) + derivation.
- `lib/constants.ts` — similarity threshold, models, sustainability constants (cited).
- `lib/clients.ts` — Upstash Vector / Redis / OpenAI clients.
- `scripts/seed.ts` — seed cache + rehearsed demo prompts.

## License

Open source under the [MIT License](LICENSE).
