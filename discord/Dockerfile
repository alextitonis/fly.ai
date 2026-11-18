# fly.ai Discord bot + the Virtuals ACP provider agent on one machine (start.mjs runs both; 2026-11-18).
# Built from a staging folder by deploy.sh: this folder plus flytrade/acp as ./acp. Node 22 strips the TypeScript
# itself, so there's no build step.
FROM node:22-slim
RUN npm install -g @virtuals-protocol/acp-cli@1.0.40 && apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Headless fix (2026-11-07, see flytrade/acp/README.md): with no Secret Service the CLI WRITES tokens to cross-keychain's
# file backend but READS from the native one, so every command after `configure` says "Not authenticated".
# ACP_KEYRING_FILE=1 makes it use the file backend for both.
RUN F=/usr/local/lib/node_modules/@virtuals-protocol/acp-cli/dist/bin/acp.js \
 && sed -i 's/async function withKeyringFallback(op) {/async function withKeyringFallback(op) { if (process.env.ACP_KEYRING_FILE === "1") { await useBackend("file"); return await op(); }/' "$F" \
 && grep -q 'ACP_KEYRING_FILE' "$F"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src src
COPY start.mjs ./
COPY acp acp
# the agent's Token Research runs the bot's own research code: one copy of it, linked where provider.mjs looks
RUN ln -s /app/src /app/acp/research

# the agent's sign-in lives on the volume under /data/acp-agent (start.mjs gives it DATA_DIR/HOME there too)
ENV NODE_ENV=production ACP_KEYRING_FILE=1 ACP_CONFIG_DIR=/data/acp-agent/acp \
    XDG_CONFIG_HOME=/data/acp-agent/xdg/config XDG_DATA_HOME=/data/acp-agent/xdg/data
CMD ["node", "start.mjs"]
