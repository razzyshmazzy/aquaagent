import type { DefaultSession } from "next-auth";

// Expose the GitHub login (and avatar) on the session + JWT.
declare module "next-auth" {
  interface Session {
    user: {
      login: string;
      avatarUrl?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    login?: string;
    avatarUrl?: string;
  }
}
