# syntax=docker/dockerfile:1
# Self-host image (Next.js 16 standalone). Vercel does NOT use this — it builds
# from source via its Git integration. This is for on-prem / data-sovereignty.

FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
# Skip postinstall here; prisma generate runs in the builder with proper env.
RUN npm ci --ignore-scripts

# ---- build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build is fully dynamic and never connects to a DB. Real values are injected at
# runtime via env. These ARGs only satisfy prisma.config.ts + Auth.js at build.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ARG AUTH_SECRET="build-time-only-secret"
ENV DATABASE_URL=$DATABASE_URL \
    AUTH_SECRET=$AUTH_SECRET \
    NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Container-native healthcheck hitting the app's health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
