# Railway Deployment - Complete Guide

## Your Dashboard is Live! 🎉

**Dashboard URL**: https://hermes-token-screener.up.railway.app

---

## Railway Configuration Details

### App Information
- **App ID**: `90295100-a254-4b77-97bd-1157bd4755b7`
- **Name**: hermes-token-screener
- **Plan**: Free (500 hours/month)
- **Runtime**: Python + FastAPI

### Architecture
```
Railway
├── hermes-token-screener (Python/FastAPI)
│   ├── Port: $PORT (environment variable)
│   ├── Health Check: /health
│   ├── API: /api/top100
│   └── Dashboard: /
└── Caddy (reverse proxy with HTTPS)
    └── Automatic Let's Encrypt
```

### Environment Variables
```yaml
HERMES_HOME=/app
PYTHONPATH=/app
PORT=$PORT  # Set by Railway automatically
```

### Health Checks
- **Path**: `/health`
- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Grace Period**: 30 seconds
- **Threshold**: 3 failures before restart

---

## Project Structure

```
/home/terexitarius/hermes-token-screener/
├── railway.json          # Railway deployment config
├── Dockerfile           # Container build instructions
├── requirements.txt     # Python dependencies
├── .env                 # Environment variables
├── Caddyfile            # Caddy web server config
├── README.md            # Project documentation
├── hermes_screener/     # Main application
│   ├── dashboard/       # FastAPI application
│   └── __main__.py      # Entry point
└── data/                # Token data files
    ├── tokens.json
    ├── cross-tokens.json
    └── smart-money-tokens.json
```

---

## Key Features

### ✅ Automatic HTTPS
- Let's Encrypt certificates via Caddy
- Auto-renewal every 90 days
- No port 80/443 configuration needed

### ✅ Free Tier Benefits
- 500 hours/month compute time
- Automatic scaling
- Built-in load balancing
- HTTPS included

### ✅ Health Monitoring
- Automatic restart on failure
- Log aggregation
- Metrics tracking

### ✅ Git-Based Deployment
- Push to main → Auto-deploy
- Zero downtime updates
- Rollback support

---

## Management Commands

### Via Railway Dashboard
- **Logs**: https://railway.app/projects/90295100-a254-4b77-97bd-1157bd4755b7/logs
- **Settings**: https://railway.app/projects/90295100-a254-4b77-97bd-1157bd4755b7/settings
- **Deployments**: https://railway.app/projects/90295100-a254-4b77-97bd-1157bd4755b7/deployments

### Via CLI
```bash
# View logs
railway logs

# View project info
railway status

# Restart service
railway restart

# Open dashboard
railway open

# Update code
git pull && git push origin main
```

---

## Access Your Dashboard

### From Any Computer
1. Open browser
2. Navigate to: **https://hermes-token-screener.up.railway.app**
3. Dashboard loads automatically

### Test Endpoints
```bash
# Health check
curl https://hermes-token-screener.up.railway.app/health

# Get top 100 tokens
curl https://hermes-token-screener.up.railway.app/api/top100

# View dashboard
open https://hermes-token-screener.up.railway.app
```

---

## Troubleshooting

### Dashboard Not Loading
```bash
# Check logs
railway logs

# Check deployment status
railway status

# Restart if needed
railway restart
```

### SSL Certificate Issues
```bash
# Force certificate renewal
railway run certbot renew

# Check Caddy logs
railway logs caddy
```

### Build Failures
```bash
# Check build logs
railway logs --service hermes-token-screener

# Rebuild
railway up --build
```

---

## Cost
**$0/month** - Free tier includes:
- 500 compute hours
- HTTPS certificates
- Automatic scaling
- Log storage
- Bandwidth

---

## Next Steps

1. ✅ Dashboard deployed and accessible
2. ✅ Automatic HTTPS configured
3. ✅ Monitoring active
4. 🔄 Monitor token data updates
5. 🔄 Track token scoring improvements
6. 🔄 Consider adding custom domain (via Cloudflare)

---

## Support

- **Railway Dashboard**: https://railway.app
- **Project Logs**: `railway logs`
- **API Docs**: Built into dashboard at `/docs`

---

*Deployment created: $(date)*