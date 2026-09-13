# ========================================
# Multi-stage Dockerfile for NofyAI
# ========================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies only when needed
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Ensure public directory exists (Next.js optional directory)
RUN mkdir -p public

# Build Next.js application
# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create directories for data persistence with proper permissions
RUN mkdir -p /app/decision_logs && \
    mkdir -p /app/data && \
    chown -R nextjs:nodejs /app && \
    chmod -R 755 /app/decision_logs /app/data

# Note: If using volume mounts, ensure host directories have UID/GID 1001
# Run on host: sudo chown -R 1001:1001 decision_logs data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME "0.0.0.0"
ENV PORT 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "server.js"]
