# NICO — Cross-Agent Gateway (Claude Code + Codex)

Your half is no longer a custom `/api/ask` an extension calls — it's a **model-API gateway** that both agents point their base URL at. The gateway is the merge point: it sees every request, embeds the prompt, checks one shared repo-scoped semantic cache, and on a hit returns a completion *in that provider's own wire format without calling the upstream model*. That's where the actual inference avoidance (and the green claim) comes from. Same embed→cache→serve-or-forward logic as before, just shaped as a proxy. The `recordUsage` boundary to your friend is **unchanged**.

## Stack
Node/TS gateway · OpenAI `text-embedding-3-small` · Upstash Vector (shared cache) · Upstash Redis (session/roster). Use **LiteLLM (pinned version — see security note) as the upstream translation/routing layer** so you only forward in one normalized shape; put your cache proxy in front of it.

## What the gateway does (per request)
1. **Inbound** — expose two routes:
   - `POST /v1/messages` (Anthropic Messages) ← Claude Code
   - `POST /v1/chat/completions` (OpenAI Chat Completions) ← Codex
2. **Normalize** — extract the user prompt text, model, and a `repoId` (from a header you set in each agent's config).
3. **Tier the request** — informational Q&A is cache-eligible; **code-generation requests bypass the cache for the MVP** (always forward). Cross-model reuse of generated code is the thing that bites you (a Claude answer served to a Codex user is a different model's output). Start with a simple heuristic/flag; refine later.
4. **Embed + query** the shared vector store, namespaced by `repoId`.
5. **HIT** (score ≥ 0.90, informational): build a response object **in the same wire format the request arrived in**, stream it back as synthetic SSE, no upstream call. `recordUsage({cacheHit:true, tokens: match.answerTokens, ...})`.
6. **MISS**: forward through LiteLLM to the real upstream, stream the response straight back to the client, then upsert `{prompt, answer, embedding, author, ts, answerTokens}`. `recordUsage({cacheHit:false, tokens: spent, ...})`.

## Pointing the agents at you
- **Claude Code**: set `ANTHROPIC_BASE_URL` to your gateway (env block in `~/.claude/settings.json`). It speaks Anthropic Messages natively.
- **Codex**: set a **user/system-level** `config.toml` model provider/base_url to your gateway. (Project-local config can't override `openai_base_url`/`model_provider` for security — must be user level.)
- Pass `repoId` + `author` as custom headers from each config so the gateway can namespace and attribute.

## Gotchas to build around
- **Stream or it hangs**: cache hits must be emitted as proper SSE; never buffer the body. Pipe upstream responses straight through.
- **Preserve tool-use IDs**: don't strip unknown fields when translating — multi-turn tool use breaks otherwise.
- **Base URL is read once at process start** — no live reload. Fine for the demo; just restart the agent after config changes.
- **Trailing-slash 404s**: test the base URL both with and without a trailing slash.
- **Security**: pin your LiteLLM version — two past releases shipped credential-stealing malware. Don't float `latest`.

## Demo (this is the money shot — cross-agent reuse, live)
Pre-warm the cache via `scripts/seed.ts`. Then:
1. **Alice in Claude Code** asks question A → MISS, gateway forwards + stores.
2. **Bob in Codex** asks a near-paraphrase of A → **HIT served from Alice's answer**, no model call, dashboard ticks up.
Hardcode + rehearse those two prompts. Different agents, one shared answer — that's the whole pitch in ten seconds.

## Frozen contract — usage event (unchanged)
```ts
type UsageEvent = {
  cacheHit: boolean;   // true = work avoided
  tokens: number;      // answer tokens — saved if hit, spent if miss
  model: string;
  author: string;
  ts: number;          // epoch ms
};
// friend implements:  recordUsage(e: UsageEvent): Promise<void>
```

## Suggested order
Stand up LiteLLM passthrough (no cache) → confirm Claude Code + Codex both route through it → add `/v1/messages` + `/v1/chat/completions` cache layer → tiering + SSE for hits → recordUsage calls → seed → rehearse cross-agent demo.
