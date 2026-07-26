# Multi-stage build for Azure Container Apps.
#
# The image needs to be small because ACA scales to zero between events — a
# fat image means a slow cold start at exactly the worst moment (T0, when 500
# people arrive at once). `output: "standalone"` in next.config.ts is what
# makes the final stage tiny: it copies only the modules actually imported
# instead of the whole node_modules tree.

# ---- deps: install once, cached on package-lock.json ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` (not install) so the lockfile is authoritative and builds are
# reproducible across CI and local.
RUN npm ci

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next reads env at build time for static optimisation. These are placeholders:
# the real values are injected as Container App secrets at runtime, never baked
# into the image (an image carrying a DB password would leak via the registry).
ENV NEXT_TELEMETRY_DISABLED=1
ENV MONGODB_URI="mongodb://placeholder-not-used-at-build"
ENV JWT_SECRET="placeholder-not-used-at-build"

RUN npm run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user. If anything in the app is ever compromised, the
# blast radius shouldn't include root in the container.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# ACA probes this; it touches no I/O so it stays green even if Mongo blips.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
