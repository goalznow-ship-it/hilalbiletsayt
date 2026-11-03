FROM node:22-bookworm-slim AS build

RUN corepack enable && \
    corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Install build dependencies including OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies with retries
# Copy the complete pnpm workspace
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

WORKDIR /app/apps/api

# Copy only necessary node_modules from build stage
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules ./node_modules

# Copy only the api dist and package.json
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json

# Create only the storage directory needed and assign ownership
RUN mkdir -p storage && \
    chown node:node storage

# Switch to non-root user
USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]