#!/usr/bin/env python3
"""
PumpPortal Real-Time Token Harvester

Connects to wss://pumpportal.fun/api/data and subscribes to new token
creation events on pump.fun (Solana). Stores contract addresses in
central_contracts.db (telegram_contracts_unique table, same as Telegram/GMGN).

Usage:
  python3 pumpportal_harvester.py              # run as foreground daemon
  python3 pumpportal_harvester.py --test 60    # test for 60 seconds
  python3 pumpportal_harvester.py --count      # show DB stats
"""

import argparse
import asyncio
import json
import signal
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
DATA_DIR = Path.home() / ".hermes" / "data"
DB_PATH = DATA_DIR / "central_contracts.db"

API_KEY = "65564jad95mmwttnemvn4kv685bpumkn9t850avqcgu4gn1g8n7q6h3bc5x78dka6np2pd1m89n6yyja9x1muyhjcnj38tbd8nh6jra1a11k0dvu9x8k0uatd53n6djja9gn2mb7a4yku8gv5jwvkcxp5jpkg89t68ebta48x4new9b6dtqewu2edu3gdjj6rr3auk35x8kuf8"
WS_URL = f"wss://pumpportal.fun/api/data?api-key={API_KEY}"

RECONNECT_DELAY = 5
MAX_RECONNECT = 12  # max consecutive reconnects before backoff
BATCH_COMMIT = 20  # commit to DB every N tokens


class PumpPortalHarvester:
    def __init__(self, db_path: str = str(DB_PATH)):
        self.db_path = db_path
        self.conn = None
        self.running = True
        self.stats = {
            "received": 0,
            "new": 0,
            "duplicates": 0,
            "errors": 0,
            "creators": 0,
        }
        self._creators = {}  # creator_wallet -> [token_names]
        self._buffer = []
        self._reconnect_count = 0

    def _get_db(self):
        if not self.conn:
            self.conn = sqlite3.connect(self.db_path, timeout=30)
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA busy_timeout=30000")
        return self.conn

    def _store_token(self, data: dict):
        """Store a new token and its creator wallet in the DB."""
        mint = data.get("mint", "")
        if not mint or len(mint) < 32:
            return

        name = data.get("name", "")
        symbol = data.get("symbol", "")
        creator = data.get("traderPublicKey", "")
        sol_amount = data.get("solAmount", 0)
        market_cap_sol = data.get("marketCapSol", 0)
        initial_buy = data.get("initialBuy", 0)
        data.get("pool", "pump")
        data.get("signature", "")

        now = time.time()
        chain = "solana"

        msg_parts = []
        if name:
            msg_parts.append(name)
        if symbol and symbol != name:
            msg_parts.append(f"({symbol})")
        msg_parts.append(f"mcap_sol={market_cap_sol:.1f}")
        msg_parts.append(f"init_buy={initial_buy:.0f}")
        msg_parts.append(f"sol={sol_amount:.3f}")
        message_text = " | ".join(msg_parts)

        conn = self._get_db()

        # Check if already exists
        existing = conn.execute(
            "SELECT 1 FROM telegram_contracts_unique WHERE chain=? AND contract_address=?",
            (chain, mint),
        ).fetchone()

        try:
            # Insert call record
            conn.execute(
                """
                INSERT OR IGNORE INTO telegram_contract_calls
                (channel_id, message_id, chain, contract_address, raw_address,
                 address_source, message_text, observed_at, session_source, inserted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    "pumpportal",
                    0,
                    chain,
                    mint,
                    mint,
                    "pumpportal_new_token",
                    message_text,
                    now,
                    "pumpportal_ws",
                    now,
                ),
            )

            # Insert/update unique contract
            conn.execute(
                """
                INSERT INTO telegram_contracts_unique
                (chain, contract_address, first_seen_at, last_seen_at, mentions,
                 last_channel_id, last_message_id, last_raw_address, last_source,
                 last_message_text, channel_count, channels_seen)
                VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?, 1, ?)
                ON CONFLICT(chain, contract_address) DO UPDATE SET
                    last_seen_at = excluded.last_seen_at,
                    mentions = mentions + 1,
                    last_source = excluded.last_source,
                    last_message_text = excluded.last_message_text
            """,
                (
                    chain,
                    mint,
                    now,
                    now,
                    "pumpportal",
                    mint,
                    "pumpportal_new_token",
                    message_text,
                    json.dumps(["pumpportal"]),
                ),
            )

            # Track creator wallet
            if creator and len(creator) >= 32:
                token_label = f"{symbol or name} ({mint[:8]}...)"
                if creator not in self._creators:
                    self._creators[creator] = []
                    self.stats["creators"] += 1
                self._creators[creator].append(token_label)

                # Store creator as a "wallet" contract entry (solana chain)
                creator_msg = f"pumpfun_dev | tokens: {', '.join(self._creators[creator][:5])}"
                conn.execute(
                    """
                    INSERT INTO telegram_contracts_unique
                    (chain, contract_address, first_seen_at, last_seen_at, mentions,
                     last_channel_id, last_message_id, last_raw_address, last_source,
                     last_message_text, channel_count, channels_seen)
                    VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?, 1, ?)
                    ON CONFLICT(chain, contract_address) DO UPDATE SET
                        last_seen_at = excluded.last_seen_at,
                        mentions = mentions + 1,
                        last_message_text = excluded.last_message_text
                """,
                    (
                        chain,
                        creator,
                        now,
                        now,
                        "pumpportal_creator",
                        creator,
                        "pumpportal_creator",
                        creator_msg,
                        json.dumps(["pumpportal"]),
                    ),
                )

            if existing:
                self.stats["duplicates"] += 1
            else:
                self.stats["new"] += 1
        except Exception as e:
            self.stats["errors"] += 1
            print(f"  DB error: {e}")

    def _flush_buffer(self):
        """Commit pending inserts to DB."""
        if self.conn:
            self.conn.commit()

    async def _handle_message(self, raw: str):
        """Process a single WebSocket message."""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return

        # Skip subscription confirmations and pongs
        if "message" in data and "mint" not in data:
            return

        self.stats["received"] += 1

        # Store token creation events
        if data.get("txType") == "create" and data.get("mint"):
            self._store_token(data)

            # Periodic commit
            if (self.stats["new"] + self.stats["duplicates"]) % BATCH_COMMIT == 0:
                self._flush_buffer()

        # Log progress every 50 tokens
        if self.stats["received"] % 50 == 0:
            ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
            print(
                f"[{ts}] {self.stats['received']} received, "
                f"{self.stats['new']} new, {self.stats['duplicates']} dupes"
            )

    async def run(self, max_duration: int = 0):
        """Main loop with auto-reconnect."""
        import websockets

        print("=== PumpPortal Harvester ===")
        print(f"URL: {WS_URL[:50]}...")
        print(f"DB: {self.db_path}")
        print()

        start_time = time.time()

        while self.running:
            if max_duration and (time.time() - start_time) > max_duration:
                print(f"Duration limit ({max_duration}s) reached")
                break

            try:
                async with websockets.connect(WS_URL, ping_interval=20, ping_timeout=10) as ws:
                    # Subscribe to new token creation
                    await ws.send(json.dumps({"method": "subscribeNewToken"}))

                    # Also subscribe to logs for pump.fun program
                    await ws.send(
                        json.dumps(
                            {
                                "method": "subscribeLogs",
                                "keys": ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
                            }
                        )
                    )

                    resp = await ws.recv()
                    confirm = json.loads(resp)
                    print(f"Connected: {confirm.get('message', 'OK')}")

                    self._reconnect_count = 0

                    while self.running:
                        if max_duration and (time.time() - start_time) > max_duration:
                            break
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=30)
                            await self._handle_message(msg)
                        except asyncio.TimeoutError:
                            # Send ping to keep alive
                            try:
                                await ws.ping()
                            except Exception:
                                break  # reconnect

            except Exception as e:
                self._reconnect_count += 1
                delay = min(RECONNECT_DELAY * self._reconnect_count, 60)
                print(f"Connection error: {e} (reconnect #{self._reconnect_count} in {delay}s)")
                if self._reconnect_count > MAX_RECONNECT:
                    print("Max reconnects reached, stopping")
                    break
                await asyncio.sleep(delay)

        # Final flush
        self._flush_buffer()
        self._print_stats()

    def _print_stats(self):
        print("\n=== Stats ===")
        print(f"Received:  {self.stats['received']}")
        print(f"New:       {self.stats['new']}")
        print(f"Duplicates:{self.stats['duplicates']}")
        print(f"Errors:    {self.stats['errors']}")
        print(f"Creators:  {self.stats['creators']} unique dev wallets")

        if self.conn:
            total = self.conn.execute(
                "SELECT COUNT(*) FROM telegram_contracts_unique WHERE last_source = 'pumpportal_new_token'"
            ).fetchone()[0]
            print(f"DB pumpportal tokens: {total}")
            self.conn.close()

    def stop(self):
        self.running = False


def show_stats():
    """Show current pumpportal token count in DB."""
    if not DB_PATH.exists():
        print("DB not found")
        return

    conn = sqlite3.connect(str(DB_PATH))
    total = conn.execute("SELECT COUNT(*) FROM telegram_contracts_unique").fetchone()[0]
    pp = conn.execute(
        "SELECT COUNT(*) FROM telegram_contracts_unique WHERE last_source LIKE '%pumpportal%'"
    ).fetchone()[0]

    # Recent (last hour)
    one_hour_ago = time.time() - 3600
    recent = conn.execute(
        "SELECT COUNT(*) FROM telegram_contracts_unique WHERE last_source LIKE '%pumpportal%' AND last_seen_at > ?",
        (one_hour_ago,),
    ).fetchone()[0]

    print(f"DB total contracts: {total}")
    print(f"  PumpPortal: {pp}")
    print(f"  PumpPortal (last 1h): {recent}")

    # Sample recent
    rows = conn.execute("""
        SELECT contract_address, last_message_text, last_seen_at
        FROM telegram_contracts_unique
        WHERE last_source LIKE '%pumpportal%'
        ORDER BY last_seen_at DESC LIMIT 5
    """).fetchall()
    if rows:
        print("\nRecent pumpportal tokens:")
        for addr, msg, ts in rows:
            age = int(time.time() - ts)
            print(f"  {addr[:20]}...  {msg}  ({age}s ago)")

    conn.close()


async def main():

    # Force unbuffered output for daemon mode
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser(description="PumpPortal WebSocket Harvester")
    parser.add_argument("--test", type=int, default=0, help="Test for N seconds (0=forever)")
    parser.add_argument("--count", action="store_true", help="Show DB stats")
    args = parser.parse_args()

    if args.count:
        show_stats()
        return

    harvester = PumpPortalHarvester()

    # Handle Ctrl+C
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, harvester.stop)

    await harvester.run(max_duration=args.test)


if __name__ == "__main__":
    asyncio.run(main())
