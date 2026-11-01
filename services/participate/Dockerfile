FROM node:22.22.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# Public build configuration only. Database, email and SSH secrets are runtime-only.
ENV APP_BASE_URL=https://openzcash.org PARTICIPATE_PARENT_ORIGIN=https://openzcash.org
RUN npm run build

FROM node:22.22.1-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=::
RUN groupadd --system --gid 1001 participate && useradd --system --uid 1001 --gid participate --home-dir /app participate
COPY --from=build --chown=participate:participate /app/.next/standalone ./
COPY --from=build --chown=participate:participate /app/.next/static ./.next/static
COPY --from=build --chown=participate:participate /app/public ./public
COPY --from=build --chown=participate:participate /app/data ./data
COPY --chown=participate:participate deploy/participate-web-runtime.mjs ./deploy/participate-web-runtime.mjs
USER participate
EXPOSE 3000
CMD ["node", "deploy/participate-web-runtime.mjs"]
