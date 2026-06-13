import { auth } from "@/auth";

// Resolve the signed-in user's GitHub login, or a 401 Response. Read endpoints
// use this and then scope every query to the returned login, so a user can only
// ever see their own attributed data.
export async function requireLogin(): Promise<{ login: string } | Response> {
  const session = await auth();
  const login = session?.user?.login;
  if (!login) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { login };
}
