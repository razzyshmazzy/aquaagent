// Rough token estimate (~4 chars/token) for when a real usage count isn't
// available (cached answers, seed data, older SDK shapes).
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text?.length ?? 0) / 4));
}

// Pull the completion/output token count out of an AI SDK usage object across
// SDK versions (v5: outputTokens, v4: completionTokens). Falls back to estimate.
export function answerTokensFrom(
  usage: Record<string, unknown> | undefined,
  text: string
): number {
  const u = usage ?? {};
  const out = (u.outputTokens ?? u.completionTokens) as number | undefined;
  return typeof out === "number" && out > 0 ? out : estimateTokens(text);
}
