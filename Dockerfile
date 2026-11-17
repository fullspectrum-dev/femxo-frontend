# Femxo website + admin (apps/web): Next.js standalone server.
# Build from the repo root (the pnpm workspace):
#
#   docker build -t femxo-frontend \
#     --build-arg FEMXO_API_ORIGIN=http://api:3000 \n#     --build-arg NEXT_PUBLIC_STORE_URL=https://shop.femxo.in .
#   docker run -p 3001:3001 femxo-frontend
#
# FEMXO_API_ORIGIN and NEXT_PUBLIC_* are read at build time (rewrites and
# public env are baked into the build), so pass them as build args.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

FROM base AS deps
# Workspace manifests first, so dependency layers stay cached across code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter @femxo/web...

FROM base AS build
# No default: the build refuses to run without the API's address (see apps/web/next.config.ts).
ARG FEMXO_API_ORIGIN
ARG NEXT_PUBLIC_API_BASE_URL=
ARG NEXT_PUBLIC_STORE_URL=
ENV FEMXO_API_ORIGIN=$FEMXO_API_ORIGIN \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_AUTH_DEMO_MODE=$NEXT_PUBLIC_AUTH_DEMO_MODE \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter @femxo/web build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
# Traced from the workspace root, the standalone server sits at apps/web/ and
# serves public/ and .next/static once they sit beside it.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1
CMD ["node", "apps/web/server.js"]
