import { getDb } from "./index";
import { users, interactions, usageEvents } from "./schema";
import {
  computeSustainability,
  tokensToKwh,
  WATER_L_PER_KWH,
  CO2_G_PER_KWH,
} from "@/lib/sustainability";

export type PersistInput = {
  id: string;
  repoId: string;
  author: string; // GitHub login
  avatarUrl?: string | null;
  prompt: string;
  answer: string;
  model: string;
  cacheHit: boolean;
  tokens: number;
  matchedInteractionId: string | null;
};

// Insert one attributed interaction row. Savings are the full converted cost on
// a hit, 0 on a miss (computed via the shared sustainability constants). Ensures
// the author's users row exists first to satisfy the FK.
//
// Call this OFF the request hot path (Next `after()` / fire-and-forget) — it
// must never block or delay the streamed gateway response.
export async function persistInteraction(input: PersistInput): Promise<void> {
  const db = getDb();

  const s = input.cacheHit
    ? computeSustainability(input.tokens, 0) // hit: full savings
    : computeSustainability(0, input.tokens); // miss: zero saved

  await db
    .insert(users)
    .values({ githubLogin: input.author, avatarUrl: input.avatarUrl ?? null })
    .onConflictDoNothing();

  await db.insert(interactions).values({
    id: input.id,
    repoId: input.repoId,
    authorLogin: input.author,
    prompt: input.prompt,
    answer: input.answer,
    model: input.model,
    cacheHit: input.cacheHit,
    tokens: input.tokens,
    waterSavedL: s.waterSavedL,
    energySavedKwh: s.energySavedKwh,
    co2SavedG: s.co2SavedG,
    matchedInteractionId: input.matchedInteractionId,
  });
}

export type UsageReport = {
  id: string;
  author: string; // GitHub login
  repo: string;
  tokens: number;
  model?: string | null;
};

// Record one locally-computed usage report (from the statusline), attributed to
// the developer's GitHub login. Kept separate from the gateway's cache-savings
// metrics so it never skews the cache-hit rate.
export async function recordUsageEvent(r: UsageReport): Promise<void> {
  const db = getDb();
  const kwh = tokensToKwh(r.tokens);

  await db
    .insert(users)
    .values({ githubLogin: r.author })
    .onConflictDoNothing();

  await db.insert(usageEvents).values({
    id: r.id,
    authorLogin: r.author,
    repoId: r.repo,
    tokens: r.tokens,
    waterL: kwh * WATER_L_PER_KWH,
    energyKwh: kwh,
    co2G: kwh * CO2_G_PER_KWH,
    model: r.model ?? null,
  });
}

// Best-effort user upsert (used at OAuth sign-in to capture avatar_url).
export async function upsertUser(
  githubLogin: string,
  avatarUrl?: string | null
): Promise<void> {
  const db = getDb();
  await db
    .insert(users)
    .values({ githubLogin, avatarUrl: avatarUrl ?? null })
    .onConflictDoUpdate({
      target: users.githubLogin,
      set: { avatarUrl: avatarUrl ?? null },
    });
}
