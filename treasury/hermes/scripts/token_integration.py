#!/usr/bin/env python3
"""
Token Integration Pipeline
Integrates contracts from Rick Burp bot with existing Telegram scraper data,
then runs through enrichment and prioritization.

Workflow:
1. Read contracts from call_channels.db (Rick Burp bot)
2. Read contracts from central_contracts.db (existing telegram scraper)
3. Merge and deduplicate contracts
4. Run through enrichment pipeline
5. Prioritize based on Rick Burp data (performance, liquidity, etc.)
6. Output prioritized tokens for trading/screener
"""

import asyncio
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import requests
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config

from hermes_screener.config import settings

# Add paths
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import existing enrichment modules
from hermes_screener.logging import get_logger

log = get_logger("token_integration")

# Configuration
CALL_CHANNELS_DB = Path.home() / ".hermes" / "call_channels.db"
CENTRAL_CONTRACTS_DB = Path.home() / ".hermes" / "data" / "central_contracts.db"
INTEGRATION_DB = Path.home() / ".hermes" / "data" / "integrated_tokens.db"
OUTPUT_PATH = Path.home() / ".hermes" / "data" / "token_screener" / "top100.json"


class TokenIntegrationPipeline:
    """Integrates tokens from multiple sources and enriches them."""

    def __init__(self):
        self.call_channels_conn = None
        self.central_contracts_conn = None
        self.integration_conn = None

    def init_databases(self):
        """Initialize database connections."""
        # Connect to call_channels.db
        if CALL_CHANNELS_DB.exists():
            self.call_channels_conn = sqlite3.connect(CALL_CHANNELS_DB)
            log.info(f"Connected to call_channels.db: {CALL_CHANNELS_DB}")
        else:
            log.warning(f"call_channels.db not found: {CALL_CHANNELS_DB}")

        # Connect to central_contracts.db
        if CENTRAL_CONTRACTS_DB.exists():
            self.central_contracts_conn = sqlite3.connect(CENTRAL_CONTRACTS_DB)
            log.info(f"Connected to central_contracts.db: {CENTRAL_CONTRACTS_DB}")
        else:
            log.warning(f"central_contracts.db not found: {CENTRAL_CONTRACTS_DB}")

        # Create integration database
        self.integration_conn = sqlite3.connect(INTEGRATION_DB)
        self._init_integration_schema()
        log.info(f"Integration database: {INTEGRATION_DB}")

    def _init_integration_schema(self):
        """Initialize integration database schema."""
        cursor = self.integration_conn.cursor()

        # Create integrated_tokens table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS integrated_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                contract_address TEXT UNIQUE,
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
            )
        """)

        # Create integration_runs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS integration_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                rick_burp_tokens INTEGER,
                telegram_tokens INTEGER,
                integrated_tokens INTEGER,
                enriched_tokens INTEGER,
                prioritized_tokens INTEGER,
                run_duration REAL
            )
        """)

        self.integration_conn.commit()

    def get_rick_burp_tokens(self) -> list[dict]:
        """Get tokens from Rick Burp bot database."""
        tokens = []

        if not self.call_channels_conn:
            log.warning("No call_channels.db connection")
            return tokens

        cursor = self.call_channels_conn.cursor()

        # Get discovered tokens
        try:
            cursor.execute("""
                SELECT token_name, token_address, chain, dex, price, liquidity, volume_24h, source
                FROM discovered_tokens
                WHERE token_address IS NOT NULL
                ORDER BY timestamp DESC
            """)

            for row in cursor.fetchall():
                token = {
                    "name": row[0],
                    "address": row[1],
                    "chain": row[2],
                    "dex": row[3],
                    "price": row[4],
                    "liquidity": row[5],
                    "volume_24h": row[6],
                    "source": row[7],
                    "rick_burp_data": {
                        "discovery_method": "rick_burp_bot",
                        "dex": row[3],
                        "price": row[4],
                        "liquidity": row[5],
                        "volume_24h": row[6],
                    },
                }
                tokens.append(token)

            log.info(f"Found {len(tokens)} tokens from Rick Burp bot")

        except Exception as e:
            log.error(f"Error reading Rick Burp tokens: {e}")

        return tokens

    def get_telegram_tokens(self) -> list[dict]:
        """Get tokens from existing Telegram scraper database."""
        tokens = []

        if not self.central_contracts_conn:
            log.warning("No central_contracts.db connection")
            return tokens

        cursor = self.central_contracts_conn.cursor()

        try:
            # Get unique contracts with mention counts
            cursor.execute("""
                SELECT chain, contract_address, mentions, channels_seen, last_message_text
                FROM telegram_contracts_unique
                WHERE contract_address IS NOT NULL
                ORDER BY mentions DESC, last_seen_at DESC
            """)

            for row in cursor.fetchall():
                token = {
                    "chain": row[0],
                    "address": row[1],
                    "mentions": row[2],
                    "channels_seen": row[3],
                    "last_message": row[4],
                    "source": "telegram_scraper",
                    "telegram_data": {
                        "mentions": row[2],
                        "channels": row[3],
                        "last_message": row[4],
                    },
                }
                tokens.append(token)

            log.info(f"Found {len(tokens)} tokens from Telegram scraper")

        except Exception as e:
            log.error(f"Error reading Telegram tokens: {e}")

        return tokens

    def merge_and_deduplicate(self, rick_tokens: list[dict], telegram_tokens: list[dict]) -> list[dict]:
        """Merge tokens from both sources and deduplicate."""
        merged = {}

        # Process Rick Burp tokens first (higher priority)
        for token in rick_tokens:
            address = token.get("address", "").lower()
            if address:
                merged[address] = {
                    "address": address,
                    "chain": token.get("chain", "solana"),
                    "name": token.get("name", ""),
                    "symbol": "",
                    "source": "rick_burp",
                    "discovery_method": "rick_burp_bot",
                    "rick_burp_data": token.get("rick_burp_data", {}),
                    "telegram_data": {},
                    "enrichment_data": {},
                    "priority_score": 0,
                    "priority_reason": "",
                }

        # Merge Telegram tokens
        for token in telegram_tokens:
            address = token.get("address", "").lower()
            if address:
                if address in merged:
                    # Token exists from Rick Burp, merge data
                    merged[address]["telegram_data"] = token.get("telegram_data", {})
                    merged[address]["source"] = "both"
                else:
                    # New token from Telegram
                    merged[address] = {
                        "address": address,
                        "chain": token.get("chain", "solana"),
                        "name": "",
                        "symbol": "",
                        "source": "telegram",
                        "discovery_method": "telegram_scraper",
                        "rick_burp_data": {},
                        "telegram_data": token.get("telegram_data", {}),
                        "enrichment_data": {},
                        "priority_score": 0,
                        "priority_reason": "",
                    }

        merged_list = list(merged.values())
        log.info(
            f"Merged {len(merged_list)} unique tokens (Rick: {len(rick_tokens)}, Telegram: {len(telegram_tokens)})"
        )

        return merged_list

    async def get_lore_data_from_rick(self, tokens: list[dict]) -> dict[str, dict]:
        """Get lore data from Rick Burp bot for tokens."""
        lore_data = {}

        if not tokens:
            return lore_data

        try:
            # Import Telegram client
            from telethon import TelegramClient

            # Configuration
            SESSION_PATH = settings.session_path
            TG_API_ID = settings.tg_api_id
            TG_API_HASH = settings.tg_api_hash

            # Create client
            client = TelegramClient(str(SESSION_PATH), TG_API_ID, TG_API_HASH)
            await client.connect()

            if not await client.is_user_authorized():
                log.warning("Not authorized for Telegram. Skipping lore data.")
                return lore_data

            # Find the RickBurp channel
            channel = None
            async for dialog in client.iter_dialogs():
                if hasattr(dialog.entity, "title") and "rickburp" in dialog.entity.title.lower():
                    channel = dialog.entity
                    log.info(f"Found channel: {channel.title}")
                    break

            if not channel:
                log.warning("Could not find RickBurp channel. Skipping lore data.")
                await client.disconnect()
                return lore_data

            # Get lore for each token
            for i, token in enumerate(tokens[:10]):  # Limit to 10 tokens
                address = token.get("address", "")
                name = token.get("name", "unknown")

                if not address:
                    continue

                log.info(f"  Getting lore for {name} ({address[:20]}...)...")

                try:
                    # Get messages before sending command
                    messages_before = await client.get_messages(channel, limit=1)
                    last_msg_id_before = messages_before[0].id if messages_before else 0

                    # Send /lore command (without @rick - just the address)
                    await client.send_message(channel, f"/lore {address}")
                    await asyncio.sleep(4)  # Wait for response

                    # Get new messages after our command
                    messages_after = await client.get_messages(channel, limit=10)

                    # Find the bot's response
                    bot_response = None
                    me = await client.get_me()
                    for msg in messages_after:
                        if msg.id > last_msg_id_before and msg.message:
                            # Check if this is from the bot (Rick)
                            if msg.sender_id and msg.sender_id != me.id:
                                # This is likely the bot's response
                                bot_response = msg.message
                                break

                    if not bot_response:
                        # Fallback: look for any message with relevant keywords
                        for msg in messages_after:
                            if msg.message and len(msg.message) > 50:
                                if any(keyword in msg.message.lower() for keyword in ["lore", name.lower()]):
                                    bot_response = msg.message
                                    break

                    # Parse lore response
                    if bot_response:
                        # Check if it's a successful lore response
                        # Successful lore responses are typically longer than 50 characters
                        # and don't contain "No token found"
                        if "No token found" not in bot_response and len(bot_response) > 50:
                            lore_data[address.lower()] = {
                                "lore_response": bot_response,
                                "has_lore": True,
                                "lore_source": "rick_burp_bot",
                            }
                            log.info(f"    Found lore for {name}")
                        else:
                            lore_data[address.lower()] = {
                                "lore_response": bot_response,
                                "has_lore": False,
                                "lore_source": "rick_burp_bot",
                            }
                            log.info(f"    No lore found for {name}")
                    else:
                        lore_data[address.lower()] = {
                            "lore_response": bot_response or "",
                            "has_lore": False,
                            "lore_source": "rick_burp_bot",
                        }

                    # Small delay between commands
                    if i < len(tokens) - 1:
                        await asyncio.sleep(2)

                except Exception as e:
                    log.error(f"Error getting lore for {name}: {e}")
                    lore_data[address.lower()] = {
                        "lore_response": f"Error: {str(e)}",
                        "has_lore": False,
                        "lore_source": "rick_burp_bot",
                    }

            await client.disconnect()
            log.info(f"Got lore data for {len(lore_data)} tokens")

        except Exception as e:
            log.error(f"Error in get_lore_data_from_rick: {e}")

        return lore_data

    async def enrich_tokens(self, tokens: list[dict], max_enrich: int = 50) -> list[dict]:
        """Enrich tokens using the existing enrichment pipeline and Rick Burp bot lore."""
        enriched_tokens = []

        # Limit to max_enrich tokens
        tokens_to_enrich = tokens[:max_enrich]
        log.info(f"Enriching {len(tokens_to_enrich)} tokens...")

        # First, try to get lore data from Rick Burp bot for top tokens
        log.info("Getting lore data from Rick Burp bot for top tokens...")
        lore_data = await self.get_lore_data_from_rick(tokens_to_enrich[:10])  # Top 10 tokens

        # Add lore data to tokens
        for token in tokens_to_enrich:
            address = token.get("address", "").lower()
            if address in lore_data:
                token["lore_data"] = lore_data[address]
                log.info(f"  Added lore data for {token.get('name', 'unknown')}")

        # Try to use existing token_enricher.py via subprocess
        try:
            # Create a temporary file with token addresses
            import json
            import tempfile

            # Prepare token addresses for enrichment
            addresses = []
            for token in tokens_to_enrich:
                if token.get("address"):
                    addresses.append(
                        {
                            "chain": token.get("chain", "solana"),
                            "contract": token["address"],
                            "symbol": token.get("symbol", ""),
                            "name": token.get("name", ""),
                        }
                    )

            if not addresses:
                log.warning("No token addresses to enrich")
                return tokens_to_enrich

            # Write addresses to temporary file
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(addresses, f)
                temp_file = f.name

            try:
                # Run token_enricher.py with the addresses
                import subprocess

                # Change to scripts directory
                scripts_dir = Path(__file__).parent
                cmd = [
                    sys.executable,
                    str(scripts_dir / "token_enricher.py"),
                    "--max-tokens",
                    str(max_enrich),
                    "--async-mode",
                ]

                log.info(f"Running token_enricher.py with {len(addresses)} tokens...")
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300,  # 5 minute timeout
                    cwd=str(scripts_dir),
                )

                if result.returncode == 0:
                    log.info("Token enrichment completed successfully")

                    # Try to read enrichment results
                    output_path = Path.home() / ".hermes" / "data" / "token_screener" / "top100.json"
                    if output_path.exists():
                        with open(output_path) as f:
                            enrichment_data = json.load(f)

                        # Create a mapping of addresses to enrichment data
                        enrichment_map = {}
                        for enriched_token in enrichment_data.get("top_tokens", []):
                            address = enriched_token.get("address", "").lower()
                            if address:
                                enrichment_map[address] = enriched_token

                        # Merge enrichment data back into tokens
                        for token in tokens_to_enrich:
                            address = token.get("address", "").lower()
                            if address in enrichment_map:
                                token["enrichment_data"] = enrichment_map[address].get("enrichment_data", {})
                                token["enrichment_data"]["enriched_by"] = "token_enricher.py"
                            enriched_tokens.append(token)
                    else:
                        log.warning("No enrichment output found, using basic enrichment")
                        # Fallback to basic enrichment
                        for token in tokens_to_enrich:
                            enriched = self._basic_enrichment(token)
                            token["enrichment_data"] = enriched
                            enriched_tokens.append(token)
                else:
                    log.warning(f"Token enricher failed: {result.stderr}")
                    # Fallback to basic enrichment
                    for token in tokens_to_enrich:
                        enriched = self._basic_enrichment(token)
                        token["enrichment_data"] = enriched
                        enriched_tokens.append(token)

            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_file)
                except Exception:
                    pass

        except Exception as e:
            log.error(f"Error in enrichment pipeline: {e}")
            log.info("Using basic enrichment instead...")

            # Fallback to basic enrichment
            for token in tokens_to_enrich:
                enriched = self._basic_enrichment(token)
                token["enrichment_data"] = enriched
                enriched_tokens.append(token)

        log.info(f"Enriched {len(enriched_tokens)} tokens")
        return enriched_tokens

    def _basic_enrichment(self, token: dict) -> dict:
        """Basic enrichment using DexScreener API, merged with Rick Burp data and lore."""
        enrichment = {}

        address = token.get("address", "")
        if not address:
            return enrichment

        # First, include Rick Burp data if available
        rick_data = token.get("rick_burp_data", {})
        if rick_data:
            enrichment["rick_burp_data"] = rick_data
            enrichment["enriched_by"] = "rick_burp + dexscreener"

        # Include lore data if available
        lore_data = token.get("lore_data", {})
        if lore_data:
            enrichment["lore_data"] = lore_data
            if "enriched_by" in enrichment:
                enrichment["enriched_by"] += " + lore"
            else:
                enrichment["enriched_by"] = "lore + dexscreener"

        try:
            # Use DexScreener API
            url = f"https://api.dexscreener.com/latest/dex/tokens/{address}"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if "pairs" in data and data["pairs"]:
                    pair = data["pairs"][0]

                    # Get enrichment data
                    enrichment_data = {
                        "dex": pair.get("dexId", ""),
                        "price_usd": pair.get("priceUsd", ""),
                        "liquidity_usd": pair.get("liquidity", {}).get("usd", ""),
                        "volume_24h": pair.get("volume", {}).get("h24", ""),
                        "price_change_24h": pair.get("priceChange", {}).get("h24", ""),
                        "txns_24h": pair.get("txns", {}).get("h24", {}),
                        "fdv": pair.get("fdv", ""),
                        "market_cap": pair.get("marketCap", ""),
                    }

                    # Merge with Rick Burp data if available
                    if rick_data:
                        # Use Rick Burp data as primary, enrichment as secondary
                        enrichment.update(enrichment_data)

                        # Override with Rick Burp data if it's more recent/accurate
                        if rick_data.get("liquidity"):
                            enrichment["liquidity_rick"] = rick_data["liquidity"]
                        if rick_data.get("volume_24h"):
                            enrichment["volume_24h_rick"] = rick_data["volume_24h"]
                        if rick_data.get("price"):
                            enrichment["price_rick"] = rick_data["price"]
                    else:
                        enrichment.update(enrichment_data)
        except Exception as e:
            log.debug(f"Basic enrichment failed for {address}: {e}")

        return enrichment

    def prioritize_tokens(self, tokens: list[dict]) -> list[dict]:
        """Prioritize tokens based on Rick Burp data, Telegram data, enrichment, and lore."""
        for token in tokens:
            score = 0
            reasons = []

            # Rick Burp data scoring (high priority - from curated bot)
            rick_data = token.get("rick_burp_data", {})
            if rick_data:
                # Liquidity scoring (from Rick Burp)
                liquidity = rick_data.get("liquidity")
                if liquidity:
                    try:
                        liq_val = float(liquidity)
                        if liq_val > 100000:
                            score += 40  # Increased from 30
                            reasons.append(f"High liquidity (Rick): ${liq_val:,.0f}")
                        elif liq_val > 50000:
                            score += 30  # Increased from 20
                            reasons.append(f"Good liquidity (Rick): ${liq_val:,.0f}")
                        elif liq_val > 10000:
                            score += 20  # Increased from 10
                            reasons.append(f"Moderate liquidity (Rick): ${liq_val:,.0f}")
                    except Exception:
                        pass

                # Volume scoring (from Rick Burp)
                volume = rick_data.get("volume_24h")
                if volume:
                    try:
                        vol_val = float(volume)
                        if vol_val > 100000:
                            score += 30  # Increased from 20
                            reasons.append(f"High volume (Rick): ${vol_val:,.0f}")
                        elif vol_val > 50000:
                            score += 20  # Increased from 15
                            reasons.append(f"Good volume (Rick): ${vol_val:,.0f}")
                        elif vol_val > 10000:
                            score += 10
                            reasons.append(f"Moderate volume (Rick): ${vol_val:,.0f}")
                    except Exception:
                        pass

                # Price data from Rick Burp
                price = rick_data.get("price")
                if price:
                    try:
                        price_val = float(price)
                        if price_val > 0:
                            score += 5
                            reasons.append("Price data available (Rick)")
                    except Exception:
                        pass

                # DEX information from Rick Burp
                dex = rick_data.get("dex")
                if dex:
                    score += 5
                    reasons.append(f"Listed on {dex} (Rick)")

            # Lore data scoring (from Rick Burp bot)
            lore_data = token.get("lore_data", {})
            if lore_data and lore_data.get("has_lore", False):
                score += 15  # Bonus for having lore
                reasons.append("Has token lore (Rick)")

                # Parse lore response for additional info
                lore_response = lore_data.get("lore_response", "")
                if lore_response:
                    # Look for specific information in lore
                    if "🔥" in lore_response or "hot" in lore_response.lower():
                        score += 5
                        reasons.append("Hot token (lore)")
                    if "🛡️" in lore_response or "safe" in lore_response.lower():
                        score += 5
                        reasons.append("Safe token (lore)")
                    if "💀" in lore_response or "risk" in lore_response.lower():
                        score -= 5
                        reasons.append("Risky token (lore)")

            # Telegram data scoring
            telegram_data = token.get("telegram_data", {})
            if telegram_data:
                mentions = telegram_data.get("mentions", 0)
                if mentions > 10:
                    score += 25
                    reasons.append(f"High Telegram mentions: {mentions}")
                elif mentions > 5:
                    score += 15
                    reasons.append(f"Good Telegram mentions: {mentions}")
                elif mentions > 0:
                    score += 5
                    reasons.append(f"Telegram mentions: {mentions}")

                # Channel diversity
                channels = telegram_data.get("channels", "")
                if channels:
                    channel_count = len(channels.split(",")) if channels else 0
                    if channel_count > 3:
                        score += 10
                        reasons.append(f"Multiple channels: {channel_count}")

            # Enrichment data scoring
            enrichment = token.get("enrichment_data", {})
            if enrichment:
                # Price momentum
                price_change = enrichment.get("price_change_24h")
                if price_change:
                    try:
                        change_val = float(price_change)
                        if change_val > 100:
                            score += 20
                            reasons.append(f"Strong momentum: +{change_val:.1f}%")
                        elif change_val > 50:
                            score += 15
                            reasons.append(f"Good momentum: +{change_val:.1f}%")
                        elif change_val > 0:
                            score += 5
                            reasons.append(f"Positive momentum: +{change_val:.1f}%")
                        elif change_val < -50:
                            score -= 10  # Penalty for large drops
                            reasons.append(f"Large drop: {change_val:.1f}%")
                    except Exception:
                        pass

                # Transaction activity
                txns = enrichment.get("txns_24h", {})
                if txns:
                    buys = txns.get("buys", 0)
                    sells = txns.get("sells", 0)
                    if buys > 100:
                        score += 15
                        reasons.append(f"Active trading: {buys} buys")
                    elif buys > 50:
                        score += 10
                        reasons.append(f"Moderate trading: {buys} buys")

                    # Buy/sell ratio
                    if buys > 0 and sells > 0:
                        buy_ratio = buys / (buys + sells)
                        if buy_ratio > 0.6:
                            score += 10
                            reasons.append(f"High buy ratio: {buy_ratio:.1%}")
                        elif buy_ratio < 0.4:
                            score -= 5
                            reasons.append(f"Low buy ratio: {buy_ratio:.1%}")

                # FDV (Fully Diluted Valuation)
                fdv = enrichment.get("fdv")
                if fdv:
                    try:
                        fdv_val = float(fdv)
                        if fdv_val > 0:
                            score += 5
                            reasons.append(f"FDV: ${fdv_val:,.0f}")
                    except Exception:
                        pass

            # Source bonus (prioritize Rick Burp tokens)
            if token.get("source") == "rick_burp":
                score += 15  # Increased from 10
                reasons.append("From Rick Burp bot (curated)")
            elif token.get("source") == "both":
                score += 20  # Increased from 15
                reasons.append("From multiple sources (Rick + Telegram)")

            # Update token
            token["priority_score"] = score
            token["priority_reason"] = "; ".join(reasons) if reasons else "No specific criteria"

        # Sort by priority score
        tokens.sort(key=lambda x: x.get("priority_score", 0), reverse=True)

        return tokens

    def store_integrated_tokens(self, tokens: list[dict]):
        """Store integrated tokens in database."""
        cursor = self.integration_conn.cursor()

        # Clear existing data
        cursor.execute("DELETE FROM integrated_tokens")

        # Insert new data
        for token in tokens:
            # Combine enrichment_data with lore_data
            enrichment_data = token.get("enrichment_data", {})
            lore_data = token.get("lore_data", {})
            if lore_data:
                enrichment_data["lore_data"] = lore_data

            cursor.execute(
                """
                INSERT INTO integrated_tokens (
                    contract_address, chain, token_name, symbol, source, discovery_method,
                    rick_burp_data, telegram_mentions, telegram_channels, enrichment_data,
                    priority_score, priority_reason, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    token.get("address"),
                    token.get("chain"),
                    token.get("name"),
                    token.get("symbol"),
                    token.get("source"),
                    token.get("discovery_method"),
                    json.dumps(token.get("rick_burp_data", {})),
                    token.get("telegram_data", {}).get("mentions", 0),
                    token.get("telegram_data", {}).get("channels", ""),
                    json.dumps(enrichment_data),
                    token.get("priority_score", 0),
                    token.get("priority_reason"),
                    "integrated",
                ),
            )

        self.integration_conn.commit()
        log.info(f"Stored {len(tokens)} integrated tokens")

    def generate_output(self, tokens: list[dict]):
        """Generate output file for token screener."""
        # Create output directory
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Prepare output data
        output = {
            "generated_at": datetime.now().isoformat(),
            "total_tokens": len(tokens),
            "top_tokens": [],
        }

        # Add top 100 tokens
        for i, token in enumerate(tokens[:100]):
            output["top_tokens"].append(
                {
                    "rank": i + 1,
                    "address": token.get("address"),
                    "chain": token.get("chain"),
                    "name": token.get("name"),
                    "symbol": token.get("symbol"),
                    "source": token.get("source"),
                    "priority_score": token.get("priority_score", 0),
                    "priority_reason": token.get("priority_reason"),
                    "rick_burp_data": token.get("rick_burp_data", {}),
                    "telegram_data": token.get("telegram_data", {}),
                    "enrichment_data": token.get("enrichment_data", {}),
                    "lore_data": token.get("lore_data", {}),
                }
            )

        # Write to file
        with open(OUTPUT_PATH, "w") as f:
            json.dump(output, f, indent=2)

        log.info(f"Output written to: {OUTPUT_PATH}")

        return output

    def run(self, max_enrich: int = 50):
        """Run the complete integration pipeline."""
        start_time = datetime.now()
        log.info("Starting Token Integration Pipeline...")

        try:
            # Initialize databases
            self.init_databases()

            # Get tokens from both sources
            rick_tokens = self.get_rick_burp_tokens()
            telegram_tokens = self.get_telegram_tokens()

            # Merge and deduplicate
            merged_tokens = self.merge_and_deduplicate(rick_tokens, telegram_tokens)

            # Enrich tokens
            enriched_tokens = asyncio.run(self.enrich_tokens(merged_tokens, max_enrich))

            # Prioritize tokens
            prioritized_tokens = self.prioritize_tokens(enriched_tokens)

            # Store in database
            self.store_integrated_tokens(prioritized_tokens)

            # Generate output
            output = self.generate_output(prioritized_tokens)

            # Calculate duration
            duration = (datetime.now() - start_time).total_seconds()

            # Store run statistics
            cursor = self.integration_conn.cursor()
            cursor.execute(
                """
                INSERT INTO integration_runs (
                    rick_burp_tokens, telegram_tokens, integrated_tokens,
                    enriched_tokens, prioritized_tokens, run_duration
                ) VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    len(rick_tokens),
                    len(telegram_tokens),
                    len(merged_tokens),
                    len(enriched_tokens),
                    len(prioritized_tokens),
                    duration,
                ),
            )
            self.integration_conn.commit()

            # Print summary
            print("\n" + "=" * 60)
            print("TOKEN INTEGRATION PIPELINE SUMMARY")
            print("=" * 60)
            print(f"Rick Burp tokens: {len(rick_tokens)}")
            print(f"Telegram tokens: {len(telegram_tokens)}")
            print(f"Integrated tokens: {len(merged_tokens)}")
            print(f"Enriched tokens: {len(enriched_tokens)}")
            print(f"Prioritized tokens: {len(prioritized_tokens)}")
            print(f"Duration: {duration:.1f} seconds")
            print("\nTop 10 Prioritized Tokens:")

            for i, token in enumerate(prioritized_tokens[:10]):
                print(
                    f"{i+1:2d}. {token.get('name', 'Unknown'):15} | Score: {token.get('priority_score', 0):3d} | {token.get('priority_reason', '')}"
                )

            print(f"\nOutput saved to: {OUTPUT_PATH}")

            return output

        except Exception as e:
            log.error(f"Error in integration pipeline: {e}")
            raise
        finally:
            # Close connections
            if self.call_channels_conn:
                self.call_channels_conn.close()
            if self.central_contracts_conn:
                self.central_contracts_conn.close()
            if self.integration_conn:
                self.integration_conn.close()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Token Integration Pipeline")
    parser.add_argument("--max-enrich", type=int, default=50, help="Maximum tokens to enrich")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")

    args = parser.parse_args()

    if args.verbose:
        import logging

        logging.basicConfig(level=logging.DEBUG)

    pipeline = TokenIntegrationPipeline()
    pipeline.run(max_enrich=args.max_enrich)


if __name__ == "__main__":
    main()
