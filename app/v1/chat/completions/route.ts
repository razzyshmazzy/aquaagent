import { handle } from "@/lib/gateway/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OpenAI Chat Completions endpoint — Codex points its base_url here.
export async function POST(req: Request) {
  return handle("openai", req);
}
