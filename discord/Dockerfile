# fly.ai Discord bot. Node 22 strips the TypeScript itself, so there's no build step.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src src

ENV NODE_ENV=production
CMD ["node", "src/index.ts"]
