#!/usr/bin/env python3
"""
Weekly Call Channel Discovery Script
Uses Rick Burp Bot (@rick) to find and track the best crypto call channels.
"""

import asyncio
import json
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import requests
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config

# Add the scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Import the Telegram client
from telethon import TelegramClient
from hermes_screener.config import settings

# Configuration
SESSION_PATH = settings.session_path
TG_API_ID = settings.tg_api_id
TG_API_HASH = settings.tg_api_hash
DB_PATH = settings.db_path

# Bot commands to execute - expanded for maximum token coverage
BOT_COMMANDS = [
    # Core performance commands
    ("/burp", "Best plays from last hour"),
    ("/runners", "Runners report (tokens over 100K)"),
    ("/hot", "Popular tokens in current chat"),
    ("/ga", "ATH leaderboards"),
    ("/ga 7d", "7-day ATH leaderboard"),
    ("/dt", "Trending DEX tokens"),
    ("/burpboard", "Global leaderboard"),
    # Token discovery commands
    ("/pft", "Trending Pump tokens"),
    ("/index", "Top coins and market overview"),
    ("/vol", "Market stats and volume"),
    # Social and group tracking commands
    ("/tt", "Trending tweets - can reveal alpha calls"),
    ("/xt", "Trending X profiles - signal sources"),
    ("/now", "News summary - market context"),
    # Clan/group tracking (shows which groups are scanning tokens first)
    ("/clantag", "Clan tags - shows which groups scanned tokens"),
    ("/rank", "Rank information"),
    # Detailed token analysis
    ("/x", "Full token scan - detailed analysis"),
    ("/z", "Compact token scan"),
    ("/c", "Token scan with chart"),
    # Additional context
    ("/wrapped", "Wrapped stats - clan performance"),
    ("/dubs", "Silent chat summary"),
    ("/tldr", "TLDR anything"),
]

# Commands that need a token address as parameter
TOKEN_SPECIFIC_COMMANDS = [
    ("/soc <address>", "Find token socials - can reveal group links"),
    ("/dev <address>", "Deployer history"),
    ("/w <address>", "Wallet stats"),
    ("/lore <address>", "Get token lore"),
    ("/dp <address>", "Check if DexScreener is paid"),
    ("/flex <address>", "Generate a flexcard"),
    ("/h <address>", "Known & top holders"),
    ("/ds <address>", "Search DEX tokens"),
    ("/v <address>", "Token Value Converter"),
]

# Known call channels from discussions
KNOWN_CHANNELS = {
    "MYC Signals": {"type": "signal", "status": "unknown"},
    "Binance Killers": {"type": "signal", "status": "unknown"},
    "Klondike": {"type": "signal", "status": "unknown"},
    "IC Speaks": {"type": "degen", "status": "unknown"},
    "Crypto Classics": {"type": "degen", "status": "unknown"},
}


class CallChannelTracker:
    """Tracks call channel performance using Rick Burp Bot."""

    def __init__(self):
        self.client = None
        self.channel = None
        self.results = {}
        self.db_conn = None

    async def connect(self):
        """Connect to Telegram and find the RickBurp channel."""
        self.client = TelegramClient(str(SESSION_PATH), TG_API_ID, TG_API_HASH)
        await self.client.connect()

        if not await self.client.is_user_authorized():
            raise Exception("Not authorized. Run telegram_user.py interactively first.")

        print("Connected to Telegram!")

        # Find the RickBurp channel
        async for dialog in self.client.iter_dialogs():
            if hasattr(dialog.entity, "title") and "rickburp" in dialog.entity.title.lower():
                self.channel = dialog.entity
                print(f"Found channel: {self.channel.title} (ID: {self.channel.id})")
                break

        if not self.channel:
            raise Exception("Could not find RickBurp channel")

        # Initialize database
        self._init_database()

    def _init_database(self):
        """Initialize SQLite database for tracking call channel performance."""
        self.db_conn = sqlite3.connect(DB_PATH)
        cursor = self.db_conn.cursor()

        # Create tables if they don't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS weekly_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                report_type TEXT,
                data_json TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS call_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                channel_name TEXT,
                channel_type TEXT,
                performance_score REAL,
                tokens_called INTEGER,
                avg_gain REAL,
                details_json TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS token_performances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                token_name TEXT,
                token_address TEXT,
                chain TEXT,
                first_seen_market_cap REAL,
                ath_market_cap REAL,
                gain_multiplier REAL,
                source_channel TEXT,
                command_used TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS token_socials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                token_name TEXT,
                token_address TEXT,
                twitter TEXT,
                telegram TEXT,
                discord TEXT,
                website TEXT,
                source_command TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS clan_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                clan_name TEXT,
                tokens_scanned INTEGER,
                performance_score REAL,
                details_json TEXT
            )
        """)

        self.db_conn.commit()
        print("Database initialized")

    async def send_command(self, command: str, description: str) -> str | None:
        """Send a command to the bot and return the response."""
        try:
            print(f"Sending command: {command} ({description})")

            # Get messages before sending command
            messages_before = await self.client.get_messages(self.channel, limit=1)
            last_msg_id_before = messages_before[0].id if messages_before else 0

            # Send command
            await self.client.send_message(self.channel, f"{command}@rick")

            # Wait for response
            await asyncio.sleep(5)

            # Get new messages after our command
            messages_after = await self.client.get_messages(self.channel, limit=10)

            # Find the bot's response (should be from the bot after our command)
            bot_response = None
            for msg in messages_after:
                if msg.id > last_msg_id_before and msg.message:
                    # Check if this is from the bot (Rick)
                    if msg.sender_id and msg.sender_id != (await self.client.get_me()).id:
                        # This is likely the bot's response
                        bot_response = msg.message
                        break

            if not bot_response:
                # Fallback: look for any message with relevant keywords
                for msg in messages_after:
                    if (
                        msg.message
                        and len(msg.message) > 50
                        and any(
                            keyword in msg.message.lower()
                            for keyword in [
                                "leaderboard",
                                "best",
                                "trending",
                                "runners",
                                "hot",
                                "tokens",
                            ]
                        )
                    ):
                        bot_response = msg.message
                        break

            return bot_response

        except Exception as e:
            print(f"Error sending command {command}: {e}")
            return None

    def parse_runners_response(self, response: str) -> list[dict]:
        """Parse the /runners command response."""
        tokens = []
        lines = response.split("\n")

        for line in lines:
            # Look for lines with token information
            # Format: "15h 🌐 GRAM @ 1.1M ⇨ 2.3M"
            # Or: "15h 🌐 HONESTRUG @ 238K ⇨ 581K"
            if "⇨" in line:
                # Extract token name and performance
                token_match = re.search(r"([A-Za-z0-9]+) @ ([0-9.]+[KMB]?) ⇨ ([0-9.]+[KMB]?)", line)
                if token_match:
                    token_name = token_match.group(1)
                    first_cap = token_match.group(2)
                    ath_cap = token_match.group(3)

                    # Calculate gain
                    gain = self._calculate_gain(first_cap, ath_cap)

                    tokens.append(
                        {
                            "name": token_name,
                            "first_cap": first_cap,
                            "ath_cap": ath_cap,
                            "gain": f"{gain}x",
                            "source": "runners",
                        }
                    )

        return tokens

    def parse_ga_response(self, response: str) -> list[dict]:
        """Parse the /ga command response for ATH leaderboard."""
        tokens = []
        lines = response.split("\n")

        for line in lines:
            # Look for leaderboard entries
            # Format: "🥇 HORMUZ @ 3.7K ➜ 223K Δ 45x"
            # Or: "🥈 AURA @ 2.7K ➜ 122K Δ 24x"
            if "➜" in line and "Δ" in line:
                token_match = re.search(
                    r"([A-Za-z0-9]+) @ ([0-9.]+[KMB]?) ➜ ([0-9.]+[KMB]?) Δ ([0-9.]+x?)",
                    line,
                )
                if token_match:
                    token_name = token_match.group(1)
                    first_cap = token_match.group(2)
                    ath_cap = token_match.group(3)
                    gain = token_match.group(4)

                    tokens.append(
                        {
                            "name": token_name,
                            "first_cap": first_cap,
                            "ath_cap": ath_cap,
                            "gain": gain,
                            "source": "ga_leaderboard",
                        }
                    )

        return tokens

    def parse_burp_response(self, response: str) -> list[dict]:
        """Parse the /burp command response."""
        tokens = []
        lines = response.split("\n")

        for line in lines:
            # Look for token entries
            # Format: "🥇 币安人生 @ 47.4K ➜ 333M Δ 7025x"
            if "➜" in line and "Δ" in line:
                token_match = re.search(
                    r"([A-Za-z0-9\u4e00-\u9fff]+) @ ([0-9.]+[KMB]?) ➜ ([0-9.]+[KMB]?) Δ ([0-9.]+x?)",
                    line,
                )
                if token_match:
                    token_name = token_match.group(1)
                    first_cap = token_match.group(2)
                    ath_cap = token_match.group(3)
                    gain = token_match.group(4)

                    tokens.append(
                        {
                            "name": token_name,
                            "first_cap": first_cap,
                            "ath_cap": ath_cap,
                            "gain": gain,
                            "source": "burp",
                        }
                    )

        return tokens

    def parse_dt_response(self, response: str) -> list[dict]:
        """Parse the /dt command response for trending DEX tokens."""
        tokens = []
        lines = response.split("\n")

        for line in lines:
            # Look for trending token entries
            # Format: "🥇 🌐 BOAR @ 145K ⋅ 93d"
            # Or: "🥈 🌐 SPRINGULAR @ 96K ⋅ 3h"
            if "🌐" in line and "@" in line:
                token_match = re.search(r"([A-Za-z0-9]+) @ ([0-9.]+[KMB]?) ⋅ ([0-9]+[dhm])", line)
                if token_match:
                    token_name = token_match.group(1)
                    market_cap = token_match.group(2)
                    age = token_match.group(3)

                    tokens.append(
                        {
                            "name": token_name,
                            "market_cap": market_cap,
                            "age": age,
                            "source": "dt_trending",
                        }
                    )

        return tokens

    def parse_pft_response(self, response: str) -> list[dict]:
        """Parse the /pft command response for trending Pump tokens."""
        tokens = []
        lines = response.split("\n")

        for line in lines:
            # Look for trending Pump token entries
            # Format: "🥇 💊 BANG @ 11K ⋅ 30m"
            # Or: "🥈 💊 POMPOM @ 13K ⋅ 10m"
            if "💊" in line and "@" in line:
                token_match = re.search(r"([A-Za-z0-9]+) @ ([0-9.]+[KMB]?) ⋅ ([0-9]+[dhm])", line)
                if token_match:
                    token_name = token_match.group(1)
                    market_cap = token_match.group(2)
                    age = token_match.group(3)

                    tokens.append(
                        {
                            "name": token_name,
                            "market_cap": market_cap,
                            "age": age,
                            "source": "pft_trending",
                        }
                    )

        return tokens

    def parse_tt_response(self, response: str) -> list[dict]:
        """Parse the /tt command response for trending tweets."""
        tweets = []
        lines = response.split("\n")

        for line in lines:
            # Look for trending tweet entries
            # Format: "🥇 from nikitabier ↠ 1h ⭐ 58K"
            if "from" in line and "↠" in line:
                tweet_match = re.search(r"from (\w+) ↠ ([0-9]+[dhm])", line)
                if tweet_match:
                    author = tweet_match.group(1)
                    age = tweet_match.group(2)

                    tweets.append({"author": author, "age": age, "source": "trending_tweets"})

        return tweets

    def parse_xt_response(self, response: str) -> list[dict]:
        """Parse the /xt command response for trending X profiles."""
        profiles = []
        lines = response.split("\n")

        for line in lines:
            # Look for trending X profile entries
            # Format: "🥇 gotBasedMilk ・ 8h ago ℹ️"
            if "ago" in line and "・" in line:
                profile_match = re.search(r"(\w+) ・ ([0-9]+[dhm]) ago", line)
                if profile_match:
                    username = profile_match.group(1)
                    age = profile_match.group(2)

                    profiles.append(
                        {
                            "username": username,
                            "age": age,
                            "source": "trending_profiles",
                        }
                    )

        return profiles

    def parse_vol_response(self, response: str) -> dict:
        """Parse the /vol command response for market stats."""
        stats = {}
        lines = response.split("\n")

        for line in lines:
            # Look for market stats
            if "Volume:" in line:
                vol_match = re.search(r"Volume: ([0-9.]+[KMB]?) \(([^)]+)\)", line)
                if vol_match:
                    stats["volume"] = vol_match.group(1)
                    stats["volume_change"] = vol_match.group(2)
            elif "Traders:" in line:
                traders_match = re.search(r"Traders: ([0-9.]+[KMB]?)", line)
                if traders_match:
                    stats["traders"] = traders_match.group(1)
            elif "Launched:" in line:
                launched_match = re.search(r"Launched: ([0-9.]+[KMB]?)", line)
                if launched_match:
                    stats["launched"] = launched_match.group(1)
            elif "Graduated:" in line:
                graduated_match = re.search(r"Graduated: ([0-9.]+[KMB]?)", line)
                if graduated_match:
                    stats["graduated"] = graduated_match.group(1)

        return stats

    def parse_x_response(self, response: str) -> dict:
        """Parse the /x command response for detailed token scan."""
        token_info = {}
        lines = response.split("\n")

        for line in lines:
            # Look for token details
            if "🌐" in line and "@" in line:
                # Extract chain and DEX
                chain_match = re.search(r"🌐 ([A-Za-z]+) @ ([A-Za-z0-9 ]+)", line)
                if chain_match:
                    token_info["chain"] = chain_match.group(1)
                    token_info["dex"] = chain_match.group(2)

            elif "💰" in line:
                # Extract price
                price_match = re.search(r"💰 (?:USD: )?([0-9,]+(?:\.[0-9]+)?)", line)
                if price_match:
                    token_info["price"] = price_match.group(1).replace(",", "")

            elif "💦" in line:
                # Extract liquidity
                liq_match = re.search(r"💦 Liq: ([0-9.]+[KMB]?)", line)
                if liq_match:
                    token_info["liquidity"] = liq_match.group(1)

            elif "📊" in line and "Vol:" in line:
                # Extract volume
                vol_match = re.search(r"📊 Vol: ([0-9.]+[KMB]?)", line)
                if vol_match:
                    token_info["volume"] = vol_match.group(1)

            elif "👥" in line:
                # Extract token holder info
                th_match = re.search(r"👥 TH: ([0-9.⋅]+)", line)
                if th_match:
                    token_info["token_holders"] = th_match.group(1)

        return token_info

    def parse_clantag_response(self, response: str) -> list[dict]:
        """Parse the /clantag response for clan/group information."""
        clans = []
        lines = response.split("\n")

        for line in lines:
            # Look for clan information
            # Format: "🛡️ [TEREX] @ 6..."
            if "🛡️" in line and "[" in line and "]" in line:
                clan_match = re.search(r"🛡️ \[([A-Z0-9]+)\]", line)
                if clan_match:
                    clan_name = clan_match.group(1)
                    clans.append({"clan": clan_name, "source": "clantag"})

        return clans

    def extract_token_addresses(self, text: str) -> list[str]:
        """Extract token addresses from text."""
        addresses = []

        # EVM addresses (0x...)
        evm_pattern = re.compile(r"0x[a-fA-F0-9]{40}")
        evm_matches = evm_pattern.findall(text)
        addresses.extend([addr.lower() for addr in evm_matches])

        # Solana addresses (base58, 32-44 chars)
        sol_pattern = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}")
        sol_matches = sol_pattern.findall(text)

        # Filter Solana addresses more carefully
        base58_chars = set("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")
        for match in sol_matches:
            if len(match) >= 32 and all(c in base58_chars for c in match):
                addresses.append(match)

        return list(set(addresses))  # Remove duplicates

    def extract_social_links(self, text: str) -> dict[str, list[str]]:
        """Extract social links from text."""
        social_links = {"twitter": [], "telegram": [], "discord": [], "website": []}

        # Twitter/X links
        twitter_pattern = re.compile(r"(?:https?://)?(?:www\.)?(?:twitter\.com|x\.com)/(\w+)")
        twitter_matches = twitter_pattern.findall(text)
        social_links["twitter"] = twitter_matches

        # Telegram links
        telegram_pattern = re.compile(r"(?:https?://)?t\.me/([a-zA-Z0-9_]+)")
        telegram_matches = telegram_pattern.findall(text)
        social_links["telegram"] = telegram_matches

        # Discord links
        discord_pattern = re.compile(r"(?:https?://)?(?:www\.)?discord\.gg/([a-zA-Z0-9]+)")
        discord_matches = discord_pattern.findall(text)
        social_links["discord"] = discord_matches

        # Website links (general)
        website_pattern = re.compile(r"https?://[^\s]+")
        website_matches = website_pattern.findall(text)
        social_links["website"] = website_matches

        return social_links

    def get_token_address_from_name(self, token_name: str, chain: str = "solana") -> dict:
        """Get token address from token name using external APIs."""
        result = {
            "name": token_name,
            "address": None,
            "chain": chain,
            "source": None,
            "price": None,
            "liquidity": None,
            "volume": None,
            "dex": None,
        }

        # Try DexScreener API
        try:
            # DexScreener search endpoint
            url = f"https://api.dexscreener.com/latest/dex/search?q={token_name}"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if "pairs" in data and data["pairs"]:
                    for pair in data["pairs"][:3]:  # Check first 3 pairs
                        if "baseToken" in pair:
                            base_token = pair["baseToken"]
                            if (
                                base_token.get("name", "").lower() == token_name.lower()
                                or base_token.get("symbol", "").lower() == token_name.lower()
                            ):
                                result["address"] = base_token.get("address")
                                result["chain"] = pair.get("chainId", chain)
                                result["source"] = "dexscreener"
                                result["dex"] = pair.get("dexId", "")
                                result["price"] = pair.get("priceUsd", "")
                                result["liquidity"] = pair.get("liquidity", {}).get("usd", "")
                                result["volume"] = pair.get("volume", {}).get("h24", "")
                                break
        except Exception as e:
            print(f"Error with DexScreener API for {token_name}: {e}")

        return result

    def _calculate_gain(self, first_cap: str, ath_cap: str) -> float:
        """Calculate gain multiplier from market cap strings."""

        def parse_cap(cap_str: str) -> float:
            """Parse market cap string like '1.1M' to float."""
            if not cap_str:
                return 0.0

            cap_str = cap_str.upper()
            multiplier = 1.0

            if "K" in cap_str:
                multiplier = 1000
                cap_str = cap_str.replace("K", "")
            elif "M" in cap_str:
                multiplier = 1000000
                cap_str = cap_str.replace("M", "")
            elif "B" in cap_str:
                multiplier = 1000000000
                cap_str = cap_str.replace("B", "")

            try:
                return float(cap_str) * multiplier
            except Exception:
                return 0.0

        first = parse_cap(first_cap)
        ath = parse_cap(ath_cap)

        if first > 0:
            return ath / first
        return 0.0

    def calculate_performance_score(self, tokens: list[dict]) -> float:
        """Calculate a performance score based on token gains."""
        if not tokens:
            return 0.0

        total_gain = 0.0
        for token in tokens:
            gain_str = token.get("gain", "0x")
            # Extract numeric value
            gain_match = re.search(r"([0-9.]+)", gain_str)
            if gain_match:
                gain = float(gain_match.group(1))
                if "x" in gain_str:
                    gain = gain  # Already a multiplier
                else:
                    gain = gain / 100  # Convert percentage to multiplier
                total_gain += gain

        return total_gain / len(tokens)

    async def collect_data(self):
        """Collect data from all bot commands."""
        print("Starting weekly data collection...")

        all_tokens = []

        # Execute each command
        for command, description in BOT_COMMANDS:
            response = await self.send_command(command, description)
            if response:
                # Store raw response
                cursor = self.db_conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO weekly_reports (report_type, data_json)
                    VALUES (?, ?)
                """,
                    (
                        command,
                        json.dumps({"response": response, "description": description}),
                    ),
                )
                self.db_conn.commit()

                # Parse response based on command type
                if "/runners" in command:
                    tokens = self.parse_runners_response(response)
                    all_tokens.extend(tokens)
                elif "/ga" in command:
                    tokens = self.parse_ga_response(response)
                    all_tokens.extend(tokens)
                elif "/burp" in command:
                    tokens = self.parse_burp_response(response)
                    all_tokens.extend(tokens)
                elif "/dt" in command or "/burpboard" in command:
                    tokens = self.parse_dt_response(response)
                    all_tokens.extend(tokens)
                elif "/pft" in command:
                    tokens = self.parse_pft_response(response)
                    all_tokens.extend(tokens)
                elif "/tt" in command:
                    tweets = self.parse_tt_response(response)
                    # Store tweets in a separate list or process them
                    print(f"  Found {len(tweets)} trending tweets")
                elif "/xt" in command:
                    profiles = self.parse_xt_response(response)
                    # Store profiles in a separate list or process them
                    print(f"  Found {len(profiles)} trending profiles")
                elif "/vol" in command:
                    stats = self.parse_vol_response(response)
                    # Store market stats
                    print(f"  Market stats: {stats}")
                elif "/x" in command:
                    # Parse detailed token scan
                    token_info = self.parse_x_response(response)
                    # Extract token addresses and social links
                    addresses = self.extract_token_addresses(response)
                    social_links = self.extract_social_links(response)
                    print(f"  Found {len(addresses)} token addresses, {len(social_links['telegram'])} Telegram links")

                    # Store token information
                    if addresses:
                        for addr in addresses:
                            tokens.append(
                                {
                                    "name": token_info.get("name", "unknown"),
                                    "address": addr,
                                    "chain": token_info.get("chain", ""),
                                    "dex": token_info.get("dex", ""),
                                    "price": token_info.get("price", ""),
                                    "liquidity": token_info.get("liquidity", ""),
                                    "volume": token_info.get("volume", ""),
                                    "social_links": social_links,
                                    "source": "detailed_scan",
                                }
                            )
                        all_tokens.extend(tokens)
                elif "/clantag" in command:
                    clans = self.parse_clantag_response(response)
                    # Store clan information
                    print(f"  Found {len(clans)} clan tags")

                    # Store clan data in database
                    for clan in clans:
                        cursor = self.db_conn.cursor()
                        cursor.execute(
                            """
                            INSERT INTO clan_performance (clan_name, tokens_scanned, performance_score, details_json)
                            VALUES (?, ?, ?, ?)
                        """,
                            (
                                clan["clan"],
                                0,  # Will be updated later
                                0.0,  # Will be calculated
                                json.dumps({"source": "clantag"}),
                            ),
                        )
                        self.db_conn.commit()

                # Always extract token addresses and social links from any response
                addresses = self.extract_token_addresses(response)
                social_links = self.extract_social_links(response)
                if addresses or social_links["telegram"]:
                    print(f"  Extracted {len(addresses)} addresses, {len(social_links['telegram'])} Telegram links")

                    # Store social links in database
                    for telegram_link in social_links["telegram"]:
                        cursor = self.db_conn.cursor()
                        cursor.execute(
                            """
                            INSERT INTO token_socials (token_name, token_address, telegram, source_command)
                            VALUES (?, ?, ?, ?)
                        """,
                            (
                                "unknown",  # Token name not always available
                                "",  # Token address not always available
                                telegram_link,
                                command,
                            ),
                        )
                        self.db_conn.commit()

                print(f"  Processed {command}: found {len(tokens) if 'tokens' in locals() else 0} tokens")

            # Wait between commands to avoid rate limits
            await asyncio.sleep(2)

        # Get token addresses for tokens that don't have them (limit to top 20)
        print("\n=== Getting token addresses from external APIs ===")
        tokens_to_enrich = [token for token in all_tokens if not token.get("address") and token.get("name")][:20]
        print(f"Enriching {len(tokens_to_enrich)} tokens with addresses...")

        for i, token in enumerate(tokens_to_enrich):
            print(f"  {i+1}/{len(tokens_to_enrich)}: Looking up {token['name']}...")
            # Try to get address from external API
            token_info = self.get_token_address_from_name(token["name"])
            if token_info["address"]:
                token["address"] = token_info["address"]
                token["chain"] = token_info["chain"]
                token["dex"] = token_info.get("dex", "")
                token["price"] = token_info.get("price", "")
                token["liquidity"] = token_info.get("liquidity", "")
                token["volume"] = token_info.get("volume", "")
                token["address_source"] = "dexscreener"
                print(f"    Found address: {token['address'][:20]}...")
            else:
                print("    No address found")

            # Small delay to avoid rate limits
            if i < len(tokens_to_enrich) - 1:
                await asyncio.sleep(0.5)

        print(f"Successfully enriched {len([t for t in tokens_to_enrich if t.get('address')])} tokens with addresses")

        # Calculate channel performance
        channel_performance = {}
        for token in all_tokens:
            source = token.get("source", "unknown")
            if source not in channel_performance:
                channel_performance[source] = {
                    "count": 0,
                    "total_gain": 0.0,
                    "tokens": [],
                }

            channel_performance[source]["count"] += 1
            channel_performance[source]["tokens"].append(token)

            # Calculate gain
            gain_str = token.get("gain", "0x")
            gain_match = re.search(r"([0-9.]+)", gain_str)
            if gain_match:
                gain = float(gain_match.group(1))
                if "x" in gain_str:
                    channel_performance[source]["total_gain"] += gain
                else:
                    channel_performance[source]["total_gain"] += gain / 100

        # Store channel performance
        for source, data in channel_performance.items():
            avg_gain = data["total_gain"] / data["count"] if data["count"] > 0 else 0
            cursor = self.db_conn.cursor()
            cursor.execute(
                """
                INSERT INTO call_channels (channel_name, channel_type, performance_score, tokens_called, avg_gain, details_json)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    source,
                    "bot_command",
                    avg_gain,
                    data["count"],
                    avg_gain,
                    json.dumps(data["tokens"]),
                ),
            )
            self.db_conn.commit()

        # Store token performances
        for token in all_tokens:
            # Parse gain value
            gain_str = token.get("gain", "0x")
            gain_match = re.search(r"([0-9.]+)", gain_str)
            gain_multiplier = 0.0
            if gain_match:
                gain_multiplier = float(gain_match.group(1))
                if "x" not in gain_str:
                    gain_multiplier = gain_multiplier / 100

            cursor = self.db_conn.cursor()
            cursor.execute(
                """
                INSERT INTO token_performances (token_name, token_address, chain, first_seen_market_cap, ath_market_cap, gain_multiplier, source_channel, command_used)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    token.get("name", "unknown"),
                    token.get("address", ""),
                    token.get("chain", ""),
                    token.get("first_cap", token.get("market_cap", "")),
                    token.get("ath_cap", ""),
                    gain_multiplier,
                    token.get("source", "unknown"),
                    "weekly_collection",
                ),
            )
            self.db_conn.commit()

        return all_tokens, channel_performance

    async def enrich_tokens_with_details(self, tokens: list[dict]) -> list[dict]:
        """Enrich tokens with additional details using token-specific commands and external APIs."""

        # Get unique token addresses
        token_addresses = set()
        for token in tokens:
            if "address" in token and token["address"]:
                token_addresses.add(token["address"])

        print(f"\n=== Enriching {len(token_addresses)} unique token addresses ===")

        # For each unique address, run token-specific commands
        for i, address in enumerate(list(token_addresses)[:10]):  # Limit to 10 addresses
            print(f"  Processing address {i+1}/{min(10, len(token_addresses))}: {address[:20]}...")

            # Run /x command for detailed scan
            try:
                response = await self.send_command(f"/x {address}", f"Detailed scan for {address[:10]}...")
                if response:
                    # Parse detailed scan
                    token_info = self.parse_x_response(response)
                    self.extract_token_addresses(response)
                    social_links = self.extract_social_links(response)

                    # Find token in original list and update it
                    for token in tokens:
                        if token.get("address") == address:
                            token.update(token_info)
                            token["social_links"] = social_links
                            token["enriched"] = True
                            break

                    # Store social links
                    for telegram_link in social_links["telegram"]:
                        cursor = self.db_conn.cursor()
                        cursor.execute(
                            """
                            INSERT INTO token_socials (token_name, token_address, telegram, source_command)
                            VALUES (?, ?, ?, ?)
                        """,
                            (
                                token_info.get("name", "unknown"),
                                address,
                                telegram_link,
                                "/x",
                            ),
                        )
                        self.db_conn.commit()

                    print(f"    Found {len(social_links['telegram'])} Telegram links")

                await asyncio.sleep(1)  # Small delay between commands

            except Exception as e:
                print(f"    Error enriching {address}: {e}")

        # Also run /soc command for some tokens to find social links
        print("\n=== Finding social links for top tokens ===")
        for i, token in enumerate(tokens[:5]):  # Top 5 tokens
            if "address" in token and token["address"]:
                try:
                    response = await self.send_command(
                        f"/soc {token['address']}",
                        f"Find socials for {token.get('name', 'unknown')}",
                    )
                    if response:
                        social_links = self.extract_social_links(response)
                        if social_links["telegram"]:
                            token["social_links"] = social_links
                            print(
                                f"  Found {len(social_links['telegram'])} Telegram links for {token.get('name', 'unknown')}"
                            )

                            # Store social links
                            for telegram_link in social_links["telegram"]:
                                cursor = self.db_conn.cursor()
                                cursor.execute(
                                    """
                                    INSERT INTO token_socials (token_name, token_address, telegram, source_command)
                                    VALUES (?, ?, ?, ?)
                                """,
                                    (
                                        token.get("name", "unknown"),
                                        token["address"],
                                        telegram_link,
                                        "/soc",
                                    ),
                                )
                                self.db_conn.commit()

                    await asyncio.sleep(1)

                except Exception as e:
                    print(f"  Error getting socials for {token.get('name', 'unknown')}: {e}")

        # Get addresses for tokens that don't have them
        print("\n=== Getting addresses for tokens without addresses ===")
        tokens_without_addresses = [token for token in tokens if not token.get("address") and token.get("name")][:10]

        for i, token in enumerate(tokens_without_addresses):
            print(f"  {i+1}/{len(tokens_without_addresses)}: Looking up {token['name']}...")

            # Get address from external API
            token_info = self.get_token_address_from_name(token["name"])
            if token_info["address"]:
                token["address"] = token_info["address"]
                token["chain"] = token_info["chain"]
                token["dex"] = token_info.get("dex", "")
                token["price"] = token_info.get("price", "")
                token["liquidity"] = token_info.get("liquidity", "")
                token["volume"] = token_info.get("volume", "")
                token["address_source"] = "dexscreener"
                print(f"    Found address: {token['address'][:20]}...")

                # Now run /soc command to get social links
                try:
                    response = await self.send_command(
                        f"/soc {token['address']}",
                        f"Find socials for {token.get('name', 'unknown')}",
                    )
                    if response:
                        social_links = self.extract_social_links(response)
                        if social_links["telegram"]:
                            token["social_links"] = social_links
                            print(f"    Found {len(social_links['telegram'])} Telegram links")

                            # Store social links
                            for telegram_link in social_links["telegram"]:
                                cursor = self.db_conn.cursor()
                                cursor.execute(
                                    """
                                    INSERT INTO token_socials (token_name, token_address, telegram, source_command)
                                    VALUES (?, ?, ?, ?)
                                """,
                                    (
                                        token.get("name", "unknown"),
                                        token["address"],
                                        telegram_link,
                                        "/soc",
                                    ),
                                )
                                self.db_conn.commit()

                    await asyncio.sleep(1)

                except Exception as e:
                    print(f"    Error getting socials for {token.get('name', 'unknown')}: {e}")
            else:
                print("    No address found")

            await asyncio.sleep(0.5)

        return tokens

    def generate_weekly_report(self, tokens: list[dict], channel_performance: dict) -> str:
        """Generate a weekly report of call channel performance."""
        report_lines = []
        report_lines.append("=" * 60)
        report_lines.append("WEEKLY CALL CHANNEL PERFORMANCE REPORT")
        report_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append("=" * 60)

        # Top performing tokens
        report_lines.append("\nTOP PERFORMING TOKENS (Last 7 Days):")
        report_lines.append("-" * 40)

        # Sort tokens by gain
        sorted_tokens = sorted(
            tokens,
            key=lambda x: (
                float(re.search(r"([0-9.]+)", x.get("gain", "0x")).group(1))
                if re.search(r"([0-9.]+)", x.get("gain", "0x"))
                else 0
            ),
            reverse=True,
        )

        for i, token in enumerate(sorted_tokens[:10], 1):
            report_lines.append(
                f"{i:2d}. {token.get('name', 'Unknown'):15} | Gain: {token.get('gain', 'N/A'):10} | Source: {token.get('source', 'Unknown')}"
            )

        # Channel performance summary
        report_lines.append("\nCHANNEL PERFORMANCE SUMMARY:")
        report_lines.append("-" * 40)

        for source, data in channel_performance.items():
            avg_gain = data["total_gain"] / data["count"] if data["count"] > 0 else 0
            report_lines.append(f"{source:20} | Tokens: {data['count']:3d} | Avg Gain: {avg_gain:.2f}x")

        # Recommendations
        report_lines.append("\nRECOMMENDATIONS:")
        report_lines.append("-" * 40)
        report_lines.append("Based on this week's performance:")

        # Find best performing source
        if channel_performance:
            best_source = max(
                channel_performance.items(),
                key=lambda x: (x[1]["total_gain"] / x[1]["count"] if x[1]["count"] > 0 else 0),
            )
            report_lines.append(f"1. Best performing source: {best_source[0]}")
            report_lines.append(f"   Average gain: {best_source[1]['total_gain'] / best_source[1]['count']:.2f}x")

        report_lines.append("\n2. Recommended call channels to join:")
        for channel_name, info in KNOWN_CHANNELS.items():
            report_lines.append(f"   - {channel_name} ({info['type']})")

        report_lines.append("\n3. Suggested actions:")
        report_lines.append("   - Monitor top-performing tokens daily")
        report_lines.append("   - Use /runners command for real-time performance tracking")
        report_lines.append("   - Check /ga 7d weekly for ATH leaderboard")
        report_lines.append("   - Join recommended call channels for early signals")

        return "\n".join(report_lines)

    async def run_weekly_collection(self):
        """Run the complete weekly collection process."""
        try:
            # Connect to Telegram
            await self.connect()

            # Collect data from bot commands
            tokens, channel_performance = await self.collect_data()

            # Enrich tokens with additional details
            print("\n=== Starting token enrichment ===")
            enriched_tokens = await self.enrich_tokens_with_details(tokens)

            # Generate report
            report = self.generate_weekly_report(enriched_tokens, channel_performance)

            # Save report to database
            cursor = self.db_conn.cursor()
            cursor.execute(
                """
                INSERT INTO weekly_reports (report_type, data_json)
                VALUES (?, ?)
            """,
                (
                    "weekly_report",
                    json.dumps({"report": report, "timestamp": datetime.now().isoformat()}),
                ),
            )
            self.db_conn.commit()

            # Print report
            print("\n" + report)

            # Save report to file
            report_path = Path.home() / ".hermes" / "weekly_call_channel_report.txt"
            with open(report_path, "w") as f:
                f.write(report)

            print(f"\nReport saved to: {report_path}")

            return report

        except Exception as e:
            print(f"Error in weekly collection: {e}")
            raise
        finally:
            if self.client:
                await self.client.disconnect()
            if self.db_conn:
                self.db_conn.close()


async def main():
    """Main entry point."""
    print("Starting Weekly Call Channel Discovery...")
    print("=" * 60)

    tracker = CallChannelTracker()
    await tracker.run_weekly_collection()


if __name__ == "__main__":
    asyncio.run(main())
