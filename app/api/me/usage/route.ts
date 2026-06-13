import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";
import { requireLogin } from "@/lib/me";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/usage — the signed-in user's locally-reported usage, totaled per
// repo, with grand totals on top. Scoped to their GitHub login.
export async function GET() {
  const a = await requireLogin();
  if (a instanceof Response) return a;

  const repos = await getDb()
    .select({
      repoId: usageEvents.repoId,
      turns: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${usageEvents.tokens}), 0)::int`,
      waterL: sql<number>`coalesce(sum(${usageEvents.waterL}), 0)`,
      energyKwh: sql<number>`coalesce(sum(${usageEvents.energyKwh}), 0)`,
      co2G: sql<number>`coalesce(sum(${usageEvents.co2G}), 0)`,
    })
    .from(usageEvents)
    .where(eq(usageEvents.authorLogin, a.login))
    .groupBy(usageEvents.repoId)
    .orderBy(usageEvents.repoId);

  const totals = repos.reduce(
    (acc, r) => ({
      turns: acc.turns + r.turns,
      tokens: acc.tokens + r.tokens,
      waterL: acc.waterL + r.waterL,
      energyKwh: acc.energyKwh + r.energyKwh,
      co2G: acc.co2G + r.co2G,
    }),
    { turns: 0, tokens: 0, waterL: 0, energyKwh: 0, co2G: 0 }
  );

  return Response.json(
    { totals, repos },
    { headers: { "Cache-Control": "no-store" } }
  );
}
