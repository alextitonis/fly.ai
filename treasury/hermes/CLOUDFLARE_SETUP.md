# Cloudflare Domain Setup Guide

## Step 1: Get a Domain Name

You have two options:

### Option A: Buy a New Domain (~$10/year)
1. Go to [Namecheap](https://namecheap.com) or [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)
2. Search for a domain (e.g., `hermes-screener.com`, `tokenwatch.xyz`)
3. Purchase it (~$8-15/year for .com, cheaper for .xyz/.io)

### Option B: Use Existing Domain
If you already own a domain, skip to Step 2.

## Step 2: Set Up Cloudflare (Free)

1. Go to [Cloudflare](https://dash.cloudflare.com/sign-up) and create a free account
2. Click "Add a Site" → Enter your domain name
3. Select the **Free** plan ($0/month)
4. Cloudflare will scan your DNS records

## Step 3: Get Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit zone DNS" template or create custom token with:
   - **Permissions**: Zone → DNS → Edit
   - **Zone Resources**: Include → Specific zone → Your domain
4. Click "Continue to summary" → "Create Token"
5. **Copy the token** (you won't see it again!)

## Step 4: Update Nameservers

Cloudflare will give you 2 nameservers like:
```
ns1.cloudflare.com
ns2.cloudflare.com
```

Go to your domain registrar (Namecheap, GoDaddy, etc.) and:
1. Find "Nameservers" settings
2. Change from default to "Custom DNS"
3. Enter the 2 Cloudflare nameservers
4. Save changes

**Wait 5-30 minutes** for DNS propagation.

## Step 5: Configure DNS in Cloudflare

1. In Cloudflare dashboard → DNS → Records
2. Add an A record:
   - **Type**: A
   - **Name**: @ (or your subdomain like `dashboard`)
   - **IPv4 address**: Your server's public IP (run `curl ifconfig.me`)
   - **Proxy status**: Proxied (orange cloud ON)
3. Click "Save"

## Step 6: Update Environment Variables

Edit `/home/terexitarius/hermes-token-screener/.env`:

```bash
# Your domain
DOMAIN=your-domain.com

# Cloudflare credentials
CF_API_TOKEN=your_cloudflare_api_token_here
CF_EMAIL=your_email@example.com
```

## Step 7: Deploy with Cloudflare Caddy

```bash
cd /home/terexitarius/hermes-token-screener

# Stop current services
sudo docker-compose down

# Copy Cloudflare Caddyfile
cp Caddyfile.cloudflare Caddyfile

# Start with new configuration
sudo docker-compose up -d
```

## Step 8: Verify

1. Wait 1-2 minutes for Caddy to get SSL certificate
2. Visit `https://your-domain.com`
3. You should see your dashboard with valid HTTPS!

## Cloudflare Benefits (Free Tier):

- ✅ **Free SSL/TLS** certificates (auto-renewed)
- ✅ **DDoS protection** (unmetered)
- ✅ **CDN caching** (faster loading worldwide)
- ✅ **Analytics** (visitor stats)
- ✅ **Firewall rules** (block bad bots)
- ✅ **Page rules** (redirects, caching)
- ✅ **DNS management** (easy subdomains)

## Recommended Cloudflare Settings:

### SSL/TLS:
1. Go to SSL/TLS → Overview
2. Set encryption mode to **Full (Strict)**
3. Enable **Always Use HTTPS**

### Speed:
1. Go to Speed → Optimization
2. Enable **Auto Minify** (CSS, JS, HTML)
3. Enable **Brotli** compression

### Caching:
1. Go to Caching → Configuration
2. Set **Browser Cache TTL** to 1 day

### Firewall:
1. Go to Security → WAF
2. Enable **Managed Rules** (free)

## Troubleshooting:

### DNS not propagating:
```bash
# Check DNS propagation
nslookup your-domain.com
dig your-domain.com

# Flush local DNS (Linux)
sudo systemd-resolve --flush-caches
```

### SSL certificate not issuing:
```bash
# Check Caddy logs
sudo docker-compose logs caddy | grep -i "certificate\|error"

# Common issues:
# 1. API token doesn't have DNS edit permissions
# 2. Domain not active in Cloudflare (check nameservers)
# 3. DNS record not set (A record pointing to your IP)
```

### Dashboard not loading:
```bash
# Check if containers are running
sudo docker-compose ps

# Check dashboard logs
sudo docker-compose logs hermes-dashboard

# Test local access
curl http://localhost:8080/health
```

## Cost Summary:

| Item | Cost |
|------|------|
| Domain (.com) | ~$10/year |
| Cloudflare Free | $0 |
| SSL Certificate | $0 (auto) |
| DDoS Protection | $0 |
| **Total** | **~$10/year** |

That's it! For about $10/year, you get a professional domain with automatic HTTPS, DDoS protection, and global CDN.
