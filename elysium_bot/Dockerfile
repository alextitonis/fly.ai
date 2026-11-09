# Elysium sniper bot on a small fly.io machine. tsx runs the TypeScript directly, so there's no build step.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src src

ENV NODE_ENV=production
CMD ["npx", "tsx", "src/cli.ts", "run"]
