import { randomUUID } from "node:crypto";
import { ANTHROPIC_UPSTREAM, ANTHROPIC_VERSION } from "@/lib/constants";
import { estimateTokens } from "@/lib/tokens";
import { anthropicFrame, streamFrames, SSE_HEADERS } from "./sse";

function msgId(): string {
  return "msg_" + randomUUID().replace(/-/g, "");
}

// Forward the client's own Anthropic credentials + protocol headers upstream.
// The gateway never injects its own key on the forward path.
function upstreamHeaders(inbound: Headers): Headers {
  const h = new Headers({ "content-type": "application/json" });
  const apiKey = inbound.get("x-api-key");
  const auth = inbound.get("authorization");
  if (apiKey) h.set("x-api-key", apiKey);
  if (auth) h.set("authorization", auth);
  h.set("anthropic-version", inbound.get("anthropic-version") || ANTHROPIC_VERSION);
  const beta = inbound.get("anthropic-beta");
  if (beta) h.set("anthropic-beta", beta);
  return h;
}

// Build an Anthropic Messages response (streaming SSE or JSON) from plain
// answer text — used for both cache hits and forwarded cacheable misses.
export function synthesize(
  text: string,
  model: string,
  stream: boolean
): Response {
  const id = msgId();
  const outputTokens = estimateTokens(text);

  if (!stream) {
    return Response.json({
      id,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: outputTokens },
    });
  }

  const frames = [
    anthropicFrame("message_start", {
      type: "message_start",
      message: {
        id,
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }),
    anthropicFrame("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    anthropicFrame("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    }),
    anthropicFrame("content_block_stop", { type: "content_block_stop", index: 0 }),
    anthropicFrame("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: outputTokens },
    }),
    anthropicFrame("message_stop", { type: "message_stop" }),
  ];

  return new Response(streamFrames(frames), { headers: SSE_HEADERS });
}

// Cacheable MISS: call upstream non-streaming, extract the answer text + token
// count so we can record usage and cache it.
export async function forward(
  body: Record<string, unknown>,
  inbound: Headers
): Promise<{ text: string; answerTokens: number }> {
  const res = await fetch(ANTHROPIC_UPSTREAM, {
    method: "POST",
    headers: upstreamHeaders(inbound),
    body: JSON.stringify({ ...body, stream: false }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic upstream ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  const answerTokens = data.usage?.output_tokens ?? estimateTokens(text);
  return { text, answerTokens };
}

// Non-cacheable BYPASS: transparent passthrough, streaming preserved.
export async function passthrough(
  body: Record<string, unknown>,
  inbound: Headers
): Promise<Response> {
  const res = await fetch(ANTHROPIC_UPSTREAM, {
    method: "POST",
    headers: upstreamHeaders(inbound),
    body: JSON.stringify(body),
  });
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  return new Response(res.body, { status: res.status, headers });
}
