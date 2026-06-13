# TEAMMATE — Water & Electricity Tracking + Display (work on a branch)

> Rename to your name if you like. You own the **core sustainability feature**: turn usage events into live electricity (kWh) and water (L), surface a per-prompt number in each agent, and run the ZenScreen dashboard. Nico's gateway feeds you one `UsageEvent` per request via `recordUsage`. Build against synthetic events and you're never blocked on him. **Scope is Claude Code + Codex only — no VS Code/Copilot extension.**

## Git workflow
- Branch off `main` once Nico pushes the scaffold:
  ```
  git checkout main && git pull
  git checkout -b feat/usage-tracking
  ```
- Commit only on `feat/usage-tracking`; push often; PR when it works against synthetic events. Rebase on `main` if it moves.

## Stack
Next.js/TS app · Upstash Redis (counters) · React (dashboard). Plus two thin display adapters (below).

## Your tasks

### 1. `recordUsage(event)` — ingest (Nico calls this)
Increment Redis counters atomically; also stash the **latest** event so the per-prompt number is available:
```ts
export async function recordUsage(e: UsageEvent) {
  const p = redis.pipeline();
  p.incr("requests");
  if (e.cacheHit) { p.incr("hits"); p.incrby("tokensSaved", e.tokens); }
  else            { p.incrby("tokensSpent", e.tokens); }
  p.set("latest", JSON.stringify(e));
  await p.exec();
}
```
Drive it yourself with a synthetic event generator until Nico merges.

### 2. Conversion engine (`lib/sustainability.ts`) — the core
Derive electricity + water from tokens. Keep constants **labeled and cited** — sourced estimates beat impressive made-up numbers:
```ts
const WH_PER_1K_TOKENS = 0.3;  // estimate — cite a source
const WATER_L_PER_KWH  = 1.8;  // datacenter WUE — cite
const CO2_G_PER_KWH    = 400;  // grid intensity — cite, region-dependent
```
Track **saved vs spent** for both — "saved" is the story, "spent" makes it credible.

### 3. `GET /api/metrics`
Returns running totals **plus** the latest single event (for the per-prompt readout). Contract at the bottom.

### 4. Per-prompt display adapters (blue water / yellow electricity)
The live "this prompt cost X" number is computed **locally in each adapter** for instant feedback; the **accumulated cross-agent total** comes from `GET /api/metrics`.
- **Claude Code — statusline script.** Claude Code pipes a JSON blob to stdin every tick with cumulative token counts and cost. Diff the token counts to get the current prompt, run them through the same conversion constants, print with ANSI: blue for water, yellow for electricity. For click-to-see-total, wrap it in an OSC 8 hyperlink (works in iTerm2/Kitty/WezTerm) or ship a `/cost` slash command.
- **Codex — turn-stop hook.** On the stop event, read token usage from the hook context, convert, and print a colored summary line. No persistent footer like Claude Code's, so this prints once per turn.
Keep the conversion math in `lib/sustainability.ts` and import it into both adapters so the numbers always agree.

### 5. ZenScreen dashboard (`/dashboard`) — the visible deliverable
- Polls `/api/metrics` every **2s**.
- Headline cards: **water saved (L)** and **electricity saved (kWh)** front and center, plus cache-hit rate, prompts avoided, CO₂ avoided, eco-score, and a "last prompt" readout from `latest`.
- Animate numbers ticking up. Size for the actual ASUS ZenScreen (check resolution/orientation), high contrast, large type, fullscreen second display.

### 6. Polish
Loading + error states (never blank on stage if the API stalls).

## Frozen contract

**Event you receive (from Nico) — unchanged:**
```ts
type UsageEvent = {
  cacheHit: boolean;
  tokens: number;      // saved if hit, spent if miss
  model: string;
  author: string;
  ts: number;
};
```

**`GET /api/metrics` you return:**
```jsonc
{
  "requests": 12,
  "promptsAvoided": 5,
  "cacheHitRate": 0.42,
  "tokensSaved": 4100,
  "tokensSpent": 9000,
  "energySavedKwh": 0.0012,
  "energySpentKwh": 0.0027,
  "waterSavedL": 0.0022,
  "waterSpentL": 0.0049,
  "co2SavedG": 0.49,
  "ecoScore": 91,
  "latest": { "cacheHit": true, "tokens": 320, "model": "...", "author": "Bob", "ts": 1718200000000 }
}
```
Don't rename fields. Need a new one? Raise it with Nico — the contract is shared.

## Suggested order
`recordUsage` + synthetic generator → conversion engine → `/api/metrics` → Claude Code statusline adapter → Codex hook adapter → ZenScreen dashboard → swap synthetic for Nico's real events → PR.
