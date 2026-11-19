#!/usr/bin/env bash
# Deploy flyai-discord: the Discord bot + fly.ai's Virtuals ACP provider agent on one machine (start.mjs; 2026-11-18).
#   bash discord/deploy.sh                 (Git Bash, not WSL: see flytrade/acp/README.md)
# Stages this folder (no node_modules, no .env) plus flytrade/acp as ./acp, then deploys.
#
# Moving the agent off its old app (once, while flyai-acp still has a machine): copies its INTERNAL_KEY secret and its
# volume (sign-in, signer key, Agentcity identity, job state) into /data/acp-agent here, then stops flyai-acp so two
# agents never answer the same jobs. flyai-acp's app + volume stay as a fallback until you destroy them.
set -euo pipefail
export PATH="$HOME/.fly/bin:$PATH"                 # flyctl's own folder (fly.exe), when the shell's PATH lacks it
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
APP=flyai-discord
OLD=flyai-acp

if fly machine list -a "$OLD" --json 2>/dev/null | grep -q '"state": *"started"'; then
  echo "moving the ACP agent from $OLD into $APP"
  if ! fly secrets list -a "$APP" | grep -q INTERNAL_KEY; then
    KEY="$(fly ssh console -a "$OLD" -C "printenv INTERNAL_KEY" 2>/dev/null | tr -d '\r\n')"
    [ ${#KEY} -ge 32 ] || { echo "couldn't read INTERNAL_KEY from $OLD"; exit 1; }
    fly secrets set -a "$APP" --stage INTERNAL_KEY="$KEY"
  fi
  if ! fly ssh console -a "$APP" -C "test -f /data/acp-agent/acp/config.json" >/dev/null 2>&1; then
    DATA="$(fly ssh console -a "$OLD" -C "sh -c 'tar cz -C /data --exclude=./lost+found . | base64 -w0'" 2>/dev/null | tr -d '\r\n')"
    [ ${#DATA} -gt 100 ] || { echo "couldn't read $OLD's volume"; exit 1; }
    printf '%s' "$DATA" | fly ssh console -a "$APP" \
      -C "sh -c 'mkdir -p /data/acp-agent && base64 -d | tar xz -C /data/acp-agent && ls /data/acp-agent'"
    fly ssh console -a "$APP" -C "test -f /data/acp-agent/acp/config.json" >/dev/null 2>&1 \
      || { echo "the copy didn't land in /data/acp-agent"; exit 1; }
  fi
  fly scale count 0 -a "$OLD" --yes                # the old agent stops before the new one starts
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE" 2>/dev/null || true' EXIT
cp "$HERE"/{Dockerfile,fly.toml,package.json,package-lock.json,start.mjs} "$STAGE/"
cp -r "$HERE/src" "$STAGE/src"
mkdir -p "$STAGE/acp"
cp "$ROOT"/flytrade/acp/{offerings.json,provider.mjs,register.mjs,agentcity.mjs,services.mjs,agentdesk.mjs} "$STAGE/acp/"
fly deploy "$STAGE" -c "$STAGE/fly.toml" --remote-only --ha=false "$@"
echo "deployed $APP - check: fly logs -a $APP (logged in as ..., agent fly.ai ...)"
