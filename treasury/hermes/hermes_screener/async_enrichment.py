"""
Async enrichment orchestrator — parallelizes all optional enrichment layers.

Instead of running layers 1-11 sequentially (~8 min), this runs them concurrently
using asyncio + httpx (~1-2 min depending on API latency).

Architecture:
  Layer 0 (Dexscreener): REQUIRED — runs first, blocking (enriches raw candidates with market data)
  Layers 1-10: OPTIONAL — all run in parallel via asyncio.gather()
    - HTTP enrichers (Surf, RugCheck, Etherscan, De.Fi, Zerion):
      use httpx.AsyncClient with per-enricher semaphores for rate limiting
    - CLI enrichers (Surf CLI, GMGN MCP): use asyncio.to_thread()
    - Derived (no API): runs directly (pure computation)

Usage:
    from hermes_screener.async_enrichment import run_async_enrichment
    result = run_async_enrichment(candidates, max_enrich=300)

Or from token_enricher.py:
    python3 token_enricher.py --async    # uses async parallel enrichment
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from hermes_screener.config import settings
from hermes_screener.logging import get_logger
from hermes_screener.metrics import metrics

log = get_logger("async_enrichment")


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP CLIENT FACTORY
# ═══════════════════════════════════════════════════════════════════════════════


def _make_client(
    base_url: str = "",
    headers: dict | None = None,
    timeout: float = 15.0,
    max_connections: int = 10,
) -> httpx.AsyncClient:
    """Create an httpx.AsyncClient with sensible defaults."""
    limits = httpx.Limits(
        max_connections=max_connections,
        max_keepalive_connections=5,
    )
    return httpx.AsyncClient(
        base_url=base_url,
        headers=headers or {},
        timeout=httpx.Timeout(timeout, connect=5.0),
        limits=limits,
        follow_redirects=True,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ASYNC ENRICHER WRAPPERS
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class LayerResult:
    """Result from a single enrichment layer."""

    name: str
    success: bool
    enriched_count: int
    total_count: int
    elapsed: float
    error: str | None = None


class AsyncDexscreenerEnricher:
    """Async Dexscreener — REQUIRED layer, enriches raw candidates."""

    BASE_URL = "https://api.dexscreener.com/latest/dex"

    def __init__(self, concurrency: int = 5):
        self.semaphore = asyncio.Semaphore(concurrency)

    async def enrich_batch(
        self,
        tokens: list[dict],
        client: httpx.AsyncClient,
    ) -> tuple[list[dict], int]:
        """Enrich a batch of tokens with Dexscreener data."""
        tasks = [self._enrich_one(client, token, i, len(tokens)) for i, token in enumerate(tokens)]
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=300.0
            )
        except asyncio.TimeoutError:
            # Phase 1 timeout — return partial results (none succeeded)
            return [], 0
        enriched = []
        count = 0
        for r in results:
            if isinstance(r, dict) and r.get("dex"):
                enriched.append(r)
                count += 1
        return enriched, count

    async def _enrich_one(
        self,
        client: httpx.AsyncClient,
        token: dict,
        idx: int,
        total: int,
    ) -> dict:
        addr = token["contract_address"]
        async with self.semaphore:
            try:
                # Conservative request with exponential backoff for rate limits
                max_retries = 5
                base_delay = 2.0  # Start with 2s, then 4s, 8s, 16s, 32s
                resp = None
                for attempt in range(max_retries):
                    if attempt > 0:
                        backoff = base_delay * (2 ** (attempt - 1))
                        await asyncio.sleep(backoff)
                    resp = await client.get(f"{self.BASE_URL}/tokens/{addr}")
                    if resp.status_code == 200:
                        break
                    if resp.status_code == 429 and attempt < max_retries - 1:
                        continue  # retry
                    # Any other status code: give up on this token
                    return token
                if resp is None or resp.status_code != 200:
                    return token

                data = resp.json()
                pairs = data.get("pairs", [])
                if not pairs:
                    return token

                best = max(pairs, key=lambda p: (p.get("liquidity", {}).get("usd", 0) or 0))
                txns = best.get("txns", {})
                volume = best.get("volume", {})
                price_change = best.get("priceChange", {})

                # Preserve original symbol/name when Dexscreener returns empty
                orig_symbol = token.get("symbol")
                orig_name = token.get("name")
                ds_symbol = best.get("baseToken", {}).get("symbol")
                ds_name = best.get("baseToken", {}).get("name")
                dex_data = {
                    "fdv": best.get("fdv"),
                    "market_cap": best.get("marketCap"),
                    "liquidity_usd": best.get("liquidity", {}).get("usd"),
                    "volume_m5": volume.get("m5", 0) or 0,
                    "volume_h1": volume.get("h1", 0) or 0,
                    "volume_h6": volume.get("h6", 0) or 0,
                    "volume_h24": volume.get("h24", 0) or 0,
                    "txns_m5": txns.get("m5", {}),
                    "txns_h1": txns.get("h1", {}),
                    "txns_h6": txns.get("h6", {}),
                    "txns_h24": txns.get("h24", {}),
                    "price_change_m5": price_change.get("m5"),
                    "price_change_h1": price_change.get("h1"),
                    "price_change_h6": price_change.get("h6"),
                    "price_change_h24": price_change.get("h24"),
                    "age_hours": self._age_hours(best.get("pairCreatedAt")),
                    "dex": best.get("dexId"),
                    "symbol": ds_symbol or orig_symbol,
                    "name": ds_name or orig_name,
                    "pair_address": best.get("pairAddress"),
                }
                # Only correct chain from Dexscreener when original is unreliable.
                ds_chain = best.get("chainId", "")
                orig_chain = token.get("chain", "")
                reliable_sources = {"gmgn_trenches", "gmgn_trending"}
                is_reliable = any((token.get("last_source", "") or "").startswith(s) for s in reliable_sources)
                if ds_chain and ds_chain != orig_chain and not is_reliable:
                    token["chain"] = ds_chain

                # Extract social links from Dexscreener info
                info = best.get("info", {})
                socials = info.get("socials", [])
                websites = info.get("websites", [])
                for s in socials:
                    stype = s.get("type", "")
                    surl = s.get("url", "")
                    if stype == "twitter":
                        dex_data["twitter_url"] = surl
                    elif stype == "telegram":
                        dex_data["telegram_url"] = surl
                if websites:
                    dex_data["website_url"] = websites[0].get("url", "")

                # Return with symbol/name lifted to top-level
                return {
                    **token,
                    "symbol": ds_symbol or orig_symbol,
                    "name": ds_name or orig_name,
                    "dex": dex_data,
                }
            except Exception as e:
                metrics.api_calls.labels(provider="dexscreener", status="error").inc()
                if (idx + 1) % 50 == 0:
                    log.warning("dexscreener_error", idx=idx + 1, total=total, error=str(e))
                return token

    @staticmethod
    def _age_hours(created_at_ms) -> float | None:
        if not created_at_ms:
            return None
        return round((time.time() * 1000 - created_at_ms) / 3600000, 2)  # type: ignore[no-any-return]


class AsyncHttpEnricher:
    """Generic async HTTP enricher for per-token API calls."""

    def __init__(
        self,
        name: str,
        base_url: str = "",
        headers: dict | None = None,
        concurrency: int = 3,
        delay: float = 0.5,
        timeout: float = 15.0,
    ):
        self.name = name
        self.base_url = base_url
        self.headers = headers or {}
        self.semaphore = asyncio.Semaphore(concurrency)
        self.delay = delay
        self.timeout = timeout
        self._last_request = 0.0

    async def enrich_batch(
        self,
        enrich_fn: Callable,
        tokens: list[dict],
        client: httpx.AsyncClient,
    ) -> tuple[int, int]:
        """
        Run enrich_fn(token, client) on each token with rate limiting.
        enrich_fn should mutate the token dict in-place and return it.
        """
        tasks = []
        for i, token in enumerate(tokens):
            tasks.append(self._run_one(enrich_fn, token, client, i, len(tokens)))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        success = sum(1 for r in results if r is True)
        return success, len(tokens)

    async def _run_one(
        self,
        fn: Callable,
        token: dict,
        client: httpx.AsyncClient,
        idx: int,
        total: int,
    ) -> bool:
        async with self.semaphore:
            # Rate limiting
            elapsed = time.time() - self._last_request
            if elapsed < self.delay:
                await asyncio.sleep(self.delay - elapsed)
            self._last_request = time.time()

            try:
                await fn(token, client)
                metrics.enrich_layer_calls.labels(layer=self.name, status="ok").inc()
                return True
            except Exception as e:
                metrics.enrich_layer_calls.labels(layer=self.name, status="error").inc()
                if (idx + 1) % 20 == 0:
                    log.warning(
                        "layer_error",
                        layer=self.name,
                        idx=idx + 1,
                        total=total,
                        error=str(e),
                    )
                return False


# ═══════════════════════════════════════════════════════════════════════════════
# INDIVIDUAL LAYER ASYNC IMPLEMENTATIONS
# ═══════════════════════════════════════════════════════════════════════════════


async def _enrich_rugcheck(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 3: RugCheck (Solana only)."""
    if token.get("chain", "").lower() not in ("solana", "sol"):
        return

    addr = token["contract_address"]
    resp = await client.get(f"https://api.rugcheck.xyz/v1/tokens/{addr}/report")
    if resp.status_code != 200:
        return

    data = resp.json()
    token["rugcheck"] = {
        "score": data.get("score"),
        "risk_level": data.get("riskLevel"),
        "risks": data.get("risks", []),
        "insider_percentage": data.get("insiderAccounts", {}).get("percentage", 0),
        "top_holders_pct": sum(h.get("pct", 0) for h in data.get("topHolders", [])[:10]),
        "lp_locked": (
            data.get("markets", [{}])[0].get("lp", {}).get("lpLocked", False) if data.get("markets") else False
        ),
    }


async def _enrich_etherscan(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 4: Etherscan contract verification."""
    chain = token.get("chain", "").lower()
    if chain not in ("ethereum", "eth", "base"):
        return

    addr = token["contract_address"]
    api_key = settings.etherscan_api_key or "3VY4WXTCKJWC3PQHDTK38MVR73AMPV5A4S"
    resp = await client.get(
        "https://api.etherscan.io/v2/api",
        params={
            "chainid": 8453 if chain == "base" else 1,
            "module": "contract",
            "action": "getsourcecode",
            "address": addr,
            "apikey": api_key,
        },
    )
    if resp.status_code != 200:
        return

    data = resp.json()
    results = data.get("result", [{}])
    if not results:
        return

    r = results[0]
    token["etherscan"] = {
        "is_verified": r.get("ABI") != "Contract source code not verified",
        "compiler": r.get("CompilerVersion", ""),
        "optimization": r.get("OptimizationUsed", "") == "1",
        "contract_name": r.get("ContractName", ""),
    }


async def _enrich_defi(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 5: De.Fi security analysis."""
    chain = token.get("chain", "").lower()
    chain_ids = {
        "ethereum": 1,
        "eth": 1,
        "binance": 2,
        "bsc": 2,
        "solana": 12,
        "base": 49,
    }
    de_fi_chain = chain_ids.get(chain)
    if de_fi_chain is None:
        return

    addr = token["contract_address"]
    headers = {"Content-Type": "application/json"}
    if settings.defi_api_key:
        headers["X-Api-Key"] = settings.defi_api_key

    resp = await client.post(
        "https://public-api.de.fi/graphql",
        json={
            "query": """
                query GetScannerReport($chain: Int!, $address: String!) {
                    authenticatedGetAccessToSmartContractSecurityDatabase(chain: $chain, address: $address) {
                        issues { name severity }
                        scScore { score }
                        isHoneypot
                    }
                }
            """,
            "variables": {"chain": de_fi_chain, "address": addr},
        },
        headers=headers,
    )
    if resp.status_code != 200:
        return

    data = resp.json()
    report = data.get("data", {}).get("authenticatedGetAccessToSmartContractSecurityDatabase", {})
    if not report:
        return

    issues = report.get("issues", [])
    score_obj = report.get("scScore", {})
    token["defi"] = {
        "score": score_obj.get("score"),
        "issue_count": len(issues),
        "critical_issues": len([i for i in issues if i.get("severity") == "CRITICAL"]),
        "is_honeypot": report.get("isHoneypot", False),
    }


async def _enrich_zerion(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 10: Zerion portfolio data."""
    if not settings.zerion_api_key:
        return

    addr = token["contract_address"]
    resp = await client.get(
        f"https://api.zerion.io/v1/wallets/{addr}/portfolio",
        headers={"Authorization": f"Basic {settings.zerion_api_key}"},
    )
    if resp.status_code != 200:
        return

    data = resp.json()
    portfolio = data.get("data", {}).get("attributes", {})
    token["zerion"] = {
        "total_value": portfolio.get("total", {}).get("positions", 0),
    }


async def _enrich_solscan(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 14: Solscan token data (Solana only) - Free tier endpoints."""
    chain = token.get("chain", "").lower()
    if chain not in ("solana", "sol"):
        return

    addr = token["contract_address"]
    headers = {
        "Accept": "application/json",
    }

    try:
        # Use free tier endpoints (no authentication required)
        # Get token info
        resp = await client.get(
            f"https://public-api.solscan.io/token/meta?tokenAddress={addr}",
            headers=headers,
            timeout=10.0,
        )
        if resp.status_code != 200:
            return

        data = resp.json()

        # Get token holders (free tier)
        resp_holders = await client.get(
            f"https://public-api.solscan.io/token/holders?tokenAddress={addr}&limit=10",
            headers=headers,
            timeout=10.0,
        )
        holders_data = resp_holders.json() if resp_holders.status_code == 200 else {}

        # Get token transfers (free tier)
        resp_transfers = await client.get(
            f"https://public-api.solscan.io/token/transfer?tokenAddress={addr}&limit=10",
            headers=headers,
            timeout=10.0,
        )
        transfers_data = resp_transfers.json() if resp_transfers.status_code == 200 else {}

        token["solscan"] = {
            "name": data.get("name", ""),
            "symbol": data.get("symbol", ""),
            "decimals": data.get("decimals", 0),
            "supply": data.get("supply", 0),
            "market_cap": data.get("marketCap", 0),
            "price_usd": data.get("priceUsd", 0),
            "price_change_24h": data.get("priceChange24h", 0),
            "volume_24h": data.get("volume24h", 0),
            "holder_count": data.get("holder", 0),
            "top_holders": holders_data.get("data", []),
            "recent_transfers": transfers_data.get("data", []),
        }

    except Exception:
        # Silently fail - don't break the pipeline
        pass


async def _enrich_helius(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 15: Helius token data (Solana only)."""
    if not settings.helius_api_key:
        return

    chain = token.get("chain", "").lower()
    if chain not in ("solana", "sol"):
        return

    addr = token["contract_address"]

    try:
        # Get token metadata
        resp = await client.post(
            f"https://mainnet.helius-rpc.com/?api-key={settings.helius_api_key}",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAsset",
                "params": {"id": addr, "displayOptions": {"showFungibleTokens": True}},
            },
            timeout=10.0,
        )

        if resp.status_code != 200:
            return

        data = resp.json()
        result = data.get("result", {})

        # Get token holders (using getTokenAccounts)
        resp_holders = await client.post(
            f"https://mainnet.helius-rpc.com/?api-key={settings.helius_api_key}",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTokenAccounts",
                "params": {"mint": addr, "limit": 10},
            },
            timeout=10.0,
        )
        holders_data = resp_holders.json() if resp_holders.status_code == 200 else {}

        token["helius"] = {
            "name": result.get("content", {}).get("metadata", {}).get("name", ""),
            "symbol": result.get("content", {}).get("metadata", {}).get("symbol", ""),
            "decimals": result.get("token_info", {}).get("decimals", 0),
            "supply": result.get("token_info", {}).get("supply", 0),
            "price_per_token": result.get("token_info", {}).get("price_info", {}).get("price_per_token", 0),
            "total_price": result.get("token_info", {}).get("price_info", {}).get("total_price", 0),
            "currency": result.get("token_info", {}).get("price_info", {}).get("currency", ""),
            "holder_count": len(holders_data.get("result", {}).get("token_accounts", [])),
        }

    except Exception:
        # Silently fail - don't break the pipeline
        pass


async def _enrich_birdeye(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 16: Birdeye token data (Multi-chain)."""
    if not settings.birdeye_api_key:
        return

    addr = token["contract_address"]
    chain = token.get("chain", "").lower()

    # Map chain to Birdeye chain identifier
    chain_map = {
        "solana": "solana",
        "sol": "solana",
        "ethereum": "ethereum",
        "eth": "ethereum",
        "base": "base",
        "binance": "bsc",
        "bsc": "bsc",
        "polygon": "polygon",
    }

    birdeye_chain = chain_map.get(chain, "solana")

    headers = {"X-API-KEY": settings.birdeye_api_key, "accept": "application/json"}

    try:
        # Get token overview
        resp = await client.get(
            f"https://public-api.birdeye.so/defi/token_overview?address={addr}&chain={birdeye_chain}",
            headers=headers,
            timeout=10.0,
        )

        if resp.status_code != 200:
            return

        data = resp.json()
        token_data = data.get("data", {})

        # Get token holders (if available)
        resp_holders = await client.get(
            f"https://public-api.birdeye.so/defi/token_holder?address={addr}&chain={birdeye_chain}&limit=10",
            headers=headers,
            timeout=10.0,
        )
        holders_data = resp_holders.json() if resp_holders.status_code == 200 else {}

        # Get token trading data
        resp_trading = await client.get(
            f"https://public-api.birdeye.so/defi/token_trading_data?address={addr}&chain={birdeye_chain}&time_frame=24h",
            headers=headers,
            timeout=10.0,
        )
        trading_data = resp_trading.json() if resp_trading.status_code == 200 else {}

        token["birdeye"] = {
            "name": token_data.get("name", ""),
            "symbol": token_data.get("symbol", ""),
            "decimals": token_data.get("decimals", 0),
            "supply": token_data.get("supply", 0),
            "market_cap": token_data.get("mc", 0),
            "fdv": token_data.get("fdv", 0),
            "liquidity": token_data.get("liquidity", 0),
            "price": token_data.get("price", 0),
            "price_change_24h": token_data.get("priceChange24h", 0),
            "volume_24h": token_data.get("v24h", 0),
            "volume_24h_change": token_data.get("v24hChange", 0),
            "trade_24h": token_data.get("trade24h", 0),
            "trade_24h_change": token_data.get("trade24hChange", 0),
            "holder_count": token_data.get("holder", 0),
            "top_holders": holders_data.get("data", {}).get("items", []),
            "trading_data": trading_data.get("data", {}),
        }

    except Exception:
        # Silently fail - don't break the pipeline
        pass


# ═══════════════════════════════════════════════════════════════════════════════
# CLI ENRICHER WRAPPERS (async via to_thread)
# ═══════════════════════════════════════════════════════════════════════════════


async def _run_cli_enricher(name: str, sync_fn: Callable, enriched: list) -> LayerResult:
    """Run a synchronous CLI enricher in a thread."""
    start = time.time()
    try:
        _, count = await asyncio.to_thread(sync_fn, enriched)
        elapsed = time.time() - start
        metrics.enrich_layer_calls.labels(layer=name, status="ok").inc()
        return LayerResult(
            name=name,
            success=True,
            enriched_count=count,
            total_count=len(enriched),
            elapsed=elapsed,
        )
    except Exception as e:
        elapsed = time.time() - start
        metrics.enrich_layer_calls.labels(layer=name, status="error").inc()
        log.warning("cli_layer_failed", layer=name, error=str(e))
        return LayerResult(
            name=name,
            success=False,
            enriched_count=0,
            total_count=len(enriched),
            elapsed=elapsed,
            error=str(e),
        )


# ═══════════════════════════════════════════════════════════════════════════════
# GOLDRUSH (Covalent) - wallet balances, token holders, chain data
# ═══════════════════════════════════════════════════════════════════════════════

CHAIN_ID_MAP = {
    "ethereum": 1,
    "eth": 1,
    "base": 8453,
    "bsc": 56,
    "bnb": 56,
    "arbitrum": 42161,
    "polygon": 137,
    "avalanche": 43114,
    "optimism": 10,
    "solana": None,  # Goldrush doesn't support Solana
}


async def _enrich_goldrush(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 14: Goldrush (Covalent) - token holder count and top holders."""
    if not settings.goldrush_api_key:
        return

    chain = token.get("chain", "").lower()
    chain_id = CHAIN_ID_MAP.get(chain)
    if not chain_id:
        return  # Unsupported chain (includes Solana)

    addr = token.get("contract_address", "")
    if not addr or not addr.startswith("0x"):
        return

    try:
        # Get token holders (paginated, first page)
        resp = await client.get(
            f"https://api.covalenthq.com/v1/{chain_id}/tokens/{addr}/token_holders/",
            params={"page-size": "10"},
            headers={"Authorization": f"Bearer {settings.goldrush_api_key}"},
            timeout=20.0,
        )

        if resp.status_code != 200:
            return

        data = resp.json()
        if data.get("error"):
            return

        holder_data = data.get("data", {})
        total_holders = holder_data.get("pagination", {}).get("total_count", 0)
        top_holders = holder_data.get("items", [])

        token["goldrush"] = {
            "total_holders": total_holders,
            "top_holders": [
                {
                    "address": h.get("address", ""),
                    "balance": h.get("balance", "0"),
                    "share_pct": h.get("share", 0),
                }
                for h in top_holders[:5]
            ],
            "chain_id": chain_id,
        }

        # Boost score for high holder count
        if total_holders > 1000:
            token.setdefault("goldrush_signal", {})
            token["goldrush_signal"]["holders_1k_plus"] = True

    except Exception:
        pass  # Silently fail


# ═══════════════════════════════════════════════════════════════════════════════
# GOLDSKY Edge RPC - on-chain data (token balance, holder count, transfers)
# ═══════════════════════════════════════════════════════════════════════════════


async def _enrich_goldsky(token: dict, client: httpx.AsyncClient) -> None:
    """Layer 15: Goldsky Edge RPC - recent transfer count + top holder balance."""
    if not settings.goldsky_api_key:
        return

    chain = token.get("chain", "").lower()
    chain_id = CHAIN_ID_MAP.get(chain)
    if not chain_id:
        return  # Unsupported chain

    addr = token.get("contract_address", "")
    if not addr or not addr.startswith("0x"):
        return

    rpc_url = f"https://edge.goldsky.com/standard/evm/{chain_id}?secret={settings.goldsky_api_key}"
    transfer_topic = (
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"  # Transfer(address,address,uint256)
    )

    try:
        # Get recent Transfer events for this token (last ~100 blocks)
        block_resp = await client.post(
            rpc_url,
            json={"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1},
            headers={"Content-Type": "application/json"},
            timeout=10.0,
        )
        if block_resp.status_code != 200:
            return
        current_block = int(block_resp.json().get("result", "0x0"), 16)
        from_block = hex(max(0, current_block - 500))  # ~500 blocks back

        # Get Transfer logs
        logs_resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "method": "eth_getLogs",
                "params": [
                    {
                        "address": addr,
                        "topics": [transfer_topic],
                        "fromBlock": from_block,
                        "toBlock": "latest",
                    }
                ],
                "id": 2,
            },
            headers={"Content-Type": "application/json"},
            timeout=15.0,
        )
        if logs_resp.status_code != 200:
            return

        logs = logs_resp.json().get("result", [])
        transfer_count = len(logs)

        # Count unique senders/receivers
        senders = set()
        receivers = set()
        for log in logs[:200]:
            topics = log.get("topics", [])
            if len(topics) >= 3:
                senders.add("0x" + topics[1][-40:])
                receivers.add("0x" + topics[2][-40:])

        token["goldsky"] = {
            "chain_id": chain_id,
            "recent_transfers": transfer_count,
            "unique_senders": len(senders),
            "unique_receivers": len(receivers),
            "blocks_scanned": 500,
        }

        # Signal: high transfer activity = active token
        if transfer_count > 50:
            token.setdefault("goldsky_signal", {})
            token["goldsky_signal"]["high_activity"] = True
        if len(receivers) > 20:
            token.setdefault("goldsky_signal", {})
            token["goldsky_signal"]["many_buyers"] = True

    except Exception:
        pass  # Silently fail


# ═══════════════════════════════════════════════════════════════════════════════
# BITQUERY - DEX trades (point-optimized, cached)
# ═══════════════════════════════════════════════════════════════════════════════

_bitquery_cache: dict = {}  # addr -> (data, timestamp)
BITQUERY_CACHE_TTL = 3600  # 1 hour - avoid re-querying same tokens
BITQUERY_POINTS_EXHAUSTED = False  # circuit breaker - stop after first 402


async def _enrich_bitquery(token: dict, client: httpx.AsyncClient) -> None:
    """
    Layer 16: Bitquery - recent DEX trades for EVM tokens.

    POINT-SAVING MEASURES (free tier = 1000 pts, streaming = 40 pts/min):
    - Uses real-time DB only (5 pts/query) — never streaming or archive
    - Strict LIMIT 10 (free tier max rows)
    - 1-hour cache TTL — never re-query same token
    - Circuit breaker — stops all queries after first 402 (points exhausted)
    - Only queries EVM chains (Solana archive queries are expensive)
    - Filters by time (last 24h) to reduce scan scope
    """
    global BITQUERY_POINTS_EXHAUSTED

    if not settings.bitquery_api_key:
        return

    # Circuit breaker: skip all if points exhausted
    if BITQUERY_POINTS_EXHAUSTED:
        return

    chain = token.get("chain", "").lower()
    if chain in ("solana", "sol", ""):
        return  # Skip Solana (archive queries are expensive on Bitquery)

    addr = token.get("contract_address", "")
    if not addr or not addr.startswith("0x"):
        return

    # Cache check: 1-hour TTL
    now = time.time()
    if addr in _bitquery_cache:
        cached_data, cached_at = _bitquery_cache[addr]
        if now - cached_at < BITQUERY_CACHE_TTL:
            token["bitquery"] = cached_data
            return

    # Map chain to Bitquery network name
    network_map = {
        "ethereum": "ethereum",
        "eth": "ethereum",
        "base": "base",
        "bsc": "bsc",
        "bnb": "bsc",
        "arbitrum": "arbitrum",
        "polygon": "matic",
        "avalanche": "avalanche",
    }
    network = network_map.get(chain)
    if not network:
        return

    try:
        # Real-time DB query — 5 points per query (cheapest option)
        # LIMIT 10 — free tier max rows
        # Time filter — last 24h only (reduces scan scope = fewer points)
        query = """query ($network: evm_network, $token: String!, $limit: Int!) {
          EVM(network: $network, dataset: realtime) {
            DEXTrades(
              where: {Trade: {Buy: {Currency: {SmartContract: {is: $token}}}}}
              limit: {count: $limit}
              orderBy: {descending: Block_Time}
              time: {since: "-24h"}
            ) {
              Block { Time }
              Trade {
                Buy { Amount Price Currency { Symbol } }
                Sell { Amount Price Currency { Symbol } }
                Dex { ProtocolName }
              }
              Transaction { Hash }
            }
          }
        }"""

        variables = {"network": network, "token": addr, "limit": 10}

        resp = await client.post(
            "https://graphql.bitquery.io/",
            json={"query": query, "variables": variables},
            headers={
                "Authorization": f"Bearer {settings.bitquery_api_key}",
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )

        if resp.status_code == 402:
            # Points exhausted — activate circuit breaker
            BITQUERY_POINTS_EXHAUSTED = True
            return

        if resp.status_code != 200:
            return

        data = resp.json()
        if "errors" in data:
            return

        trades = data.get("data", {}).get("EVM", {}).get("DEXTrades", [])

        result = {
            "recent_trades": len(trades),
            "trades": [
                {
                    "time": t.get("Block", {}).get("Time", ""),
                    "dex": t.get("Trade", {}).get("Dex", {}).get("ProtocolName", ""),
                    "buy_symbol": t.get("Trade", {}).get("Buy", {}).get("Currency", {}).get("Symbol", ""),
                    "buy_amount": t.get("Trade", {}).get("Buy", {}).get("Amount", 0),
                    "sell_symbol": t.get("Trade", {}).get("Sell", {}).get("Currency", {}).get("Symbol", ""),
                    "sell_amount": t.get("Trade", {}).get("Sell", {}).get("Amount", 0),
                    "hash": t.get("Transaction", {}).get("Hash", "")[:20],
                }
                for t in trades[:5]
            ],
        }

        # Cache the result
        _bitquery_cache[addr] = (result, now)
        token["bitquery"] = result

        # Signal: active DEX trading
        if len(trades) > 5:
            token.setdefault("bitquery_signal", {})
            token["bitquery_signal"]["active_trading"] = True

    except Exception:
        pass  # Silently fail


# ═══════════════════════════════════════════════════════════════════════════════
# DERIVED (no API, pure computation)
# ═══════════════════════════════════════════════════════════════════════════════


async def _enrich_derived(enriched: list) -> int:
    """Layer 6: Computed security + momentum signals (no API needed)."""
    count = 0
    for token in enriched:
        derived = {}
        scanner = {}

        dex = token.get("dex", {}) or {}
        fdv = dex.get("fdv") or token.get("fdv")
        liq = dex.get("liquidity_usd") or token.get("liquidity_usd")

        # FDV vs liquidity ratio
        liq_ratio = None
        if fdv and liq and fdv > 0:
            liq_ratio = liq / fdv
            derived["liq_fdv_ratio"] = round(liq_ratio, 4)
            derived["liq_risk"] = (
                "critical"
                if liq_ratio < 0.02
                else ("high" if liq_ratio < 0.05 else "moderate" if liq_ratio < 0.10 else "healthy")
            )

        # Authority risk (GMGN only - GoPlus removed)
        gmgn = token.get("gmgn", {}) or {}

        has_mint_authority = bool(gmgn.get("has_mint_authority"))
        derived["has_mint_authority"] = has_mint_authority

        # Microstructure (adapted from memecoin.watch + dexscreener-analysis-bot)
        txns_m5 = dex.get("txns_m5", {}) or {}
        txns_h1 = dex.get("txns_h1", {}) or {}

        buys_m5 = int(txns_m5.get("buys", 0) or 0)
        sells_m5 = int(txns_m5.get("sells", 0) or 0)
        buys_h1 = int(txns_h1.get("buys", 0) or 0)
        sells_h1 = int(txns_h1.get("sells", 0) or 0)

        total_m5 = buys_m5 + sells_m5
        total_h1 = buys_h1 + sells_h1

        volume_m5 = float(dex.get("volume_m5", 0) or 0)
        volume_h1 = float(dex.get("volume_h1", 0) or 0)
        price_change_m5 = float(dex.get("price_change_m5", 0) or 0)
        price_change_h1 = float(dex.get("price_change_h1", 0) or 0)
        price_change_h6 = float(dex.get("price_change_h6", 0) or 0)

        buy_ratio_m5 = (buys_m5 / total_m5) if total_m5 > 0 else 0.0
        buy_ratio_h1 = (buys_h1 / total_h1) if total_h1 > 0 else 0.0
        heat_m5_h1 = (volume_m5 / volume_h1 * 100.0) if volume_h1 > 0 else 0.0
        avg_trade_size_m5 = (volume_m5 / total_m5) if total_m5 > 0 else 0.0

        derived["buy_ratio_m5"] = round(buy_ratio_m5, 4)
        derived["buy_ratio_h1"] = round(buy_ratio_h1, 4)
        derived["heat_m5_h1"] = round(heat_m5_h1, 2)
        derived["avg_trade_size_m5_usd"] = round(avg_trade_size_m5, 2)

        # Early-warning score (0..10): buy pressure + rising prints + healthy heat
        early_score = 0
        if buy_ratio_m5 >= 0.70:
            early_score += 3
        if buy_ratio_h1 >= 0.65:
            early_score += 2
        if price_change_m5 >= 0.2:
            early_score += 2
        if 8 <= heat_m5_h1 <= 60:
            early_score += 2
        if total_m5 >= 8:
            early_score += 1
        early_score = max(0, min(10, early_score))

        # Pump heat status (adapted to m5/h1 windows)
        if heat_m5_h1 >= 60:
            heat_status = "peak"
        elif heat_m5_h1 >= 40:
            heat_status = "hot"
        elif heat_m5_h1 >= 20:
            heat_status = "building"
        else:
            heat_status = "cold"

        # Big-swap / whale cluster proxy using USD avg ticket size
        whale_cluster = total_m5 >= 3 and avg_trade_size_m5 >= 2000 and buy_ratio_m5 >= 0.70

        scanner["early_warning_score"] = early_score
        scanner["heat_status"] = heat_status
        scanner["whale_cluster"] = whale_cluster

        # Suspicious / rug heuristics
        suspicious_low_liq_vs_vol = bool((liq or 0) > 0 and volume_h1 > 0 and (liq / max(volume_h1, 1)) < 0.08)
        suspicious_thin_txns = bool(total_h1 < 10 and volume_h1 > 10000)
        suspicious_one_sided = bool(total_h1 >= 10 and (buy_ratio_h1 > 0.97 or buy_ratio_h1 < 0.03))
        suspicious_extreme_move = bool(abs(price_change_h1) > 1000)

        possible_rug = bool(
            has_mint_authority
            or suspicious_low_liq_vs_vol
            or suspicious_thin_txns
            or suspicious_one_sided
            or suspicious_extreme_move
            or (liq_ratio is not None and liq_ratio < 0.015)
            or derived.get("tax_risk") == "high"
        )
        massive_dump = bool(price_change_h1 <= -60 or price_change_h6 <= -70)

        derived["possible_rug"] = possible_rug
        derived["massive_dump"] = massive_dump

        # Flatten compatibility keys consumed by score_token()
        token["derived_possible_rug"] = possible_rug
        token["derived_massive_dump"] = massive_dump
        token["derived_has_mint_authority"] = has_mint_authority

        if derived:
            token["derived"] = derived
            token["scanner"] = scanner
            count += 1

    return count


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════


async def run_async_enrichment(
    candidates: list[dict],
    max_enrich: int = 300,
) -> tuple[list[dict], list[LayerResult]]:
    """
    Run all enrichment layers asynchronously.

    Phase 1: Dexscreener (REQUIRED, blocks until complete)
    Phase 2: All optional layers in parallel via asyncio.gather()

    Returns (enriched_tokens, layer_results).
    """
    # All enricher symbols are defined in this module — no import needed.
    import sys

    sys.path.insert(0, str(settings.hermes_home / "scripts"))
    # These will be imported lazily to avoid circular imports

    results: list[LayerResult] = []
    total_candidates = len(candidates)

    async with _make_client() as client:
        # ═══ Phase 1: Dexscreener (REQUIRED) ═══
        log.info("phase1_dexscreener", tokens=len(candidates))
        start = time.time()
        dex = AsyncDexscreenerEnricher(concurrency=5)
        enriched, dex_count = await dex.enrich_batch(candidates[:max_enrich], client)
        elapsed = time.time() - start

        if not enriched:
            log.error("dexscreener_empty", candidates=len(candidates))
            return [], [LayerResult("Dexscreener", False, 0, total_candidates, elapsed, "no results")]

        results.append(LayerResult("Dexscreener", True, dex_count, total_candidates, elapsed))
        log.info(
            "phase1_complete",
            enriched=dex_count,
            total=total_candidates,
            elapsed=round(elapsed, 1),
        )

        # ═══ Rate limit recovery: wait if 429s detected ═══
        # If we enriched <10% of candidates, likely rate limited - wait before continuing
        if dex_count < max(5, total_candidates * 0.1):
            log.warning("rate_limit_detected", enriched=dex_count, total=total_candidates, waiting=60)
            await asyncio.sleep(60)  # Wait 60s for API to recover

        # ═══ Phase 2: All optional layers in parallel ═══
        log.info("phase2_parallel", layers=11, tokens=len(enriched))

        # RugCheck
        rugcheck_enricher = AsyncHttpEnricher("RugCheck", concurrency=3, delay=0.3)

        # Etherscan
        etherscan_enricher = AsyncHttpEnricher("Etherscan", concurrency=2, delay=0.25)

        # De.Fi
        defi_enricher = AsyncHttpEnricher("De.Fi", concurrency=2, delay=1.0)

        # Zerion
        zerion_enricher = AsyncHttpEnricher("Zerion", concurrency=2, delay=1.0)

        # Solscan
        solscan_enricher = AsyncHttpEnricher("Solscan", concurrency=2, delay=0.5)

        # Helius
        helius_enricher = AsyncHttpEnricher("Helius", concurrency=2, delay=0.5)

        # Birdeye
        birdeye_enricher = AsyncHttpEnricher("Birdeye", concurrency=2, delay=0.5)

        # Goldrush (Covalent)
        goldrush_enricher = AsyncHttpEnricher("Goldrush", concurrency=2, delay=1.0)

        # Goldsky Edge RPC
        goldsky_enricher = AsyncHttpEnricher("Goldsky", concurrency=3, delay=0.5)

        # Bitquery (point-optimized, aggressive caching)
        bitquery_enricher = AsyncHttpEnricher("Bitquery", concurrency=1, delay=2.0)

        # Define all parallel tasks
        async def run_rugcheck():
            start = time.time()
            try:
                ok, total = await rugcheck_enricher.enrich_batch(_enrich_rugcheck, enriched, client)
                return LayerResult("RugCheck", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("RugCheck", False, 0, len(enriched), time.time() - start, str(e))

        async def run_etherscan():
            start = time.time()
            try:
                ok, total = await etherscan_enricher.enrich_batch(_enrich_etherscan, enriched, client)
                return LayerResult("Etherscan", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Etherscan", False, 0, len(enriched), time.time() - start, str(e))

        async def run_defi():
            start = time.time()
            try:
                ok, total = await defi_enricher.enrich_batch(_enrich_defi, enriched, client)
                return LayerResult("De.Fi", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("De.Fi", False, 0, len(enriched), time.time() - start, str(e))

        async def run_zerion():
            start = time.time()
            try:
                ok, total = await zerion_enricher.enrich_batch(_enrich_zerion, enriched, client)
                return LayerResult("Zerion", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Zerion", False, 0, len(enriched), time.time() - start, str(e))

        async def run_solscan():
            start = time.time()
            try:
                ok, total = await solscan_enricher.enrich_batch(_enrich_solscan, enriched, client)
                return LayerResult("Solscan", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Solscan", False, 0, len(enriched), time.time() - start, str(e))

        async def run_helius():
            start = time.time()
            try:
                ok, total = await helius_enricher.enrich_batch(_enrich_helius, enriched, client)
                return LayerResult("Helius", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Helius", False, 0, len(enriched), time.time() - start, str(e))

        async def run_birdeye():
            start = time.time()
            try:
                ok, total = await birdeye_enricher.enrich_batch(_enrich_birdeye, enriched, client)
                return LayerResult("Birdeye", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Birdeye", False, 0, len(enriched), time.time() - start, str(e))

        async def run_goldrush():
            start = time.time()
            try:
                ok, total = await goldrush_enricher.enrich_batch(_enrich_goldrush, enriched, client)
                return LayerResult("Goldrush", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Goldrush", False, 0, len(enriched), time.time() - start, str(e))

        async def run_goldsky():
            start = time.time()
            try:
                ok, total = await goldsky_enricher.enrich_batch(_enrich_goldsky, enriched, client)
                return LayerResult("Goldsky", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Goldsky", False, 0, len(enriched), time.time() - start, str(e))

        async def run_bitquery():
            start = time.time()
            try:
                ok, total = await bitquery_enricher.enrich_batch(_enrich_bitquery, enriched, client)
                return LayerResult("Bitquery", True, ok, total, time.time() - start)
            except Exception as e:
                return LayerResult("Bitquery", False, 0, len(enriched), time.time() - start, str(e))

        async def run_derived():
            start = time.time()
            try:
                count = await _enrich_derived(enriched)
                return LayerResult("Derived", True, count, len(enriched), time.time() - start)
            except Exception as e:
                return LayerResult("Derived", False, 0, len(enriched), time.time() - start, str(e))

        # Surf, GMGN — CLI-based, run in threads
        async def run_surf():
            try:
                from token_enricher import SurfEnricher

                return await _run_cli_enricher("Surf", lambda t: SurfEnricher().enrich_batch(t), enriched)
            except ImportError:
                return LayerResult("Surf", False, 0, len(enriched), 0, "import failed")

        async def run_gmgn():
            try:
                from token_enricher import GMGNEnricher

                return await _run_cli_enricher("GMGN", lambda t: GMGNEnricher().enrich_batch(t), enriched)
            except ImportError:
                return LayerResult("GMGN", False, 0, len(enriched), 0, "import failed")

        async def run_social():
            try:
                from scripts.token_enricher import SocialSignalEnricher

                return await _run_cli_enricher("Social", lambda t: SocialSignalEnricher().enrich_batch(t), enriched)
            except ImportError:
                return LayerResult("Social", False, 0, len(enriched), 0, "import failed")

        # ═══ RUN ALL IN PARALLEL with overall timeout guard ═══
        # Phase 2 has 14 parallel layers (HTTP + CLI). If any layer hangs (e.g. Bitquery
        # or GMGN CLI), asyncio.wait_for forces a clean return instead of hanging until
        # the daemon's SIGALRM (2400s) fires and kills the whole process with exit 124.
        PHASE2_TIMEOUT = 600  # 10 minutes — all layers combined should finish in <5 min

        phase2_start = time.time()
        try:
            layer_results = await asyncio.wait_for(
                asyncio.gather(
                    run_rugcheck(),
                    run_etherscan(),
                    run_defi(),
                    run_zerion(),
                    run_solscan(),
                    run_helius(),
                    run_birdeye(),
                    run_goldrush(),
                    run_goldsky(),
                    run_bitquery(),
                    run_derived(),
                    run_surf(),
                    run_gmgn(),
                    run_social(),
                    return_exceptions=True,
                ),
                timeout=PHASE2_TIMEOUT,
            )
        except asyncio.TimeoutError:
            log.warning(
                "phase2_timeout",
                timeout=PHASE2_TIMEOUT,
                elapsed=int(time.time() - phase2_start),
            )
            layer_results = []

        phase2_elapsed = time.time() - phase2_start
        for r in layer_results:
            if isinstance(r, LayerResult):
                results.append(r)
                status = "OK" if r.success else "SKIP"
                log.info(
                    "layer_result",
                    layer=r.name,
                    status=status,
                    enriched=r.enriched_count,
                    elapsed=round(r.elapsed, 1),
                )
            elif isinstance(r, Exception):
                log.error("layer_exception", error=str(r))
                results.append(LayerResult("Unknown", False, 0, 0, 0, str(r)))

        log.info(
            "phase2_complete",
            elapsed=round(phase2_elapsed, 1),
            layers_ok=sum(1 for r in results if r.success),
            layers_total=len(results),
        )

        # Record pipeline metrics
        total_elapsed = sum(r.elapsed for r in results)
        metrics.pipeline_runs.inc()
        metrics.pipeline_duration.observe(total_elapsed)
        metrics.tokens_enriched.set(len(enriched))
        metrics.last_run_timestamp.set(time.time())

        return enriched, results


def run_async_enrichment_sync(
    candidates: list[dict],
    max_enrich: int = 300,
) -> tuple[list[dict], list[LayerResult]]:
    """Synchronous wrapper for run_async_enrichment()."""
    return asyncio.run(run_async_enrichment(candidates, max_enrich))
