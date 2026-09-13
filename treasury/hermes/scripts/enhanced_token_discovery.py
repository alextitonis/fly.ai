#!/usr/bin/env python3
"""
Enhanced Token Address Discovery Script
Uses DexScreener API for token discovery and enrichment (no Telegram dependency).
"""

import asyncio
import sys
import os
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
import sqlite3
import requests
import time

# TOR proxy - route all external HTTP through SOCKS5
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config

# Add the scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Configuration
DB_PATH = Path.home() / '.hermes' / 'call_channels.db'
MAX_TOKENS = 50  # Maximum tokens to enrich per run

# DexScreener endpoints
DEXSCREENER_BOOSTED = "https://api.dexscreener.com/token-boosts/top/v1"
DEXSCREENER_PROFILES = "https://api.dexscreener.com/token-profiles/latest/v1"
DEXSCREENER_SEARCH = "https://api.dexscreener.com/latest/dex/search?q={query}"
DEXSCREENER_PAIRS = "https://api.dexscreener.com/latest/dex/tokens/{addresses}"

class EnhancedTokenDiscovery:
    """Enhanced token discovery using DexScreener API (no Telegram dependency)."""

    def __init__(self):
        self.discovered_tokens = []
        self.db_conn = None

    def fetch_boosted_tokens(self) -> List[Dict]:
        """Fetch top boosted tokens from DexScreener."""
        print("Fetching DexScreener boosted tokens...")
        try:
            resp = requests.get(DEXSCREENER_BOOSTED, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                tokens = []
                for item in data[:30]:
                    token_address = item.get('tokenAddress', '')
                    if token_address:
                        tokens.append({
                            'address': token_address,
                            'chain': 'solana',
                            'source': 'dexscreener_boosted',
                            'name': item.get('description', '')[:50],
                            'url': item.get('url', '')
                        })
                print(f"  Found {len(tokens)} boosted tokens")
                return tokens
            else:
                print(f"  DexScreener boosted returned {resp.status_code}")
                return []
        except Exception as e:
            print(f"  Error fetching boosted tokens: {e}")
            return []

    def fetch_profile_tokens(self) -> List[Dict]:
        """Fetch latest token profiles from DexScreener."""
        print("Fetching DexScreener token profiles...")
        try:
            resp = requests.get(DEXSCREENER_PROFILES, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                tokens = []
                for item in data[:30]:
                    token_address = item.get('tokenAddress', '')
                    chain_id = item.get('chainId', 'solana')
                    if token_address:
                        tokens.append({
                            'address': token_address,
                            'chain': chain_id,
                            'source': 'dexscreener_profile',
                            'name': item.get('description', '')[:50],
                            'url': item.get('url', '')
                        })
                print(f"  Found {len(tokens)} token profiles")
                return tokens
            else:
                print(f"  DexScreener profiles returned {resp.status_code}")
                return []
        except Exception as e:
            print(f"  Error fetching token profiles: {e}")
            return []

    def enrich_token_address(self, token_address: str, chain: str = 'solana') -> Dict:
        """Enrich a single token address with DexScreener data."""
        result = {
            'address': token_address,
            'chain': chain,
            'source': 'dexscreener',
            'name': None,
            'symbol': None,
            'dex': None,
            'price': None,
            'liquidity': None,
            'volume': None,
            'fdv': None,
            'pair_address': None
        }

        try:
            url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address}"
            resp = requests.get(url, timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                pairs = data.get('pairs', [])
                if pairs:
                    pair = pairs[0]
                    base = pair.get('baseToken', {})

                    result['name'] = base.get('name', '')
                    result['symbol'] = base.get('symbol', '')
                    result['chain'] = pair.get('chainId', chain)
                    result['dex'] = pair.get('dexId', '')
                    result['price'] = pair.get('priceUsd')
                    result['liquidity'] = pair.get('liquidity', {}).get('usd')
                    result['volume'] = pair.get('volume', {}).get('h24')
                    result['fdv'] = pair.get('fdv')
                    result['pair_address'] = pair.get('pairAddress')

                    return result
        except Exception as e:
            print(f"  Error enriching {token_address[:20]}: {e}")

        return result

    def init_database(self):
        """Initialize database for storing token information."""
        self.db_conn = sqlite3.connect(DB_PATH)
        cursor = self.db_conn.cursor()

        cursor.execute('''
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
                fdv REAL,
                source TEXT,
                discovery_method TEXT
            )
        ''')

        self.db_conn.commit()
        print("Database initialized")

    def store_token(self, token_info: Dict, discovery_method: str = "dexscreener"):
        """Store token information in database."""
        if not self.db_conn:
            return

        cursor = self.db_conn.cursor()
        cursor.execute('''
            INSERT INTO discovered_tokens (token_name, token_address, chain, dex, price, liquidity, volume_24h, fdv, source, discovery_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            token_info.get('name') or token_info.get('symbol', 'unknown'),
            token_info.get('address'),
            token_info.get('chain', 'solana'),
            token_info.get('dex'),
            token_info.get('price'),
            token_info.get('liquidity'),
            token_info.get('volume'),
            token_info.get('fdv'),
            token_info.get('source', 'dexscreener'),
            discovery_method
        ))
        self.db_conn.commit()

    def generate_report(self) -> str:
        """Generate a summary report."""
        report_lines = []
        report_lines.append("=" * 60)
        report_lines.append("ENHANCED TOKEN DISCOVERY REPORT")
        report_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append("=" * 60)

        report_lines.append(f"\nTotal tokens discovered: {len(self.discovered_tokens)}")

        # Group by chain
        chains = {}
        for token in self.discovered_tokens:
            chain = token.get('chain', 'unknown')
            if chain not in chains:
                chains[chain] = []
            chains[chain].append(token)

        report_lines.append("\nTokens by Chain:")
        for chain, tokens in sorted(chains.items(), key=lambda x: len(x[1]), reverse=True):
            report_lines.append(f"  {chain}: {len(tokens)} tokens")

        # Group by DEX
        dexes = {}
        for token in self.discovered_tokens:
            dex = token.get('dex') or 'unknown'
            if dex not in dexes:
                dexes[dex] = []
            dexes[dex].append(token)

        report_lines.append("\nTokens by DEX:")
        for dex, tokens in sorted(dexes.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
            report_lines.append(f"  {dex}: {len(tokens)} tokens")

        # Top tokens by liquidity
        report_lines.append("\nTop Tokens by Liquidity:")
        tokens_with_liquidity = [t for t in self.discovered_tokens if t.get('liquidity')]
        sorted_tokens = sorted(tokens_with_liquidity, key=lambda x: float(x.get('liquidity', 0) or 0), reverse=True)

        for i, token in enumerate(sorted_tokens[:15], 1):
            liquidity = float(token.get('liquidity', 0) or 0)
            name = token.get('symbol') or token.get('name', 'N/A')
            chain = token.get('chain', '?')
            report_lines.append(f"{i:2d}. {name:15} | {chain:8} | ${liquidity:12,.2f} | {token.get('dex', 'N/A')}")

        return "\n".join(report_lines)

    def run(self):
        """Run the enhanced token discovery (no Telegram)."""
        print("Starting Enhanced Token Discovery (DexScreener-only)...")
        print("=" * 60)

        try:
            # Initialize database
            self.init_database()

            # Discover tokens from DexScreener sources
            boosted = self.fetch_boosted_tokens()
            profiles = self.fetch_profile_tokens()

            # Deduplicate by address
            seen_addresses = set()
            all_candidates = []
            for token in boosted + profiles:
                addr = token.get('address', '').lower()
                if addr and addr not in seen_addresses:
                    seen_addresses.add(addr)
                    all_candidates.append(token)

            print(f"\nTotal unique candidates: {len(all_candidates)}")

            if not all_candidates:
                print("No candidates found")
                return

            # Enrich tokens
            print(f"\nEnriching up to {MAX_TOKENS} tokens...")
            to_enrich = all_candidates[:MAX_TOKENS]

            for i, candidate in enumerate(to_enrich):
                address = candidate['address']
                chain = candidate.get('chain', 'solana')

                print(f"  [{i+1}/{len(to_enrich)}] {address[:20]}...", end="")

                enriched = self.enrich_token_address(address, chain)

                if enriched.get('symbol') or enriched.get('name'):
                    print(f" -> {enriched.get('symbol') or enriched.get('name')} on {enriched.get('chain')}")

                    # Store in database
                    self.store_token(enriched, candidate.get('source', 'dexscreener'))
                    self.discovered_tokens.append(enriched)
                else:
                    print(" (no data)")

                # Rate limit
                if i < len(to_enrich) - 1:
                    time.sleep(0.3)

            # Generate report
            report = self.generate_report()

            # Print report
            print("\n" + report)

            # Save report to file
            report_path = Path.home() / '.hermes' / 'enhanced_token_discovery_report.txt'
            with open(report_path, 'w') as f:
                f.write(report)

            print(f"\nReport saved to: {report_path}")
            print(f"Total enriched: {len(self.discovered_tokens)}")

            return report

        except Exception as e:
            print(f"Error in enhanced token discovery: {e}")
            import traceback
            traceback.print_exc()
            raise
        finally:
            if self.db_conn:
                self.db_conn.close()


def main():
    """Main entry point."""
    discovery = EnhancedTokenDiscovery()
    discovery.run()


if __name__ == "__main__":
    main()
