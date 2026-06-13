import { and, desc, eq, gt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { interactions } from "@/lib/db/schema";
import { requireLogin } from "@/lib/me";
import { truncate } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/savings — the signed-in user's cache-hit reuses that saved water,
// newest first, each with the source row it reused, plus a summed total.
export async function GET() {
  const a = await requireLogin();
  if (a instanceof Response) return a;

  const src = alias(interactions, "src");

  const rows = await getDb()
    .select({
      id: interactions.id,
      prompt: interactions.prompt,
      waterSavedL: interactions.waterSavedL,
      energySavedKwh: interactions.energySavedKwh,
      createdAt: interactions.createdAt,
      matchedAuthor: src.authorLogin,
      matchedPrompt: src.prompt,
    })
    .from(interactions)
    .leftJoin(src, eq(interactions.matchedInteractionId, src.id))
    .where(
      and(
        eq(interactions.authorLogin, a.login),
        eq(interactions.cacheHit, true),
        gt(interactions.waterSavedL, 0)
      )
    )
    .orderBy(desc(interactions.createdAt));

  const items = rows.map((r) => ({
    id: r.id,
    prompt: truncate(r.prompt),
    waterSavedL: r.waterSavedL,
    energySavedKwh: r.energySavedKwh,
    matchedFrom: r.matchedAuthor
      ? { author: r.matchedAuthor, prompt: truncate(r.matchedPrompt ?? "") }
      : null,
    createdAt: r.createdAt,
  }));

  const totalWaterSavedL = items.reduce((s, x) => s + x.waterSavedL, 0);
  const totalEnergySavedKwh = items.reduce((s, x) => s + x.energySavedKwh, 0);

  return Response.json(
    { totalWaterSavedL, totalEnergySavedKwh, count: items.length, items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
