FROM node:22-bookworm-slim AS builder

RUN corepack enable \
    && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV API_ORIGIN=http://api:3001

COPY . .

RUN pnpm install --frozen-lockfile \
    --fetch-retries=5 \
    --fetch-timeout=120000 \
    --network-concurrency=4

RUN pnpm --filter @hilal/web build


FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/static ./apps/web/.next/static

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
