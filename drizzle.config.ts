import type { Config } from "drizzle-kit";

// `npm run db:push` creates/updates the Neon tables from lib/db/schema.ts.
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;
