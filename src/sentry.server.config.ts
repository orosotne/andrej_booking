import * as Sentry from "@sentry/nextjs";

// Inert unless SENTRY_DSN is set, so it is safe in every environment.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
