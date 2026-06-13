import { randomUUID } from "node:crypto";
import { recordUsageEvent } from "@/lib/db/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/usage — ingest one locally-computed usage report from a developer's
// agent (the statusline). Body: { author, repo, tokens, model? }. Stored under
// `author` (their GitHub login). If CARBO_INGEST_SECRET is set, callers must send
// it as the x-carbo-ingest-secret header.
//
// Note: the author is taken on trust (no per-user token). Fine for a known team;
// add per-user ingest tokens before exposing this publicly.
export async function POST(req: Request) {
  const secret = process.env.CARBO_INGEST_SECRET;
  if (secret && req.headers.get("x-carbo-ingest-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    author?: unknown;
    repo?: unknown;
    tokens?: unknown;
    model?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const author = typeof body.author === "string" ? body.author.trim() : "";
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const tokens =
    typeof body.tokens === "number" && Number.isFinite(body.tokens)
      ? Math.max(0, Math.floor(body.tokens))
      : NaN;
  const model = typeof body.model === "string" ? body.model : null;

  if (!author || !repo || !Number.isFinite(tokens)) {
    return Response.json(
      { error: "`author`, `repo`, and numeric `tokens` are required" },
      { status: 400 }
    );
  }
  if (tokens === 0) return Response.json({ ok: true, skipped: "zero tokens" });

  try {
    await recordUsageEvent({ id: randomUUID(), author, repo, tokens, model });
  } catch (err) {
    console.error(
      "[carbo] usage ingest failed:",
      err instanceof Error ? err.message : String(err)
    );
    return Response.json({ error: "ingest failed" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
