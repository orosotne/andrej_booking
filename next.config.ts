import type { NextConfig } from "next";

// Applied to every response. A *full* CSP is still intentionally omitted: a
// strict connect-src 'self' would block the client Sentry beacon (it posts
// directly to the ingest domain, no tunnel), and a nonce-based script-src would
// force every page to dynamic rendering. Add those via proxy.ts once Sentry
// tunnelRoute is set.
//
// We do ship the subset of CSP directives that harden against clickjacking and
// injection without touching script-src/style-src/connect-src — so Sentry and
// static rendering are unaffected: frame-ancestors (defence-in-depth alongside
// X-Frame-Options), base-uri (no <base> hijack), form-action (posts stay
// same-origin) and object-src (no plugins/embeds).
const contentSecurityPolicy = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker/Kubernetes image.
  // Ignored by Vercel (which uses its own output), so it is safe in both paths.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
