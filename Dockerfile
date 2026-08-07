# Multi-stage build for Azure Container Apps.
#
# The image needs to be small because ACA scales to zero between events — a
# fat image means a slow cold start at exactly the worst moment (T0, when 500
# people arrive at once). `output: "standalone"` in next.config.ts is what
# makes the final stage tiny: it copies only the modules actually imported
# instead of the whole node_modules tree.
#
# NOTE: We use node:20-bullseye-slim (glibc/Debian) instead of node:20-alpine
# (musl) because most native Node modules (lightningcss, @tailwindcss/oxide,
# sharp) ship prebuilt binaries only for linux-x64-gnu (glibc). Alpine's musl
# libc causes "Cannot find module lightningcss.linux-x64-musl.node" errors at
# build time. Switching to a glibc image is the simplest and most reliable fix.

# ---- build: install deps fresh inside this image so native binaries match ----
FROM node:20-bullseye-slim AS builder
# System deps must be present before npm ci so native addons compile correctly
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates libvips-dev python3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# Run npm ci INSIDE this image — never copy node_modules from host or another
# stage, because native .node binaries are platform-specific (glibc vs musl).
RUN npm ci
# Ensure native bindings are built for this image's glibc runtime
RUN npm rebuild lightningcss --update-binary || true
RUN npm rebuild @tailwindcss/oxide --update-binary || true
RUN npm rebuild sharp --update-binary || true
COPY . .

# Next reads env at build time for static optimisation. These are placeholders:
# the real values are injected as Container App secrets at runtime, never baked
# into the image (an image carrying a DB password would leak via the registry).
ENV NEXT_TELEMETRY_DISABLED=1
ENV MONGODB_URI="mongodb://placeholder-not-used-at-build"
ENV JWT_SECRET="placeholder-not-used-at-build"

# next.config.ts only switches on `output: "standalone"` when this is set,
# because an unconditional standalone build breaks deployment to Vercel. The
# runner stage below copies .next/standalone, so without this the build
# silently produces a normal .next and the COPY fails with "not found".
ENV DOCKER_BUILD=1

# Temporal dithering, off unless the build is told otherwise.
#
# NEXT_PUBLIC_* values are INLINED INTO THE CLIENT BUNDLE AT BUILD TIME. Setting
# this as a Container App env var at runtime does nothing at all — the bundle is
# already compiled, with the flag baked in as undefined, so the effect would be
# permanently off however the running container is configured. It has to arrive
# here, as a build argument, or not at all.
#
# Unlike MONGODB_URI and JWT_SECRET above, baking this into the image is correct:
# it is a boolean feature flag, not a secret, and it decides what the browser
# paints.
ARG NEXT_PUBLIC_QUIZ_DITHER=""
ENV NEXT_PUBLIC_QUIZ_DITHER=$NEXT_PUBLIC_QUIZ_DITHER

RUN npm run build

# ---- runner ----
FROM node:20-bullseye-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user. If anything in the app is ever compromised, the
# blast radius shouldn't include root in the container.
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# ACA probes this; it touches no I/O so it stays green even if Mongo blips.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
