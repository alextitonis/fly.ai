# Hermes Token Screener & Trading System

A comprehensive DeFi trading system with AI-powered token analysis, automated trading, and community monitoring.

## Features

- **AI Trading Brain**: Analyzes tokens and executes trades
- **Token Enricher**: Fetches comprehensive data from multiple sources
- **Token Discovery**: Discovers new tokens across multiple chains
- **Trade Monitor**: Monitors positions and market conditions
- **Copytrade Monitor**: Tracks smart money wallets
- **Hummingbot Gateway Integration**: Direct DEX trading via Jupiter, Meteora, Raydium, Uniswap, etc.
- **Multi-chain Support**: Solana, Ethereum, and more

## Setup Guide

### Prerequisites

- Ubuntu 22.04+
- Python 3.10+
- Node.js 18+
- NVIDIA GPU drivers (if using GPU acceleration)

### Installation

1. Clone and install:
```bash
git clone https://github.com/TerexitariusStomp/hermes-token-screener.git
cd hermes-token-screener
./install.sh
```

2. Configure API keys:
```bash
cp conf/apiKeys.yml.example conf/apiKeys.yml
# Edit conf/apiKeys.yml with your actual API keys
```

3. Set up Hummingbot Gateway:
```bash
cd packages/gateway
pnpm install
pnpm build
# Configure conf/server.yml and conf/apiKeys.yml
```

4. Start the system:
```bash
hermes gateway run --replace --passphrase "YOUR_PASSPHRASE"
python3 scripts/trading_daemon.py
```

## Configuration

### API Keys
Edit `conf/apiKeys.yml` with your keys:
- Jupiter API key (from https://portal.jup.ag)
- Helius/RPC providers
- Etherscan
- CoinGecko
- DefiLlama

### Chains & Connectors
Configure chains in `conf/chains/` and connectors in `conf/connectors/`.

## Systemd Services
Install systemd services for auto-start:
```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hermes-gateway.service trading-daemon.service
sudo systemctl start hermes-gateway.service
```

## Usage

### Basic Commands
Start Gateway:
```bash
hermes gateway run --replace --passphrase "your-passphrase"
```

Start Trading Daemon:
```bash
python3 scripts/trading_daemon.py
```

Check status:
```bash
curl http://localhost:15888/health
curl http://localhost:15888/chains/solana/status
```

View logs:
```bash
tail -f ~/.hermes/logs/trading_daemon.log
```

### Available Endpoints
- `GET /health` - Health check
- `GET /chains/{chain}/status` - Chain status
- `POST /connectors/{dex}/router/quote` - Get swap quote
- `POST /connectors/{dex}/router/swap` - Execute swap

## Troubleshooting

### Gateway Not Responding
1. Check if Gateway is running: `ps aux | grep gateway`
2. Verify port 15888 is listening: `sudo netstat -tulpn | grep 15888`
3. Check logs: `tail -f ~/.hermes/gateway/logs/gateway.log`

### Trading Daemon Errors
1. Check daemon logs: `tail -f ~/.hermes/logs/trading_daemon.log`
2. Verify all scripts are executable: `chmod +x scripts/*.py`
3. Check dependencies: `pip list | grep -E "(pandas|numpy|web3)"`

### API Keys Not Working
1. Verify keys are correctly set in `conf/apiKeys.yml`
2. Check that the file is properly formatted YAML
3. Restart Gateway after changes: `sudo systemctl restart hermes-gateway.service`

## Security

### API Key Protection
- Never commit real API keys to Git
- Use environment variables for sensitive data
- Encrypt wallet files

### Firewall
Only allow necessary ports:
```bash
# Allow Gateway on 15888 only from localhost
sudo ufw allow from 127.0.0.1 to any port 15888
# Allow SSH
sudo ufw allow ssh
```

## Support

For issues and feature requests, please use the GitHub Issues page.

## Contributing

Pull requests are welcome! Please read the CONTRIBUTING.md guide first.

## License

MIT License - see LICENSE file for details.