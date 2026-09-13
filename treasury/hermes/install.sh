#!/bin/bash

# Hermes Token Screener Installation Script

set -e  # Exit on error

echo "Hermes Token Screener Installation Script"
echo "=========================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root or with sudo privileges"
   exit 1
fi

# Update package list
echo "Updating package list..."
apt-get update -qq

# Install system dependencies
echo "Installing system dependencies..."
apt-get install -y python3-pip python3-venv \
    nodejs npm build-essential docker.io docker-compose \
    net-tools curl wget jq git ufw unattended-upgrades

# Create hermes user if it doesn't exist
if ! id "terexitarius" &>/dev/null; then
    echo "Creating user 'terexitarius'..."
    useradd -m -s /bin/bash terexitarius
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install -r requirements.txt

# Install Node dependencies
echo "Installing Node dependencies..."
npm install -g pnpm
cd packages/gateway
pnpm install
pnpm build
cd ../..

# Set up directories
echo "Setting up directories..."
mkdir -p /home/terexitarius/.hermes/{logs,data,conf/wallets}
chown -R terexitarius:terexitarius /home/terexitarius/.hermes

# Make scripts executable
echo "Making scripts executable..."
chmod +x scripts/*.py

# Set up firewall
echo "Setting up firewall..."
ufw allow ssh
ufw allow from 127.0.0.1 to any port 15888
ufw --force enable

# Copy systemd service files
echo "Setting up systemd services..."
cp systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable hermes-gateway.service
systemctl enable trading-daemon.service

echo "=========================================="
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Configure API keys in conf/apiKeys.yml"
echo "2. Configure wallet files in ~/.hermes/conf/wallets/"
echo "3. Start the system:"
echo "   hermes gateway run --replace --passphrase \"YOUR_PASSPHRASE\""
echo "   python3 scripts/trading_daemon.py"
echo "=========================================="