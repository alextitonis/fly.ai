#!/bin/bash
# Setup script for Token Integration Pipeline

echo "=== Setting up Token Integration Pipeline ==="

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

echo "Python 3 found: $(python3 --version)"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip

# Install required packages
pip install requests
pip install telethon

# Check if requirements.txt exists, if not create one
if [ ! -f "requirements.txt" ]; then
    echo "Creating requirements.txt..."
    cat > requirements.txt << EOF
requests>=2.31.0
telethon>=1.24.0
EOF
fi

# Install from requirements.txt
pip install -r requirements.txt

# Create necessary directories
echo "Creating directories..."
mkdir -p data
mkdir -p logs

# Set up database files if they don't exist
echo "Setting up databases..."

# Create call_channels.db if it doesn't exist
if [ ! -f "data/call_channels.db" ]; then
    echo "Creating call_channels.db..."
    sqlite3 data/call_channels.db << EOF
CREATE TABLE IF NOT EXISTS discovered_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    token_name TEXT,
    token_address TEXT,
    chain TEXT,
    dex TEXT,
    price REAL,
    liquidity REAL,
    volume_24h REAL,
    source TEXT,
    discovery_method TEXT
);
EOF
fi

# Create integrated_tokens.db if it doesn't exist
if [ ! -f "data/integrated_tokens.db" ]; then
    echo "Creating integrated_tokens.db..."
    sqlite3 data/integrated_tokens.db << EOF
CREATE TABLE IF NOT EXISTS integrated_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    contract_address TEXT,
    chain TEXT,
    token_name TEXT,
    symbol TEXT,
    source TEXT,
    discovery_method TEXT,
    rick_burp_data TEXT,
    telegram_mentions INTEGER DEFAULT 0,
    telegram_channels TEXT,
    enrichment_data TEXT,
    priority_score REAL DEFAULT 0,
    priority_reason TEXT,
    status TEXT DEFAULT 'discovered'
);

CREATE TABLE IF NOT EXISTS integration_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    rick_burp_tokens INTEGER,
    telegram_tokens INTEGER,
    integrated_tokens INTEGER,
    enriched_tokens INTEGER,
    prioritized_tokens INTEGER,
    run_duration REAL
);
EOF
fi

# Create central_contracts.db if it doesn't exist
if [ ! -f "data/central_contracts.db" ]; then
    echo "Creating central_contracts.db..."
    sqlite3 data/central_contracts.db << EOF
CREATE TABLE IF NOT EXISTS telegram_contract_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT,
    message_id INTEGER,
    chain TEXT,
    contract_address TEXT,
    raw_address TEXT,
    address_source TEXT,
    message_text TEXT,
    observed_at REAL,
    session_source TEXT,
    inserted_at REAL
);

CREATE TABLE IF NOT EXISTS telegram_contracts_unique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain TEXT,
    contract_address TEXT,
    first_seen_at REAL,
    last_seen_at REAL,
    mentions INTEGER,
    last_channel_id TEXT,
    last_message_id INTEGER,
    last_raw_address TEXT,
    last_source TEXT,
    last_message_text TEXT,
    channel_count INTEGER,
    channels_seen TEXT
);
EOF
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Set up Telegram session (if not already done):"
echo "   python3 scripts/telegram_user.py"
echo ""
echo "2. Run token integration:"
echo "   python3 scripts/token_integration.py"
echo ""
echo "3. Check output:"
echo "   cat data/token_screener/top100.json | jq '.top_tokens[:5]'"
echo ""
echo "4. Set up cron jobs (optional):"
echo "   crontab -e"
echo "   # Add: 0 */6 * * * cd $(pwd) && python3 scripts/token_integration.py"
echo ""
echo "For more information, see TOKEN_INTEGRATION_README.md"