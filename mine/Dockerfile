# fly.ai mining server. Deploy with mine/deploy.sh, which stages the server, the world engine files it
# imports and serves (plus Fly Roulette's, Fly Slots' and Fly Race's shared rules), and the connectome export (~58 MB), then builds remotely. The server
# needs only the two @noble crypto libraries and the postgres client (Node strips the TypeScript itself).
FROM node:22-slim

WORKDIR /app
COPY world/src/connectome.ts world/src/rng.ts world/src/
COPY world/src/roulette/game.ts world/src/roulette/readout.ts world/src/roulette/
COPY world/src/slots/game.ts world/src/slots/
COPY world/src/race/game.ts world/src/race/readout.ts world/src/race/
COPY world/src/arena/game.ts world/src/arena/readout.ts world/src/arena/stats.ts world/src/arena/shop.ts world/src/arena/
COPY world/public/connectome world/public/connectome
COPY mine/package.json mine/package-lock.json mine/
RUN cd mine && npm ci --omit=dev
COPY mine/src mine/src
COPY mine/web mine/web

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA PORT=8080 MINE_DB=/data/mine.db TRUST_PROXY=1

WORKDIR /app/mine
# src/start.ts: the mining and user servers (one database) behind a proxy on PORT, so mining never holds a player
CMD ["node", "--disable-warning=ExperimentalWarning", "src/start.ts"]
