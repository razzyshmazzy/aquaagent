// Single-account demo — no sign-in required. All data is global.
export async function requireLogin(): Promise<{ login: string } | Response> {
  return { login: "razzyshmazzy" };
}
