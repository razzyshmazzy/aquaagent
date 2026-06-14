import { sql, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { interactions } from "@/lib/db/schema";
import { getMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export async function GET() {
  const metrics = await getMetrics();

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Monthly water saved from cache hits (cumulative per month)
  let monthlyRows: { ym: string; waterSavedL: number; energySavedKwh: number }[] = [];
  try {
    monthlyRows = (await getDb()
      .select({
        ym: sql<string>`TO_CHAR(DATE_TRUNC('month', ${interactions.createdAt}), 'YYYY-MM')`,
        waterSavedL: sql<number>`COALESCE(SUM(${interactions.waterSavedL}), 0)`,
        energySavedKwh: sql<number>`COALESCE(SUM(${interactions.energySavedKwh}), 0)`,
      })
      .from(interactions)
      .where(gte(interactions.createdAt, sixMonthsAgo))
      .groupBy(sql`DATE_TRUNC('month', ${interactions.createdAt})`)
      .orderBy(sql`DATE_TRUNC('month', ${interactions.createdAt})`)) as typeof monthlyRows;
  } catch { /* DB unavailable — return zeros */ }

  const rowMap = new Map(monthlyRows.map(r => [r.ym, r]));
  const history = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = rowMap.get(ym);
    return {
      month: MONTH_ABBR[d.getMonth()],
      waterSavedL: Number(row?.waterSavedL ?? 0),
      energySavedKwh: Number(row?.energySavedKwh ?? 0),
    };
  });

  // Water saved in the last 7 days
  let weeklyGainL = 0;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const [row] = await getDb()
      .select({ v: sql<number>`COALESCE(SUM(${interactions.waterSavedL}), 0)` })
      .from(interactions)
      .where(gte(interactions.createdAt, sevenDaysAgo));
    weeklyGainL = Number(row?.v ?? 0);
  } catch { /* skip */ }

  return Response.json(
    { metrics, history, weeklyGainL },
    { headers: { "Cache-Control": "no-store" } }
  );
}
