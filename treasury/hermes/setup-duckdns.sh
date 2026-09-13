#!/bin/bash
# DuckDNS Free Subdomain Setup
# Gets you: yourname.duckdns.org (free forever)

set -e

echo "=========================================="
echo "  DuckDNS Free Subdomain Setup"
echo "=========================================="
echo ""

# Step 1: Get DuckDNS token
echo "1. Go to: https://www.duckdns.org/"
echo "2. Sign in with Google/GitHub/Reddit"
echo "3. Copy your TOKEN from the dashboard"
echo ""
read -p "Enter your DuckDNS TOKEN: " DUCKDNS_TOKEN

if [ -z "$DUCKDNS_TOKEN" ]; then
    echo "ERROR: Token is required"
    exit 1
fi

# Step 2: Choose subdomain
echo ""
echo "Choose a subdomain (e.g., hermes-screener):"
read -p "Subdomain: " SUBDOMAIN

if [ -z "$SUBDOMAIN" ]; then
    SUBDOMAIN="hermes-screener"
fi

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)
echo ""
echo "Your public IP: $PUBLIC_IP"

# Register subdomain
echo ""
echo "Registering $SUBDOMAIN.duckdns.org..."
RESPONSE=$(curl -s "https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=$PUBLIC_IP")

if [ "$RESPONSE" = "OK" ]; then
    echo "✅ Success! $SUBDOMAIN.duckdns.org -> $PUBLIC_IP"
else
    echo "❌ Failed: $RESPONSE"
    exit 1
fi

# Create update cron job
echo ""
echo "Creating auto-update cron job..."
CRON_CMD="*/5 * * * * curl -s 'https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=$PUBLIC_IP' > /dev/null"

# Add to crontab
(crontab -l 2>/dev/null | grep -v duckdns; echo "$CRON_CMD") | crontab -
echo "✅ Cron job created (updates every 5 minutes)"

# Update Caddyfile for DuckDNS
echo ""
echo "Updating Caddyfile for DuckDNS..."
cat > /home/terexitarius/hermes-token-screener/Caddyfile << EOF
# Caddy configuration for DuckDNS
# Automatic HTTPS with Let's Encrypt

$SUBDOMAIN.duckdns.org {
    reverse_proxy hermes-dashboard:8080 {
        health_uri /health
        health_interval 30s
        health_timeout 5s
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
    
    encode gzip
    
    log {
        output file /data/logs/caddy.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
        level INFO
    }
}
EOF

echo "✅ Caddyfile updated"

# Update .env
echo ""
echo "Updating .env..."
cat > /home/terexitarius/hermes-token-screener/.env << EOF
DOMAIN=$SUBDOMAIN.duckdns.org
DUCKDNS_TOKEN=$DUCKDNS_TOKEN
EOF

echo "✅ .env updated"

# Restart Caddy
echo ""
echo "Restarting Caddy..."
cd /home/terexitarius/hermes-token-screener
sudo docker-compose restart caddy

echo ""
echo "=========================================="
echo "  SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "Your dashboard will be available at:"
echo ""
echo "  https://$SUBDOMAIN.duckdns.org"
echo ""
echo "Note: SSL certificate will be issued in 1-2 minutes"
echo ""
echo "To check status:"
echo "  curl https://$SUBDOMAIN.duckdns.org/health"
echo ""
