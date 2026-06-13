import { handle } from "@/lib/gateway/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anthropic Messages endpoint — Claude Code points ANTHROPIC_BASE_URL here.
export async function POST(req: Request) {
  return handle("anthropic", req);
}
