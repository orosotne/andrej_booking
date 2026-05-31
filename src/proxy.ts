import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

// Next.js 16 proxy convention (formerly middleware). Gates page routes,
// redirecting unauthenticated users to /login. API routes are excluded so
// their handlers can return JSON 401/403 via requireRole.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
