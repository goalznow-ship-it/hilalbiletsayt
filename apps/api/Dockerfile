FROM node:22-bookworm-slim AS build

RUN corepack enable && \
    corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pnpm install --frozen-lockfile \
    --fetch-retries=5 \
    --fetch-timeout=120000 \
    --network-concurrency=4

RUN pnpm --filter @hilal/api prisma:generate

RUN pnpm --filter @hilal/api build

# Runtime stage
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3001
ENV API_HOST=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/api

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
# Migrations and Prisma config for the one-shot `migrate` service.
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/prisma.config.ts ./prisma.config.ts

# OMR scan storage; a named volume mounted here inherits this ownership.
RUN mkdir -p /var/lib/hilal/omr && chown node:node /var/lib/hilal/omr

USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
