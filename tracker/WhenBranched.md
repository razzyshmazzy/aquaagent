# WhenBranched — guide for the Metrics dev

Hey! Nico built the backend skeleton and pushed it to `main`. You own the
**metrics + sustainability dashboard**. This doc is everything you need to start.
You're using Copilot — there's a ready-to-paste primer for it at the bottom.

## 0. The one rule

There is exactly **one seam** between your code and Nico's: two functions and two
shapes in `lib/metrics.ts`. Keep these signatures identical and we never conflict:

```ts
// You implement / own these. /api/ask calls them on every request.
export type UsageEvent = {
  cacheHit: boolean;   // true = a cached answer was reused (work avoided)
  tokens: number;      // answer tokens — "saved" if hit, "spent" if miss
  model: string;       // e.g. "gpt-4o-mini"
  author: string;      // who asked
  ts: number;          // epoch ms
};

export async function recordUsage(e: UsageEvent): Promise<void>   // called on every ask
export async function getMetrics(): Promise<Metrics>              // read by /api/metrics + /api/ask

export type Metrics = {
  requests: number;
  promptsAvoided: number;
  cacheHitRate: number;   // 0..1
  tokensSaved: number;
  energyKwh: number;
  waterL: number;
  co2g: number;
  ecoScore: number;       // 0..100
};
```

If you want to **rename a field or change a signature, message Nico first** — it
breaks `/api/ask`.

## 1. Get set up

```bash
git clone https://github.com/razzyshmazzy/carbo.git
cd carbo
npm install
cp .env.example .env.local      # then fill in the keys (ask Nico for them)
npm run seed                    # populate the cache
npm run dev                     # http://localhost:3000
```

The Upstash Vector index must be **dimension 1536, cosine** (Nico's already set
this up; just need the same keys).

## 2. Make your branch

```bash
git checkout main
git pull
git checkout -b metrics         # your branch
```

Do all your work here. When it's ready, push and open a PR into `main`
(`git push -u origin metrics`). Nico reviews, wires it in, and redeploys.

## 3. What's yours vs. Nico's

**Yours — edit freely:**
- `lib/metrics.ts` — `recordUsage`, `getMetrics`, the energy/water/CO₂ constants,
  the `ecoScore` formula. Tune the constants (keep them cited) and the score curve.
- `app/api/metrics/route.ts` — the GET endpoint the dashboard polls.
- The **dashboard UI** (e.g. `app/page.tsx` or a new component) — build the live
  view that polls `GET /api/metrics` and shows requests, prompts avoided, tokens
  saved, energy/water/CO₂, and the eco score.

**Nico's — don't edit (it calls your code):**
- `app/api/ask/route.ts` — embed → vector query → HIT/MISS → `recordUsage()`.
- `lib/clients.ts`, `lib/constants.ts`, `lib/tokens.ts`, `scripts/seed.ts`.

## 4. How the two halves connect

On **every** ask, `app/api/ask/route.ts` does:

```ts
await recordUsage({ cacheHit, tokens, model: "gpt-4o-mini", author, ts: Date.now() });
const metrics = await getMetrics();   // returned to the UI for convenience
```

So as long as `recordUsage` and `getMetrics` keep their signatures, the ask route
keeps working no matter how you change the math inside.

Current counters live in Redis under `carbo:requests`, `carbo:hits`,
`carbo:tokensSaved`. Nico left a **working baseline** in `lib/metrics.ts` so the
demo runs today — your job is to make it accurate and the dashboard great. You can
keep the Redis approach or extend it (e.g. also track total tokens spent); just
don't break the two exported functions.

## 5. Test your work

```bash
npm run seed -- --flush         # clean slate: wipe cache + counters, reseed
npm run dev
```

Then drive it (UI or curl) and watch `/api/metrics`:

```bash
# MISS (first time) — caches the answer
curl -s -X POST localhost:3000/api/ask -H 'Content-Type: application/json' \
  -d '{"prompt":"What are the main benefits of caching API responses?","author":"Alice"}'

# HIT (paraphrase) — should reuse, ~0.92 similarity, metrics tick up
curl -s -X POST localhost:3000/api/ask -H 'Content-Type: application/json' \
  -d '{"prompt":"Why is it useful to cache responses from an API?","author":"Bob"}'

curl -s localhost:3000/api/metrics
```

This is the rehearsed demo pair: Alice MISS → Bob HIT → dashboard ticks up.

## 6. Copilot primer (paste this into a Copilot chat in the repo)

> I'm working on the AquaAgent repo on the `metrics` branch. I own `lib/metrics.ts`,
> `app/api/metrics/route.ts`, and the dashboard UI. There's a frozen contract I
> must NOT break: `recordUsage(e: UsageEvent): Promise<void>` and
> `getMetrics(): Promise<Metrics>`, with `UsageEvent = { cacheHit, tokens, model,
> author, ts }` and `Metrics = { requests, promptsAvoided, cacheHitRate,
> tokensSaved, energyKwh, waterL, co2g, ecoScore }`. Field names are an
> integration boundary — never rename them. `/api/ask` (owned by a teammate, do
> not edit) calls `recordUsage` on every request and `getMetrics` to read totals.
> Counters are in Upstash Redis under `carbo:requests`, `carbo:hits`,
> `carbo:tokensSaved`. Help me improve the sustainability math and build a polished
> live dashboard that polls `GET /api/metrics`.

## 7. Merge checklist (for the PR)

- [ ] `recordUsage` / `getMetrics` signatures unchanged; `Metrics` field names unchanged.
- [ ] `npx tsc --noEmit` and `npm run lint` pass.
- [ ] Dashboard polls the **real** `/api/metrics` (not a mock).
- [ ] The Alice→Bob demo makes the numbers move.
