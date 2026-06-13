import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { interactions } from "@/lib/db/schema";
import { requireLogin } from "@/lib/me";
import { truncate } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/sessions?repo=<id> — the signed-in user's interactions in a repo,
// newest first.
export async function GET(req: Request) {
  const a = await requireLogin();
  if (a instanceof Response) return a;

  const repo = new URL(req.url).searchParams.get("repo");
  if (!repo) {
    return Response.json(
      { error: "`repo` query parameter is required" },
      { status: 400 }
    );
  }

  const rows = await getDb()
    .select({
      id: interactions.id,
      prompt: interactions.prompt,
      cacheHit: interactions.cacheHit,
      waterSavedL: interactions.waterSavedL,
      energySavedKwh: interactions.energySavedKwh,
      model: interactions.model,
      createdAt: interactions.createdAt,
    })
    .from(interactions)
    .where(and(eq(interactions.authorLogin, a.login), eq(interactions.repoId, repo)))
    .orderBy(desc(interactions.createdAt))
    .limit(200);

  const items = rows.map((r) => ({ ...r, prompt: truncate(r.prompt) }));
  return Response.json(items, { headers: { "Cache-Control": "no-store" } });
}
