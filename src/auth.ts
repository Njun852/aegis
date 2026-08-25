import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticate } from "@/lib/dal/users";

/**
 * Credentials-only, matching the design's username + password sign-in. No
 * adapter: Auth.js forces the JWT session strategy when Credentials is in play,
 * so an adapter would never store a session — the `users` collection is ours.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await authenticate(username, password);
        if (!user) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          defaultBusinessId: user.defaultBusinessId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the sign-in pass; afterwards the claims are
      // already on the token.
      if (user) {
        token.role = user.role;
        token.defaultBusinessId = user.defaultBusinessId;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role;
      session.user.defaultBusinessId = token.defaultBusinessId;
      return session;
    },
  },
});
