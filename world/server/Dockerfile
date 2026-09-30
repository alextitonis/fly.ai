# The always-on fly world. The simulation is plain TypeScript with no runtime dependencies, run by Node's own type
# stripping; the one package is `postgres` (server/package.json) for the direct database sink (pgsink.ts). Deploy with world/server/deploy.sh, which stages world/src and world/server only.
FROM node:22-slim
WORKDIR /app/world
COPY world/src src
COPY world/server server
RUN cd server && npm install --omit=dev --no-audit --no-fund
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server/run.ts"]
