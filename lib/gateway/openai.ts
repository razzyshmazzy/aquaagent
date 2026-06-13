import { randomUUID } from "node:crypto";
import { OPENAI_UPSTREAM } from "@/lib/constants";
import { estimateTokens } from "@/lib/tokens";
import { dataFrame, streamFrames, SSE_HEADERS } from "./sse";

function chatId(): string {
  return "chatcmpl-" + randomUUID().replace(/-/g, "");
}

// Forward the client's own OpenAI credentials upstream.
function upstreamHeaders(inbound: Headers): Headers {
  const h = new Headers({ "content-type": "application/json" });
  const auth = inbound.get("authorization");
  if (auth) h.set("authorization", auth);
  const org = inbound.get("openai-organization");
  if (org) h.set("openai-organization", org);
  const project = inbound.get("openai-project");
  if (project) h.set("openai-project", project);
  return h;
}

// Build an OpenAI Chat Completions response (streaming chunks or JSON) from
// plain answer text — used for both cache hits and forwarded cacheable misses.
export function synthesize(
  text: string,
  model: string,
  stream: boolean
): Response {
  const id = chatId();
  const created = Math.floor(Date.now() / 1000);
  const completionTokens = estimateTokens(text);

  if (!stream) {
    return Response.json({
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: completionTokens,
        total_tokens: completionTokens,
      },
    });
  }

  const base = { id, object: "chat.completion.chunk", created, model };
  const frames = [
    dataFrame({
      ...base,
      choices: [
        { index: 0, delta: { role: "assistant", content: text }, finish_reason: null },
      ],
    }),
    dataFrame({
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    }),
    dataFrame("[DONE]"),
  ];

  return new Response(streamFrames(frames), { headers: SSE_HEADERS });
}

// Cacheable MISS: call upstream non-streaming, extract answer text + tokens.
export async function forward(
  body: Record<string, unknown>,
  inbound: Headers
): Promise<{ text: string; answerTokens: number }> {
  const res = await fetch(OPENAI_UPSTREAM, {
    method: "POST",
    headers: upstreamHeaders(inbound),
    body: JSON.stringify({ ...body, stream: false }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI upstream ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const answerTokens = data.usage?.completion_tokens ?? estimateTokens(text);
  return { text, answerTokens };
}

// Non-cacheable BYPASS: transparent passthrough, streaming preserved.
export async function passthrough(
  body: Record<string, unknown>,
  inbound: Headers
): Promise<Response> {
  const res = await fetch(OPENAI_UPSTREAM, {
    method: "POST",
    headers: upstreamHeaders(inbound),
    body: JSON.stringify(body),
  });
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  return new Response(res.body, { status: res.status, headers });
}
