#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SRC="$REPO_DIR/deploy/systemd/hermes-polymarket-daemon.service"
ENV_SRC="$REPO_DIR/deploy/systemd/polymarket-daemon.env.example"

if [[ ! -f "$SERVICE_SRC" ]]; then
  echo "Missing service file: $SERVICE_SRC" >&2
  exit 1
fi

sudo cp "$SERVICE_SRC" /etc/systemd/system/hermes-polymarket-daemon.service

if [[ ! -f /etc/default/hermes-polymarket-daemon ]]; then
  sudo cp "$ENV_SRC" /etc/default/hermes-polymarket-daemon
  echo "Installed default env at /etc/default/hermes-polymarket-daemon"
else
  echo "/etc/default/hermes-polymarket-daemon already exists (left unchanged)"
fi

sudo systemctl daemon-reload
sudo systemctl enable hermes-polymarket-daemon
sudo systemctl restart hermes-polymarket-daemon

echo
sudo systemctl --no-pager --full status hermes-polymarket-daemon || true
echo
echo "Tail logs: journalctl -u hermes-polymarket-daemon -f"
