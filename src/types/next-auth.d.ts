import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/auth/roles";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

// next-auth/jwt only re-exports (`export *`) from @auth/core/jwt, so the JWT
// interface must be augmented at its source for the merge to take effect.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
