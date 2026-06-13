// Truncate a string for API responses so full prompts never leave the DB.
export function truncate(s: string, max = 140): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
