import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { upsertUser } from "@/lib/db/persist";

// GitHub OAuth via Auth.js v5. Reads AUTH_GITHUB_ID / AUTH_GITHUB_SECRET /
// AUTH_SECRET from the environment automatically.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    // Capture the GitHub login + avatar onto the JWT at sign-in.
    async jwt({ token, profile }) {
      if (profile) {
        if (typeof profile.login === "string") token.login = profile.login;
        if (typeof profile.avatar_url === "string")
          token.avatarUrl = profile.avatar_url;
      }
      return token;
    },
    // Expose the GitHub login on the session so endpoints can scope to it.
    async session({ session, token }) {
      if (typeof token.login === "string") session.user.login = token.login;
      if (typeof token.avatarUrl === "string")
        session.user.avatarUrl = token.avatarUrl;
      return session;
    },
  },
  events: {
    // Best-effort: record the user (with avatar) in Postgres on sign-in.
    // Never block login on a DB hiccup.
    async signIn({ profile }) {
      const login = typeof profile?.login === "string" ? profile.login : null;
      if (!login) return;
      const avatar =
        typeof profile?.avatar_url === "string" ? profile.avatar_url : null;
      try {
        await upsertUser(login, avatar);
      } catch (err) {
        console.error(
          "[auth] user upsert failed:",
          err instanceof Error ? err.message : String(err)
        );
      }
    },
  },
});
