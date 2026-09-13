#!/usr/bin/env python3
"""
[ARCHIVED] Telegram Contract Address Scraper

STATUS: This scraper is archived due to Telegram account restrictions.
The token screener uses non-Telegram sources as primary data:
  - pumpportal_harvester.py (1,563+ contracts)
  - dexscreener_discovery.py (9,106+ contracts) 
  - gmgn_harvester.py (119+ contracts)

If you have a working Telegram session with crypto call channels,
this scraper can still extract contract addresses from message history.

See RECOMMENDED_CHANNELS.md for curated channel recommendations.

Usage (requires working Telethon session):
  python3 telegram_scraper.py --max-dialogs 50
"""

import asyncio
import json
import logging
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Path.home() / '.hermes' / 'logs' / 'telegram_scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Contract address patterns
SOLANA_PATTERN = re.compile(r'\b[1-9A-HJ-NP-Za-km-z]{32,44}\b')
ETH_PATTERN = re.compile(r'0x[a-fA-F0-9]{40}')
PUMP_FUN_PATTERN = re.compile(r'pump\.fun/([1-9A-HJ-NP-Za-km-z]{32,44})')
GMGN_PATTERN = re.compile(r'gmgn\.ai/sol/token/\w+_([1-9A-HJ-NP-Za-km-z]{32,44})')
DEXSCREENER_PATTERN = re.compile(r'dexscreener\.com/solana/([1-9A-HJ-NP-Za-km-z]{32,44})')

# Database setup
DB_PATH = Path.home() / '.hermes' / 'data' / 'central_contracts.db'
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Archive notice
ARCHIVE_NOTICE = """
WARNING: This script is archived. Telegram accounts get frozen for joining 
too many channels. Primary data sources are:
  1. pumpportal_harvester.py  (real-time new launches)
  2. dexscreener_discovery.py (boosted + profiled tokens)
  3. gmgn_harvester.py        (trending Solana tokens)

See RECOMMENDED_CHANNELS.md for manual channel recommendations.
"""

MESSAGES_PER_DIALOG = 200

# State file
STATE_FILE = Path.home() / '.hermes' / 'data' / 'scraper_state.json'

def load_state():
    """Load scraper state from file."""
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except:
            pass
    return {'last_seen_per_chat': {}, 'last_run': 0, 'known_dialogs': []}

def save_state(state):
    """Save scraper state to file."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def init_db():
    """Initialize the database tables."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute('''
        CREATE TABLE IF NOT EXISTS telegram_contract_extractions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL,
            message_id INTEGER NOT NULL,
            chain TEXT NOT NULL,
            contract_address TEXT NOT NULL,
            raw_address TEXT NOT NULL,
            address_source TEXT NOT NULL,
            message_text TEXT,
            observed_at REAL NOT NULL,
            session_source TEXT DEFAULT 'tg_scraper',
            inserted_at REAL NOT NULL,
            UNIQUE(channel_id, message_id, contract_address)
        )
    ''')
    conn.commit()
    return conn

def insert_extraction(conn, channel_id: str, message_id: int,
                      chain: str, contract_address: str, raw_address: str,
                      address_source: str, message_text: str = None,
                      observed_at: float = None):
    """Insert a contract extraction into the database."""
    if observed_at is None:
        observed_at = time.time()

    try:
        conn.execute('''
            INSERT OR IGNORE INTO telegram_contract_extractions
            (channel_id, message_id, chain, contract_address, raw_address,
             address_source, message_text, observed_at, inserted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (str(channel_id), message_id, chain, contract_address, raw_address,
              address_source, message_text, observed_at, time.time()))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Database error: {e}")
        return False

async def get_all_dialogs(client) -> list:
    """Get all dialogs from the client."""
    dialogs = []
    try:
        async for dialog in client.iter_dialogs():
            entity = dialog.entity
            if hasattr(entity, 'broadcast') or hasattr(entity, 'megagroup') or \
               (hasattr(entity, 'left') and not entity.left):
                dialogs.append(dialog)
    except Exception as e:
        logger.error(f"Error getting dialogs: {e}")
    return dialogs

async def poll_dialog(client, dialog, last_seen: dict, conn, dry_run: bool = False) -> int:
    """Poll a single dialog for new messages with contract addresses."""
    chat_id = dialog.id
    chat_title = getattr(dialog.entity, 'title', None) or str(chat_id)
    last_id = last_seen.get(str(chat_id), 0)

    logger.info(f"Polling: {chat_title} (ID: {chat_id}, last_msg: {last_id})")

    try:
        messages = await client.get_messages(dialog.entity, limit=MESSAGES_PER_DIALOG)
    except Exception as e:
        logger.error(f"Error fetching messages from {chat_title}: {e}")
        return 0

    new_contracts = 0
    max_msg_id = last_id

    for msg in messages:
        if not hasattr(msg, 'text') or not msg.text:
            continue
        if msg.id <= last_id:
            continue

        max_msg_id = max(max_msg_id, msg.id)
        text = msg.text
        observed_at = msg.date.timestamp()

        # Extract contract addresses
        for pattern, chain, source in [
            (PUMP_FUN_PATTERN, 'solana', 'pump_fun_link'),
            (GMGN_PATTERN, 'solana', 'gmgn_link'),
            (DEXSCREENER_PATTERN, 'solana', 'dexscreener_link'),
            (SOLANA_PATTERN, 'solana', 'solana_raw'),
            (ETH_PATTERN, 'ethereum', 'eth_raw'),
        ]:
            for match in pattern.finditer(text):
                address = match.group(1) if pattern.groups else match.group(0)

                if chain == 'solana' and source == 'solana_raw':
                    if len(address) < 32 or len(address) > 44:
                        continue
                    if PUMP_FUN_PATTERN.search(text) or GMGN_PATTERN.search(text):
                        continue

                if not dry_run:
                    insert_extraction(conn, str(chat_id), msg.id, chain,
                                    address.lower(), address, source,
                                    text[:500], observed_at)
                new_contracts += 1

    last_seen[str(chat_id)] = max_msg_id
    return new_contracts

async def main():
    print(ARCHIVE_NOTICE)

    try:
        from telethon import TelegramClient
    except ImportError:
        print("ERROR: pip install telethon")
        sys.exit(1)

    # Load config
    config_path = Path.home() / '.hermes' / 'config.yaml'
    try:
        import yaml
        with open(config_path) as f:
            config = yaml.safe_load(f)
        api_id = config.get('telegram', {}).get('api_id')
        api_hash = config.get('telegram', {}).get('api_hash')
        phone = config.get('telegram', {}).get('phone')
    except Exception as e:
        logger.error(f"Config error: {e}")
        api_id, api_hash, phone = None, None, None

    if not api_id or not api_hash:
        print("ERROR: Telegram API credentials not found in config.yaml")
        print("See RECOMMENDED_CHANNELS.md for non-Telegram data sources")
        sys.exit(1)

    # Initialize
    state = load_state()
    conn = init_db()
    last_seen = state.get('last_seen_per_chat', {})

    session_path = Path.home() / '.hermes' / 'sessions' / 'hermes_scraper'
    session_path.parent.mkdir(parents=True, exist_ok=True)

    client = TelegramClient(str(session_path), api_id, api_hash)
    await client.start(phone=phone)

    me = await client.get_me()
    logger.info(f"Logged in as: {me.first_name} (@{me.username or 'N/A'})")

    # Get and poll dialogs
    dialogs = await get_all_dialogs(client)
    logger.info(f"Found {len(dialogs)} dialogs")

    total_contracts = 0
    for dialog in dialogs:
        contracts = await poll_dialog(client, dialog, last_seen, conn)
        total_contracts += contracts
        await asyncio.sleep(1)

    # Save state
    state['last_seen_per_chat'] = last_seen
    state['last_run'] = time.time()
    save_state(state)

    conn.close()
    logger.info(f"Done. Total new contracts: {total_contracts}")

if __name__ == '__main__':
    asyncio.run(main())
