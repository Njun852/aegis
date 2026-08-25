import type { DefaultSession } from "next-auth";
import type { UserRole } from "./account";

declare module "next-auth" {
  interface User {
    role: UserRole;
    defaultBusinessId: string;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      defaultBusinessId: string;
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt` only re-exports `@auth/core/jwt`, so augmenting the former
// declares an unrelated interface instead of merging. Target the real module.
declare module "@auth/core/jwt" {
  interface JWT {
    role: UserRole;
    defaultBusinessId: string;
  }
}
