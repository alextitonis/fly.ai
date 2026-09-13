#!/usr/bin/env python3
"""
Token enricher with remote worker delegation.

If HERMES_WORKER_URL is set, all API calls go through the remote VPS.
Otherwise, enrichment runs locally (needs internet access).
"""

import json
import os
import sys
import sqlite3
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger("enricher")

# Remote worker config
WORKER_URL = os.environ.get("HERMES_WORKER_URL", "")
DB_PATH = Path.home() / ".hermes" / "hermes-token-screener" / "screener.db"


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(str(DB_PATH), timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    return db


def fetch_tokens_needing_enrichment(chain: str | None = None, limit: int = 50) -> list[dict]:
    """Get tokens that need enrichment from the database."""
    db = get_db()
    try:
        query = """
            SELECT chain, address, COALESCE(symbol, '') as symbol
            FROM tokens
            WHERE (enriched_at IS NULL OR enriched_at < datetime('now', '-1 hour'))
              AND (ignored IS NULL OR ignored = 0)
        """
        params = []
        if chain:
            query += " AND chain = ?"
            params.append(chain)
        query += " ORDER BY first_seen DESC LIMIT ?"
        params.append(limit)

        rows = db.execute(query, params).fetchall()
        return [{"chain": r[0], "address": r[1], "symbol": r[2]} for r in rows]
    finally:
        db.close()


def save_enrichment(chain: str, address: str, data: dict):
    """Save enrichment data to database."""
    db = get_db()
    try:
        enrichment_json = json.dumps(data)
        db.execute("""
            INSERT OR REPLACE INTO enrichment (chain, address, data, enriched_at)
            VALUES (?, ?, ?, ?)
        """, (chain, address, enrichment_json, datetime.now(timezone.utc).isoformat()))
        db.commit()
    finally:
        db.close()


def update_token_score(chain: str, address: str, score: float, positives: list, negatives: list):
    """Update token score in database."""
    db = get_db()
    try:
        db.execute("""
            UPDATE tokens
            SET score = ?,
                score_reasons = ?,
                score_updated_at = ?
            WHERE chain = ? AND address = ?
        """, (
            score,
            json.dumps({"positives": positives, "negatives": negatives}),
            datetime.now(timezone.utc).isoformat(),
            chain,
            address,
        ))
        db.commit()
    finally:
        db.close()


async def enrich_via_worker(tokens: list[dict], layers: list[str] | None = None) -> dict:
    """
    Enrich tokens via remote worker (offloads all API calls to VPS).

    Args:
        tokens: [{"chain": "base", "address": "0x...", "symbol": "TOKEN"}, ...]
        layers: enrichment layers to run (default: all)

    Returns:
        {"tokens": [...], "layer_status": {...}, "total_elapsed": 1.23}
    """
    if not WORKER_URL:
        raise ValueError("HERMES_WORKER_URL not set - cannot use remote worker")

    if not layers:
        layers = ["dexscreener", "rugcheck", "etherscan"]  # CoinGecko removed - Dexscreener is the sole market data provider

    payload = {"tokens": tokens, "layers": layers}

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{WORKER_URL}/enrich", json=payload)
        resp.raise_for_status()
        return resp.json()


async def enrich_batch(chain: str | None = None, limit: int = 30) -> dict:
    """
    Main enrichment entry point.

    If HERMES_WORKER_URL is set, delegates to remote worker.
    Otherwise, runs enrichment locally (needs internet).

    Returns summary of what was enriched.
    """
    tokens = fetch_tokens_needing_enrichment(chain=chain, limit=limit)
    if not tokens:
        log.info("No tokens need enrichment")
        return {"enriched": 0, "skipped": 0}

    log.info(f"Enriching {len(tokens)} tokens")

    if WORKER_URL:
        # Remote worker path - all API calls happen on VPS
        log.info(f"Using remote worker: {WORKER_URL}")
        result = await enrich_via_worker(tokens)
        enriched = 0
        for token in result.get("tokens", []):
            save_enrichment(
                token.get("chain", chain or ""),
                token.get("address", ""),
                token,
            )
            if token.get("score") is not None:
                update_token_score(
                    token.get("chain", chain or ""),
                    token.get("address", ""),
                    token["score"],
                    token.get("positives", []),
                    token.get("negatives", []),
                )
            enriched += 1

        log.info(f"Enriched {enriched} tokens via remote worker ({result.get('total_elapsed', '?')}s)")
        return {
            "enriched": enriched,
            "total_tokens": len(tokens),
            "worker_url": WORKER_URL,
            "elapsed": result.get("total_elapsed"),
        }
    else:
        # Local path - needs internet
        log.warning("No HERMES_WORKER_URL set - running enrichment locally")
        from hermes_screener.async_enrichment import run_async_enrichment

        enriched_tokens, _layer_results = await run_async_enrichment(
            candidates=tokens, max_enrich=limit
        )

        for token in enriched_tokens:
            save_enrichment(
                token.get("chain", chain or ""),
                token.get("address", ""),
                token,
            )
            if token.get("score") is not None:
                update_token_score(
                    token.get("chain", chain or ""),
                    token.get("address", ""),
                    token["score"],
                    token.get("positives", []),
                    token.get("negatives", []),
                )

        return {
            "enriched": len(enriched_tokens),
            "total_tokens": len(tokens),
            "mode": "local",
        }


def remote_proxy(url: str, method: str = "GET", headers: dict | None = None) -> dict:
    """
    Proxy an API call through the remote worker.
    Useful for Dexscreener API calls.
    """
    if not WORKER_URL:
        # Fallback to direct call
        resp = httpx.request(method, url, headers=headers or {}, timeout=20.0)
        return {"status_code": resp.status_code, "body": resp.text}

    payload = {
        "url": url,
        "method": method,
        "headers": headers or {},
    }
    resp = httpx.post(f"{WORKER_URL}/proxy", json=payload, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


# CLI entry point
if __name__ == "__main__":
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(description="Token enricher with remote worker support")
    parser.add_argument("--chain", help="Filter by chain")
    parser.add_argument("--limit", type=int, default=30, help="Max tokens to enrich")
    parser.add_argument("--worker-url", help="Override HERMES_WORKER_URL")
    args = parser.parse_args()

    if args.worker_url:
        WORKER_URL = args.worker_url

    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(enrich_batch(chain=args.chain, limit=args.limit))
    print(json.dumps(result, indent=2))