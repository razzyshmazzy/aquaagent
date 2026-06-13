import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// Durable, queryable record of attributed coding interactions. This is NOT a
// replacement for the Redis counters or the Upstash Vector cache — it's the
// per-user/per-repo history the personalized dashboard reads from.

export const users = pgTable("users", {
  githubLogin: text("github_login").primaryKey(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const interactions = pgTable(
  "interactions",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    authorLogin: text("author_login")
      .notNull()
      .references(() => users.githubLogin),
    prompt: text("prompt").notNull(),
    answer: text("answer").notNull(),
    model: text("model").notNull(),
    cacheHit: boolean("cache_hit").notNull(),
    tokens: integer("tokens").notNull(),
    // Savings: full converted cost on a cache hit, 0 on a miss.
    waterSavedL: doublePrecision("water_saved_l").notNull().default(0),
    energySavedKwh: doublePrecision("energy_saved_kwh").notNull().default(0),
    co2SavedG: doublePrecision("co2_saved_g").notNull().default(0),
    // On a hit, the interactions.id of the row whose answer was reused.
    matchedInteractionId: text("matched_interaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_interactions_author_repo_created").on(
      t.authorLogin,
      t.repoId,
      t.createdAt
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
