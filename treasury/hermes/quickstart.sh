#!/bin/bash
# Quick start script for Hermes Token Screener

set -e

echo "🚀 Quick Start: Hermes Token Screener"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Please run as root (sudo)"
    exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Run deployment
./deploy.sh
