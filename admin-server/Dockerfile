# Admin Server Dockerfile
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Build application
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS runner

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/scripts ./src/scripts

# Create data directory for SQLite and set permissions
RUN mkdir -p /app/prisma && chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 4000

# Push schema, seed database, and start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx src/scripts/seed.ts && node dist/index.js"]
