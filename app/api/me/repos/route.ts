import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { interactions } from "@/lib/db/schema";
import { requireLogin } from "@/lib/me";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/repos — distinct repos the signed-in user has interactions in,
// each with totals.
export async function GET() {
  const a = await requireLogin();
  if (a instanceof Response) return a;

  const rows = await getDb()
    .select({
      repoId: interactions.repoId,
      count: sql<number>`count(*)::int`,
      waterSavedL: sql<number>`coalesce(sum(${interactions.waterSavedL}), 0)`,
      energySavedKwh: sql<number>`coalesce(sum(${interactions.energySavedKwh}), 0)`,
    })
    .from(interactions)
    .where(eq(interactions.authorLogin, a.login))
    .groupBy(interactions.repoId)
    .orderBy(interactions.repoId);

  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}
