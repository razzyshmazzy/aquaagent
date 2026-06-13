# Personalization — auth + per-user/per-repo history

Adds GitHub sign-in and a durable Postgres record so the dashboard can show a
user's own coding sessions (grouped by repo) and the specific cache reuses that
saved them water. The Redis counters and Upstash Vector cache are unchanged —
Postgres is the queryable, attributed history alongside them.

## Setup

1. **Neon** (Vercel Marketplace → Neon, or neon.tech). Put the pooled
   connection string in `.env.local` as `DATABASE_URL`.
2. **GitHub OAuth App** (Settings → Developer settings → OAuth Apps):
   - Homepage: `http://localhost:3000`
   - Callback: `http://localhost:3000/api/auth/callback/github`
   - Put the client id/secret in `.env.local` as `AUTH_GITHUB_ID` /
     `AUTH_GITHUB_SECRET`, and set `AUTH_SECRET` (`npx auth secret`).
3. Create tables and seed demo data:
   ```
   npm run db:push     # creates users + interactions from lib/db/schema.ts
   npm run db:seed      # inserts alice + bob with sample interactions
   npm run dev
   ```
4. Sign in at `http://localhost:3000/api/auth/signin`.

## How it fits together

- Each agent sends `x-zenflow-author` (the dev's GitHub login) and
  `x-zenflow-repo` (repo id). (`x-carbo-*` still accepted as a fallback.)
- On every cache hit/miss the gateway writes one `interactions` row attributed
  to that author/repo — **after the response is flushed** (`next/server`'s
  `after()`), so streaming and latency are unchanged. Savings are the full
  converted cost on a hit, 0 on a miss; on a hit `matched_interaction_id` points
  at the row whose answer was reused (carried through the vector metadata).
- The read endpoints below resolve the signed-in user's GitHub login via
  Auth.js and scope every query to it — a user only ever sees their own data.

## Endpoints (auth-protected; 401 if not signed in)

| Endpoint | Returns |
|---|---|
| `GET /api/me/repos` | `[{ repoId, count, waterSavedL, energySavedKwh }]` — distinct repos with totals |
| `GET /api/me/sessions?repo=<id>` | `[{ id, prompt (≤140), cacheHit, waterSavedL, energySavedKwh, model, createdAt }]` newest first |
| `GET /api/me/savings` | `{ totalWaterSavedL, totalEnergySavedKwh, count, items: [{ id, prompt, waterSavedL, energySavedKwh, matchedFrom: { author, prompt } \| null, createdAt }] }` — only cache-hit rows with water saved |
| `GET /api/me/usage` | `{ totals, repos: [{ repoId, turns, tokens, waterL, energyKwh, co2G }] }` — locally-reported per-turn usage, totaled per repo |

## Local usage reporting (no gateway routing)

`POST /api/usage` ingests per-turn usage computed locally by the statusline
(`{ author, repo, tokens, model? }`), stored under `author` in the `usage_events`
table — kept separate from the gateway's cache-savings metrics so it never skews
the cache-hit rate. Optional shared secret via `CARBO_INGEST_SECRET` +
`x-carbo-ingest-secret` header. See `ZENFLOW_SETUP.md` §C for the statusline
config that drives it. (Author is taken on trust — add per-user ingest tokens
before exposing publicly.)

## Acceptance check

After `db:seed`, sign in as a user whose GitHub login is `alice` (or insert your
own login via the gateway / seed) and:
```
curl --cookie "<your session cookie>" localhost:3000/api/me/repos
curl --cookie "<...>" "localhost:3000/api/me/sessions?repo=acme/web"
curl --cookie "<...>" localhost:3000/api/me/savings
```
You get only `alice`'s attributed rows — never `bob`'s. Prompts are truncated to
~140 chars; full prompts/answers are never logged to stdout.
