import type { NextConfig } from "next";

// Applied to every response. CSP is intentionally omitted here: a strict
// connect-src 'self' would block the client Sentry beacon (it posts directly
// to the ingest domain, no tunnel), and a nonce-based CSP would force every
// page to dynamic rendering. Add CSP via proxy.ts once Sentry tunnelRoute is set.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
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
