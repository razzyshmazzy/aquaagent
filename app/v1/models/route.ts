export const runtime = "nodejs";

// Minimal stub. Some clients (notably Codex) GET /v1/models on startup to
// validate the base URL / populate a model picker. We return an OpenAI-style
// list so that probe succeeds; the cache/forward logic lives on the POST routes.
export async function GET() {
  const created = Math.floor(Date.now() / 1000);
  const ids = ["gpt-4o-mini", "gpt-4o", "claude-opus-4-8", "claude-sonnet-4-6"];
  return Response.json({
    object: "list",
    data: ids.map((id) => ({ id, object: "model", created, owned_by: "carbo" })),
  });
}
