#!/bin/bash
# Quick Cloudflare Domain Setup Script

set -e

echo "=========================================="
echo "  Cloudflare Domain Setup"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# Domain Configuration
DOMAIN=your-domain.com
CF_API_TOKEN=your_cloudflare_api_token
CF_EMAIL=your_email@example.com
EOF
    echo "Created .env - please edit with your credentials"
    exit 1
fi

# Source .env
source .env

# Validate configuration
if [ "$DOMAIN" = "your-domain.com" ]; then
    echo "ERROR: Please edit .env and set your DOMAIN"
    exit 1
fi

if [ "$CF_API_TOKEN" = "your_cloudflare_api_token" ]; then
    echo "ERROR: Please edit .env and set your CF_API_TOKEN"
    exit 1
fi

echo "Domain: $DOMAIN"
echo "Email: $CF_EMAIL"
echo ""

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)
echo "Your public IP: $PUBLIC_IP"
echo ""

echo "=========================================="
echo "  Next Steps:"
echo "=========================================="
echo ""
echo "1. Go to Cloudflare Dashboard:"
echo "   https://dash.cloudflare.com"
echo ""
echo "2. Add your domain: $DOMAIN"
echo ""
echo "3. In DNS settings, add A record:"
echo "   Type: A"
echo "   Name: @"
echo "   IPv4: $PUBLIC_IP"
echo "   Proxy: ON (orange cloud)"
echo ""
echo "4. Update nameservers at your registrar to:"
echo "   (Cloudflare will show you the nameservers)"
echo ""
echo "5. Wait 5-30 minutes for DNS propagation"
echo ""
echo "6. Run deployment:"
echo "   ./deploy-cloudflare.sh"
echo ""
echo "=========================================="
