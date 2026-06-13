const encoder = new TextEncoder();

// Build a one-shot ReadableStream that emits the given frames then closes.
// Used to synthesize a provider's SSE response from a cached/forwarded answer.
export function streamFrames(frames: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

// Anthropic SSE: `event: <type>\ndata: <json>\n\n`
export function anthropicFrame(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// OpenAI SSE: `data: <json|[DONE]>\n\n`
export function dataFrame(data: unknown): string {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return `data: ${body}\n\n`;
}

export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
};
