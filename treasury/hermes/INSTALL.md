# Hermes Token Screener Installation Guide

## Prerequisites

### System Requirements
- OS: Ubuntu 22.04 LTS or later
- RAM: 8GB minimum, 16GB recommended
- Storage: 50GB free disk space
- Python: 3.10 or higher
- Node.js: 18.x or higher
- NVIDIA GPU (optional): For GPU acceleration

### Software Dependencies
```bash
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv \
    nodejs npm build-essential docker.io docker-compose \
    net-tools curl wget jq git ufw unattended-upgrades
```

## Installation Steps

### 1. Clone and Setup
```bash
# Clone the repository
git clone https://github.com/TerexitariusStomp/hermes-token-screener.git
cd hermes-token-screener

# Make scripts executable
chmod +x scripts/*.py

# Create virtual environment
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Python Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Install Node Dependencies
```bash
# Install pnpm
npm install -g pnpm

# Install Hummingbot Gateway dependencies
cd packages/gateway
pnpm install
pnpm build
cd ../..
```

### 4. Configure Environment
```bash
# Copy configuration templates
cp conf/apiKeys.yml.example conf/apiKeys.yml
cp .env.example .env

# Edit configuration files
nano conf/apiKeys.yml  # Add your API keys
nano .env              # Set environment variables
```

### 5. Set Up Systemd Services
```bash
# Copy service files
sudo cp systemd/*.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable hermes-gateway.service
sudo systemctl enable trading-daemon.service
sudo systemctl start hermes-gateway.service
```

### 6. Configure Firewall
```bash
# Enable firewall
sudo ufw enable

# Allow necessary ports
sudo ufw allow ssh
sudo ufw allow from 127.0.0.1 to any port 15888
sudo ufw allow 8443  # Cloudflare Tunnel
```

## Post-Installation

### 1. Obtain API Keys
- **Jupiter**: https://portal.jup.ag
- **Helius**: https://www.helius.xyz
- **Etherscan**: https://etherscan.io
- **CoinGecko**: https://www.coingecko.com
- **DefiLlama**: https://docs.defillama.com

### 2. Configure Wallets
Add your wallet files to `~/.hermes/conf/wallets/`:
```bash
mkdir -p ~/.hermes/conf/wallets
# Copy your wallet files here
```

### 3. Start Trading
```bash
# Start Gateway
hermes gateway run --replace --passphrase "YOUR_SECURE_PASSPHRASE"

# Start Trading Daemon
python3 scripts/trading_daemon.py
```

## Troubleshooting

### Common Issues

#### Gateway Not Starting
- Check logs: `tail -f ~/.hermes/gateway/logs/gateway.log`
- Verify port 15888 is free: `sudo netstat -tulpn | grep 15888`
- Ensure passphrase is set

#### Python Module Not Found
```bash
# Reinstall requirements
pip install --upgrade -r requirements.txt

# Install specific missing package
pip install pandas numpy web3
```

#### Permission Denied
```bash
# Make scripts executable
chmod +x scripts/*.py

# Check directory permissions
sudo chown -R $USER:$USER ~/.hermes
```

### Debugging Commands
```bash
# Check all processes
ps aux | grep -E "(hermes|gateway|trading_daemon|trade_monitor|token_enricher|token_discovery)"

# Check network connections
sudo netstat -tulpn | grep 15888

# Check disk space
df -h

# Check memory usage
free -h

# Check system logs
sudo journalctl -u hermes-gateway.service --since "1 hour ago"
sudo journalctl -u trading-daemon.service --since "1 hour ago"
```

## Maintenance

### Regular Tasks
- **Daily**: Check logs for errors, verify API keys are working
- **Weekly**: Update dependencies, review system performance
- **Monthly**: Rotate API keys, check wallet balances, update configurations

### Updating
```bash
# Pull latest changes
git pull origin main

# Update dependencies
pip install --upgrade -r requirements.txt
cd packages/gateway && pnpm install && pnpm build

# Restart services
sudo systemctl restart hermes-gateway.service
sudo systemctl restart trading-daemon.service
```

## Support

If you encounter issues not covered in this guide, please:
1. Check the logs first
2. Search GitHub Issues
3. Open a new issue with detailed error messages and logs