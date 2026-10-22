# syntax=docker/dockerfile:1
# Pin the security-fixed Node patch and its immutable official image digest.
FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build
COPY . .
# Next serializes rewrites during build. Railway supplies this existing
# server-only service variable to declared ARGs; no credentials are build args.
ARG PARTICIPATE_UPSTREAM_URL
ARG OPENZCASH_ENV
RUN --network=none node scripts/assert-runtime.mjs
RUN --network=none node --import tsx scripts/assert-participate-build.ts
# next/font/google downloads public font files during compilation. Application
# credentials and DATABASE_URL are not accepted as build arguments.
RUN npm run build

FROM build AS production-dependencies
RUN --network=none npm prune --omit=dev --ignore-scripts --no-audit --no-fund
RUN rm -rf .next/cache

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["sh", "scripts/start-production.sh"]
