import { getDb } from "./index";
import { users, interactions } from "./schema";
import { computeSustainability } from "@/lib/sustainability";

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
