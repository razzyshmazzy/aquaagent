# AquaAgent Gateway

AquaAgent is a **cross-agent model gateway**. Claude Code and Codex point their base
URL at it. For short informational questions it serves a cached answer **in the
caller's own wire format without calling the upstream model** — that avoided
inference is the green claim. Code/agent traffic bypasses the cache and forwards
transparently.

The pitch, live: **Alice asks a question in Claude Code → MISS (forwarded +
cached). Bob asks a paraphrase in Codex → HIT, served from Alice's answer, no
model call, the dashboard ticks up.** Different agents, one shared answer.

## Endpoints

| Route | Format | Caller |
|---|---|---|
| `POST /v1/messages` | Anthropic Messages | Claude Code |
| `POST /v1/chat/completions` | OpenAI Chat Completions | Codex |
| `GET /v1/models` | OpenAI list (stub) | client probes |
| `GET /api/metrics` | metrics totals | dashboard |

## How it works (per request)

1. **Normalize** — pull the latest user message text, model, and `repoId` /
   `author` (from headers).
2. **Tier** — only short natural-language questions are cache-eligible. Anything
   with tools, a code fence, or over ~400 chars **bypasses** and forwards
   untouched (so generated code is never reused across questions).
3. **Cacheable path** — embed the prompt, query the shared cache in the repo's
   namespace:
   - **HIT** (cosine ≥ 0.90): synthesize the answer in the caller's wire format
     (streaming SSE or JSON), no upstream call.
   - **MISS**: forward to the real provider, cache the answer, return it.
4. Every cacheable request emits a `UsageEvent` to the metrics half via
   `recordUsage` → the dashboard.

**Credentials:** the gateway forwards *the client's own* upstream key
(`x-api-key` / `Authorization`) on a miss — it holds no provider keys for
forwarding. It uses its own `OPENAI_API_KEY` only for embeddings.

## Request scoping (headers)

| Header | Default | Purpose |
|---|---|---|
| `x-carbo-repo` | `default` | The shared cache namespace. **Both agents must use the same value to share answers.** |
| `x-carbo-author` | `anon` | Attribution on the stored answer. |
| `x-carbo-cache` | — | `on` / `off` to force the tiering decision. |

The `default` repo means **the demo works with zero header config** — both agents
share one namespace out of the box.

## Point the agents at the gateway

Run the gateway: `npm run dev` (→ `http://localhost:3000`). Then:

### Claude Code (`~/.claude/settings.json`)
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:3000",
    "ANTHROPIC_CUSTOM_HEADERS": "x-carbo-repo: demo\nx-carbo-author: Alice"
  }
}
```
Claude Code appends `/v1/messages` to `ANTHROPIC_BASE_URL` and forwards its own
Anthropic credential. The custom-headers line is optional (the `default` repo
works without it) — drop it if your build doesn't support `ANTHROPIC_CUSTOM_HEADERS`.
The base URL is read once at startup — **restart Claude Code after editing**.

### Codex (`~/.codex/config.toml`, user-level)
```toml
model = "gpt-4o-mini"
model_provider = "carbo"

[model_providers.carbo]
name = "AquaAgent"
base_url = "http://localhost:3000/v1"
wire_api = "chat"
env_key = "OPENAI_API_KEY"
http_headers = { "x-carbo-repo" = "demo", "x-carbo-author" = "Bob" }
```
Codex appends `/chat/completions` to `base_url` and forwards `OPENAI_API_KEY`.
Project-local config can't override the provider/base_url for security — this
**must** be user-level. Restart Codex after editing.

> Set the **same** `x-carbo-repo` on both agents (or omit on both to share
> `default`) so a question asked in one agent can be served to the other.

## Demo (rehearsed)

```bash
npm run seed -- --flush   # clean slate: wipe the demo namespace + counters, reseed
npm run dev
```

1. **Alice in Claude Code** asks _"What are the main benefits of caching API
   responses?"_ → **MISS**, forwarded to Anthropic, answer cached.
2. **Bob in Codex** asks _"Why is it useful to cache responses from an API?"_ →
   **HIT** (~0.92), served from Alice's answer with no model call.
3. The dashboard (`GET /api/metrics`) ticks: requests↑, promptsAvoided↑,
   tokensSaved↑.

## Test without the agents (curl)

The cross-agent reuse is provable with curl alone — store via one format, serve
via the other:

```bash
# 1) Anthropic MISS — caches the answer (uses your real ANTHROPIC_API_KEY)
curl -s http://localhost:3000/v1/messages \
  -H 'content-type: application/json' \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H 'anthropic-version: 2023-06-01' \
  -H 'x-carbo-repo: demo' -H 'x-carbo-author: Alice' \
  -d '{"model":"claude-opus-4-8","max_tokens":1024,"messages":[
       {"role":"user","content":"What are the main benefits of caching API responses?"}]}'

# 2) OpenAI HIT — same question, paraphrased, served from Alice's answer (no upstream call)
curl -s http://localhost:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $OPENAI_API_KEY" \
  -H 'x-carbo-repo: demo' -H 'x-carbo-author: Bob' \
  -d '{"model":"gpt-4o-mini","messages":[
       {"role":"user","content":"Why is it useful to cache responses from an API?"}]}'

# 3) Metrics ticked up
curl -s http://localhost:3000/api/metrics
```

Add `"stream": true` to either body to get the provider's streaming SSE form.
