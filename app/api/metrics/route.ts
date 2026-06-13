import { getMetrics } from "@/lib/metrics";

export const runtime = "nodejs";

// GET /api/metrics — totals the dashboard polls. Reads Redis counters and
// computes the derived sustainability fields.
export async function GET() {
  const metrics = await getMetrics();
  return Response.json(metrics, {
    // Always fresh — the dashboard polls this.
    headers: { "Cache-Control": "no-store" },
  });
}
