# Gateway ↔ Tracker integration notes (from Nico)

Quick reconciliation between the gateway (mine, now on `main`) and your
`TEAMMATE_TRACKER.md`. Your doc is the spec for your half — these are just the
integration facts it doesn't cover.

## The seam is exactly one function

The gateway's **only** dependency on your code is `recordUsage(e: UsageEvent)`.
It does **not** call `getMetrics()` — the gateway returns provider-native
responses, not metrics. So:

- The `UsageEvent` you receive is frozen and is exactly what the gateway emits:
  `{ cacheHit, tokens, model, author, ts }`. ✅ matches your doc.
- The **entire `/api/metrics` response shape is yours** — expand it however you
  like (`tokensSpent`, `energySpentKwh`, `latest`, …). The gateway never reads
  it, so you can't break me by changing it. Build against synthetic events as
  planned; you're not blocked on me.

`lib/metrics.ts` on `main` is a minimal baseline I wrote so the gateway compiles
and runs. **It's yours — overwrite it** (and add `lib/sustainability.ts`) with
your real conversion engine. Just keep the `recordUsage(UsageEvent)` signature.

## Test against the real gateway (optional, once you want it)

```
npm run seed -- --flush     # populate the shared cache
npm run dev                 # gateway + your /api/metrics on :3000
```
- Anthropic format: `POST /v1/messages`  ·  OpenAI format: `POST /v1/chat/completions`
- A short informational question is cache-eligible; ask it once (MISS, your
  `tokensSpent`/`requests` tick), ask a paraphrase (HIT, your `tokensSaved`/
  `promptsAvoided` tick). See `GATEWAY.md` for curl examples and agent config.

## One scope caveat for "spent"

The gateway records a `UsageEvent` **only for the cacheable (informational)
path** — both hits and misses. **Code/agent traffic bypasses the cache and is
not recorded** (parsing token usage out of streamed tool-use responses was out
of MVP scope). So:

- `tokensSaved` / hits = the story, fully represented. ✅
- `tokensSpent` = informational **misses only**, not bulk code-gen traffic. Your
  "spent" number will look small relative to real agent usage.

For the demo (informational Q&A reuse) this is coherent — saved and spent both
come from the same path. If you want `spent` to reflect *all* traffic, ping me
and I'll record bypass usage too (a small gateway change). Your per-prompt
display adapters compute their number locally from each agent's own token
counts, so those are unaffected by this regardless.
