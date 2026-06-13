/**
 * Seed Postgres with a couple of users + interactions so the /api/me/* endpoints
 * return data without a live gateway run.
 *
 *   npm run db:push   # create tables first (once)
 *   npm run db:seed
 *
 * Env is loaded via tsx's --env-file=.env.local (see package.json).
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/db";
import { users, interactions } from "../lib/db/schema";
import { computeSustainability } from "../lib/sustainability";

type Row = {
  id: string;
  repoId: string;
  author: string;
  prompt: string;
  answer: string;
  model: string;
  cacheHit: boolean;
  tokens: number;
  matchedInteractionId: string | null;
  ageMin: number; // minutes ago, for deterministic ordering
};

async function main() {
  const db = getDb();

  // Clean slate so the demo data is predictable.
  await db.delete(interactions);
  await db.delete(users);

  const SEED_USERS = [
    { githubLogin: "alice", avatarUrl: "https://github.com/alice.png" },
    { githubLogin: "bob", avatarUrl: "https://github.com/bob.png" },
  ];
  await db.insert(users).values(SEED_USERS);

  // Stable ids so hits can reference their source row.
  const aliceMiss = randomUUID();
  const bobMiss = randomUUID();

  const rows: Row[] = [
    // alice — acme/web: a miss that seeds the cache, then a reuse of it.
    {
      id: aliceMiss,
      repoId: "acme/web",
      author: "alice",
      prompt: "What are the benefits of caching API responses?",
      answer: "Lower latency, less load, and fewer redundant model calls.",
      model: "gpt-4o-mini",
      cacheHit: false,
      tokens: 140,
      matchedInteractionId: null,
      ageMin: 60,
    },
    {
      id: randomUUID(),
      repoId: "acme/web",
      author: "alice",
      prompt: "Why is it useful to cache responses from an API?",
      answer: "Lower latency, less load, and fewer redundant model calls.",
      model: "claude-opus-4-8",
      cacheHit: true,
      tokens: 140,
      matchedInteractionId: aliceMiss,
      ageMin: 45,
    },
    // alice — acme/api: a second repo so /api/me/repos shows more than one.
    {
      id: randomUUID(),
      repoId: "acme/api",
      author: "alice",
      prompt: "How does HTTPS keep a connection secure?",
      answer: "TLS handshake, certificate trust, then encrypted+authenticated traffic.",
      model: "claude-opus-4-8",
      cacheHit: true,
      tokens: 90,
      matchedInteractionId: bobMiss,
      ageMin: 30,
    },
    // bob — his own data; alice must never see these.
    {
      id: bobMiss,
      repoId: "acme/api",
      author: "bob",
      prompt: "Explain how HTTPS secures a connection.",
      answer: "TLS handshake, certificate trust, then encrypted+authenticated traffic.",
      model: "gpt-4o-mini",
      cacheHit: false,
      tokens: 90,
      matchedInteractionId: null,
      ageMin: 90,
    },
    {
      id: randomUUID(),
      repoId: "acme/api",
      author: "bob",
      prompt: "What is photosynthesis?",
      answer: "Plants convert sunlight, water, and CO2 into glucose and oxygen.",
      model: "gpt-4o-mini",
      cacheHit: false,
      tokens: 56,
      matchedInteractionId: null,
      ageMin: 20,
    },
  ];

  for (const r of rows) {
    const s = r.cacheHit
      ? computeSustainability(r.tokens, 0)
      : computeSustainability(0, r.tokens);
    await db.insert(interactions).values({
      id: r.id,
      repoId: r.repoId,
      authorLogin: r.author,
      prompt: r.prompt,
      answer: r.answer,
      model: r.model,
      cacheHit: r.cacheHit,
      tokens: r.tokens,
      waterSavedL: s.waterSavedL,
      energySavedKwh: s.energySavedKwh,
      co2SavedG: s.co2SavedG,
      matchedInteractionId: r.matchedInteractionId,
      createdAt: new Date(Date.now() - r.ageMin * 60_000),
    });
  }

  console.log(`✓ seeded ${SEED_USERS.length} users, ${rows.length} interactions`);
  console.log("  alice: 3 interactions across acme/web + acme/api (2 hits)");
  console.log("  bob:   2 interactions in acme/api");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
