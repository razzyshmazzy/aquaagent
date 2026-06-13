# Pointing agents at the ZenFlow gateway

Two layers. Use one or both.

## A. Per-user (recommended) — `npm run zenflow:setup`

Each developer runs this once per clone:

```
npm run zenflow:setup                         # gateway = http://localhost:3000
npm run zenflow:setup -- --url https://your-gateway.vercel.app
```

It writes `.claude/settings.local.json` (gitignored) so Claude Code routes
through the gateway with **their own** GitHub login as `x-zenflow-author`
(derived from `gh`/`git`), and the repo id from the git remote. It also prints
the Codex `~/.codex/config.toml` block to paste (Codex can't be configured
per-repo — must be user-level). Restart the agent afterward.

This is the real "works for whoever is committing" answer: per-user identity,
nothing about one person committed to the repo.

## B. Repo-wide Claude Code routing (optional, zero-setup)

To route *every* Claude Code user in this repo through the gateway without them
running anything, commit a `.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://REPLACE_WITH_YOUR_GATEWAY_DOMAIN"
  }
}
```

> **You must create this file yourself** — a coding agent is sandboxed from
> writing its own `ANTHROPIC_BASE_URL` (it would reroute the running session).
> Replace the placeholder with your real Vercel domain **before committing**, or
> it will break Claude Code routing for anyone who clones.

Caveats:
- This sets the **base URL only**. Attribution still needs each dev's
  `x-zenflow-author`, so pair it with `npm run zenflow:setup` (layer A) for
  per-user savings — otherwise usage lands under `anon`.
- **Codex is unaffected** by this file (user-level config only — layer A).

## ⚠ Trust note

Committing a base URL reroutes every contributor's Claude Code traffic — their
prompts and their API credentials pass through your gateway (which forwards
them upstream with the user's own key). Fine for a known team; think twice for a
public or cross-org repo, and tell contributors.
