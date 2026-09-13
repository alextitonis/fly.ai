#!/bin/bash
# Deploy with Cloudflare HTTPS

set -e

echo "=========================================="
echo "  Deploying with Cloudflare HTTPS"
echo "=========================================="
echo ""

# Source .env
if [ -f .env ]; then
    source .env
else
    echo "ERROR: .env file not found"
    echo "Run ./setup-cloudflare.sh first"
    exit 1
fi

# Validate
if [ "$DOMAIN" = "your-domain.com" ]; then
    echo "ERROR: Please set DOMAIN in .env"
    exit 1
fi

if [ -z "$CF_API_TOKEN" ]; then
    echo "ERROR: Please set CF_API_TOKEN in .env"
    exit 1
fi

echo "Domain: $DOMAIN"
echo ""

# Use Cloudflare Caddyfile
echo "Configuring Caddy for Cloudflare..."
cp Caddyfile.cloudflare Caddyfile

# Create directories
mkdir -p data logs caddy-data caddy-config

# Copy data if exists
if [ -d "$HOME/.hermes/data/token_screener" ]; then
    cp -r $HOME/.hermes/data/token_screener/* data/ 2>/dev/null || true
fi

if [ -f "$HOME/.hermes/data/central_contracts.db" ]; then
    cp $HOME/.hermes/data/central_contracts.db data/ 2>/dev/null || true
fi

# Build and deploy
echo "Building Docker images..."
sudo docker-compose build

echo "Starting services..."
sudo docker-compose up -d

echo ""
echo "Waiting for SSL certificate..."
sleep 15

echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Your dashboard is now available at:"
echo ""
echo "  https://$DOMAIN"
echo ""
echo "=========================================="
echo ""
echo "If HTTPS doesn't work immediately:"
echo "1. Wait 1-2 minutes for certificate issuance"
echo "2. Check logs: sudo docker-compose logs caddy"
echo "3. Verify DNS: nslookup $DOMAIN"
echo ""
