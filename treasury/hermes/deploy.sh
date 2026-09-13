#!/bin/bash
# Hermes Token Screener Deployment Script
# Deploys using Docker Compose with Caddy (automatic HTTPS)

set -e

echo "🚀 Deploying Hermes Token Screener..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p data logs caddy-data caddy-config nginx-data

# Copy data files if they exist
if [ -d "/home/terexitarius/.hermes/data/token_screener" ]; then
    echo "📊 Copying token data..."
    cp -r /home/terexitarius/.hermes/data/token_screener/* data/ 2>/dev/null || true
fi

if [ -f "/home/terexitarius/.hermes/data/central_contracts.db" ]; then
    echo "💾 Copying contract database..."
    cp /home/terexitarius/.hermes/data/central_contracts.db data/ 2>/dev/null || true
fi

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build

echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "📊 Checking service status..."
docker-compose ps

# Get the public IP
PUBLIC_IP=$(curl -s ifconfig.me)
echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Access your dashboard at:"
echo "   HTTP:  http://$PUBLIC_IP"
echo "   HTTPS: https://$PUBLIC_IP (if domain configured)"
echo ""
echo "📋 Service URLs:"
echo "   Dashboard: http://$PUBLIC_IP/"
echo "   API:       http://$PUBLIC_IP/api/top100"
echo "   Health:    http://$PUBLIC_IP/health"
echo ""
echo "📝 To view logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 To stop:"
echo "   docker-compose down"
