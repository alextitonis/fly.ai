#!/usr/bin/env python3
"""
Hermes Remote Worker - Free VPS enrichment & proxy service.

Offloads all internet-dependent operations from the local hermes daemon
to a free cloud VPS (Oracle Cloud Free Tier, Render, Fly.io, Railway).

Endpoints:
  POST /enrich          - Token enrichment pipeline (Dexscreener, RugCheck, etc.)
  POST /proxy           - Generic HTTP proxy for API calls (avoids local IP rate limits)
  GET  /health          - Health check
  GET  /                - Service info

Environment:
  PORT                  - Server port (default: 10000)
  GMGN_API_KEY          - GMGN API key (optional)
  ETHERSCAN_API_KEY     - Etherscan API key (optional)
"""

import asyncio
import os
import time
import logging
from typing import Any
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

PORT = int(os.environ.get("PORT", "10000"))
GMGN_API_KEY = os.environ.get("GMGN_API_KEY", "")
ETHERSCAN_API_KEY = os.environ.get("ETHERSCAN_API_KEY", "")RUGCHECK_SHIELD_KEY = os.environ.get("RUGCHECK_SHIELD_KEY", "")

GMGN_DELAY = 1.2  # seconds between GMGN calls
GMGN_CONCURRENCY = 3
REQUEST_TIMEOUT = 25.0

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("worker")

# Chain name → Dexscreener chain ID
CHAIN_MAP = {
    "ethereum": "ethereum", "eth": "ethereum",
    "bsc": "bsc", "binance": "bsc",
    "polygon": "polygon", "matic": "polygon",
    "arbitrum": "arbitrum", "arb": "arbitrum",
    "optimism": "optimism", "op": "optimism",
    "base": "base",
    "avalanche": "avalanche", "avax": "avalanche",
    "fantom": "fantom", "ftm": "fantom",
    "solana": "solana", "sol": "solana",
    "blast": "blast",
    "zksync": "zksync",
    "linea": "linea",
    "scroll": "scroll",
    "mantle": "mantle",
}

# Chain name → GoPlus chain ID
GOPLUS_CHAIN_IDS = {
    "ethereum": "1", "bsc": "56", "polygon": "137",
    "arbitrum": "42161", "optimism": "10", "base": "8453",
    "avalanche": "43114", "fantom": "250", "blast": "81457",
    "zksync": "324", "linea": "59144", "scroll": "534352",
    "mantle": "5000",
}

# Chain name → Etherscan-like base URL
ETHERSCAN_URLS = {
    "ethereum": "https://api.etherscan.io/api",
    "bsc": "https://api.bscscan.com/api",
    "polygon": "https://api.polygonscan.com/api",
    "arbitrum": "https://api.arbiscan.io/api",
    "optimism": "https://api-optimistic.etherscan.io/api",
    "base": "https://api.basescan.org/api",
    "avalanche": "https://api.snowtrace.io/api",
    "fantom": "https://api.ftmscan.com/api",
}

# ─────────────────────────────────────────────────────────────────────────────
# HTTP client (shared, persistent)
# ─────────────────────────────────────────────────────────────────────────────

_client: httpx.AsyncClient | None = None
_gmgn_semaphore: asyncio.Semaphore | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client, _gmgn_semaphore
    _client = httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
    )
    _gmgn_semaphore = asyncio.Semaphore(GMGN_CONCURRENCY)
    log.info(f"Worker started on port {PORT}")
    yield
    await _client.aclose()


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Hermes Remote Worker", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class TokenInput(BaseModel):
    chain: str = "ethereum"
    address: str
    symbol: str | None = None


class EnrichRequest(BaseModel):
    tokens: list[TokenInput]
    layers: list[str] = Field(
        default_factory=lambda: ["dexscreener", "rugcheck", "etherscan"]
    )


class ProxyRequest(BaseModel):
    url: str
    method: str = "GET"
    headers: dict[str, str] = Field(default_factory=dict)
    body: dict[str, Any] | None = None
    timeout: float = 20.0


# ─────────────────────────────────────────────────────────────────────────────
# Enrichment: Dexscreener
# ─────────────────────────────────────────────────────────────────────────────

async def _enrich_dexscreener(tokens: list[dict]) -> dict[str, dict]:
    """Bulk Dexscreener lookup (30 addresses per call)."""
    results = {}
    # Group by chain
    by_chain: dict[str, list[str]] = {}
    for t in tokens:
        chain = CHAIN_MAP.get(t["chain"].lower(), t["chain"].lower())
        by_chain.setdefault(chain, []).append(t["address"])

    for ds_chain, addrs in by_chain.items():
        for i in range(0, len(addrs), 30):
            batch = addrs[i:i+30]
            joined = ",".join(batch)
            try:
                resp = await _client.get(f"https://api.dexscreener.com/tokens/v1/{ds_chain}/{joined}")
                if resp.status_code == 200:
                    pairs = resp.json()
                    for pair in pairs:
                        addr = pair.get("baseToken", {}).get("address", "").lower()
                        if addr:
                            results[addr] = {
                                "symbol": pair.get("baseToken", {}).get("symbol"),
                                "name": pair.get("baseToken", {}).get("name"),
                                "price_usd": pair.get("priceUsd"),
                                "fdv": pair.get("fdv"),
                                "volume_h24": pair.get("volume", {}).get("h24"),
                                "volume_h6": pair.get("volume", {}).get("h6"),
                                "price_change_h1": pair.get("priceChange", {}).get("h1"),
                                "price_change_h6": pair.get("priceChange", {}).get("h6"),
                                "price_change_h24": pair.get("priceChange", {}).get("h24"),
                                "liquidity_usd": pair.get("liquidity", {}).get("usd"),
                                "pair_address": pair.get("pairAddress"),
                                "dex": pair.get("dexId"),
                                "chainId": pair.get("chainId"),
                                "url": pair.get("url"),
                            }
                elif resp.status_code == 429:
                    log.warning("Dexscreener rate limited, waiting 3s")
                    await asyncio.sleep(3)
            except Exception as e:
                log.warning(f"Dexscreener error for {ds_chain}: {e}")
            await asyncio.sleep(0.3)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Enrichment: GoPlus (EVM security)
# ─────────────────────────────────────────────────────────────────────────────

async def _enrich_goplus(tokens: list[dict]) -> dict[str, dict]:
    """GoPlus token security for EVM chains."""
    results = {}
    by_chain: dict[str, list[str]] = {}
    for t in tokens:
        chain = t["chain"].lower()
        goplus_id = GOPLUS_CHAIN_IDS.get(chain)
        if goplus_id and chain != "solana":
            by_chain.setdefault(goplus_id, []).append(t["address"])

    for chain_id, addrs in by_chain.items():
        for addr in addrs:
            try:
                resp = await _client.get(f"https://api.gopluslabs.io/api/v2/token_security/{chain_id}?contract_addresses={addr}")
                if resp.status_code == 200:
                    data = resp.json()
                    result_list = data.get("result", {})
                    if isinstance(result_list, dict):
                        token_data = result_list.get(addr.lower(), {})
                    else:
                        token_data = {}
                    if token_data:
                        results[addr.lower()] = {
                            "goplus_is_honeypot": token_data.get("is_honeypot") == "1",
                            "goplus_can_sell": token_data.get("cannot_sell_all") != "1",
                            "goplus_buy_tax": float(token_data.get("buy_tax", "0") or "0"),
                            "goplus_sell_tax": float(token_data.get("sell_tax", "0") or "0"),
                            "goplus_is_mintable": token_data.get("is_mintable") == "1",
                            "goplus_owner_can_change_balance": token_data.get("owner_change_balance") == "1",
                            "goplus_holders": int(token_data.get("holder_count", "0") or "0"),
                        }
            except Exception as e:
                log.debug(f"GoPlus error for {addr}: {e}")
            await asyncio.sleep(0.2)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Enrichment: RugCheck (Solana)
# ─────────────────────────────────────────────────────────────────────────────

async def _enrich_rugcheck(tokens: list[dict]) -> dict[str, dict]:
    """RugCheck for Solana tokens."""
    results = {}
    solana_tokens = [t for t in tokens if t["chain"].lower() in ("solana", "sol")]
    for t in solana_tokens:
        addr = t["address"]
        try:
            headers = {}
            if RUGCHECK_SHIELD_KEY:
                headers["Authorization"] = f"Bearer {RUGCHECK_SHIELD_KEY}"
            resp = await _client.get(f"https://api.rugcheck.xyz/v1/tokens/{addr}/report", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                risks = data.get("risks", [])
                risk_names = [r.get("name", "") for r in risks if r.get("level") == "danger"]
                results[addr.lower()] = {
                    "rugcheck_score": data.get("score", 0),
                    "rugcheck_risks": risk_names,
                    "rugcheck_is_rugged": data.get("rugged", False),
                    "rugcheck_total_holders": data.get("totalHolders", 0),
                    "rugcheck_markets": data.get("total Markets", 0),
                }
        except Exception as e:
            log.debug(f"RugCheck error for {addr}: {e}")
        await asyncio.sleep(0.5)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Enrichment: Etherscan (contract verification)
# ─────────────────────────────────────────────────────────────────────────────

async def _enrich_etherscan(tokens: list[dict]) -> dict[str, dict]:
    """Etherscan contract verification status."""
    results = {}
    for t in tokens:
        chain = t["chain"].lower()
        base_url = ETHERSCAN_URLS.get(chain)
        if not base_url:
            continue
        addr = t["address"]
        try:
            url = f"{base_url}?module=contract&action=getsourcecode&address={addr}&apikey={ETHERSCAN_API_KEY}"
            resp = await _client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                contract_list = data.get("result", [])
                if contract_list and isinstance(contract_list, list):
                    c = contract_list[0]
                    results[addr.lower()] = {
                        "etherscan_verified": bool(c.get("SourceCode")),
                        "etherscan_contract_name": c.get("ContractName", ""),
                        "etherscan_compiler": c.get("CompilerVersion", ""),
                        "etherscan_proxy": c.get("Proxy") == "1",
                    }
        except Exception as e:
            log.debug(f"Etherscan error for {addr}: {e}")
        await asyncio.sleep(0.2)
    return results



# ─────────────────────────────────────────────────────────────────────────────
# GMGN API (via direct HTTP, no CLI dependency on VPS)
# ─────────────────────────────────────────────────────────────────────────────

async def _gmgn_call(endpoint: str, chain: str, address: str) -> dict:
    """Call GMGN API directly (no CLI needed on VPS)."""
    if not GMGN_API_KEY:
        return {}
    async with _gmgn_semaphore:
        await asyncio.sleep(GMGN_DELAY)
        try:
            host = os.environ.get("GMGN_HOST", "https://gmgn.ai")
            url = f"{host}/api/v1/{endpoint}?chain={chain}&address={address}"
            resp = await _client.get(url, headers={"Authorization": f"Bearer {GMGN_API_KEY}"})
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            log.debug(f"GMGN error: {e}")
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Derived scoring
# ─────────────────────────────────────────────────────────────────────────────

def _compute_scores(token: dict, enrichment: dict) -> dict:
    """Compute derived scores from enrichment data."""
    score = 0.0
    positives = []
    negatives = []

    # Volume scoring
    vol = enrichment.get("volume_h24") or 0
    if vol > 1_000_000:
        score += 20
        positives.append(f"high_vol_${vol/1e6:.1f}M")
    elif vol > 100_000:
        score += 10
        positives.append(f"med_vol_${vol/1e3:.0f}K")
    elif vol > 0:
        score += 3
        negatives.append(f"low_vol_${vol/1e3:.1f}K")

    # FDV scoring
    fdv = enrichment.get("fdv") or 0
    if 1_000_000 < fdv < 100_000_000:
        score += 15
        positives.append(f"fdv_${fdv/1e6:.1f}M")
    elif fdv > 100_000_000:
        score += 5

    # Security scoring (GoPlus)
    if enrichment.get("goplus_is_honeypot"):
        score *= 0.1
        negatives.append("HONEYPOT")
    if enrichment.get("goplus_buy_tax", 0) > 0.05:
        score *= 0.5
        negatives.append(f"buy_tax_{enrichment['goplus_buy_tax']*100:.0f}%")
    if enrichment.get("goplus_sell_tax", 0) > 0.05:
        score *= 0.5
        negatives.append(f"sell_tax_{enrichment['goplus_sell_tax']*100:.0f}%")

    # RugCheck scoring
    if enrichment.get("rugcheck_is_rugged"):
        score *= 0.05
        negatives.append("RUGGED")
    rug_score = enrichment.get("rugcheck_score", 0) or 0
    if rug_score > 0:
        if rug_score < 500:
            score += 10
            positives.append("rugcheck_safe")
        elif rug_score > 3000:
            score *= 0.3
            negatives.append("rugcheck_warn")

    # Contract verification
    if enrichment.get("etherscan_verified"):
        score += 5
        positives.append("verified_contract")

    # Social (from Telegram data if present)
    social = enrichment.get("social_score", 0) or 0
    if social > 50:
        score += 5
        positives.append("social_buzz")

    return {
        "score": round(max(0, min(100, score)), 1),
        "positives": positives,
        "negatives": negatives,
    }


# ─────────────────────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "hermes-remote-worker",
        "version": "1.0.0",
        "endpoints": ["/enrich", "/proxy", "/health"],
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "uptime": time.time() - _start_time,
    }


@app.post("/enrich")
async def enrich(req: EnrichRequest):
    """
    Enrich tokens with market/security data.

    Layers: dexscreener, goplus, rugcheck, etherscan
    """
    t0 = time.time()
    tokens = [t.model_dump() for t in req.tokens]

    # Normalize chain names
    for t in tokens:
        t["chain"] = CHAIN_MAP.get(t["chain"].lower(), t["chain"].lower())
        t["address"] = t["address"].lower()

    results = {t["address"]: {"chain": t["chain"], "address": t["address"]} for t in tokens}
    layer_status = {}

    # Run enrichment layers
    enrichment_map = {
        "dexscreener": _enrich_dexscreener,
        "rugcheck": _enrich_rugcheck,
        "etherscan": _enrich_etherscan,
    }

    for layer_name in req.layers:
        fn = enrichment_map.get(layer_name)
        if not fn:
            continue
        layer_t0 = time.time()
        try:
            data = await fn(tokens)
            enriched_count = 0
            for addr, enrichment in data.items():
                if addr in results:
                    results[addr].update(enrichment)
                    enriched_count += 1
            layer_status[layer_name] = {
                "success": True,
                "enriched": enriched_count,
                "total": len(tokens),
                "elapsed": round(time.time() - layer_t0, 2),
            }
        except Exception as e:
            layer_status[layer_name] = {
                "success": False,
                "error": str(e),
                "elapsed": round(time.time() - layer_t0, 2),
            }

    # Compute derived scores
    for addr, data in results.items():
        scores = _compute_scores({"address": addr}, data)
        data.update(scores)

    return {
        "tokens": list(results.values()),
        "layer_status": layer_status,
        "total_elapsed": round(time.time() - t0, 2),
    }


@app.post("/proxy")
async def proxy(req: ProxyRequest):
    """
    Generic HTTP proxy for API calls.

    Forwards the request to the target URL and returns the response.
    Useful for avoiding local IP rate limits.
    """
    try:
        resp = await _client.request(
            method=req.method,
            url=req.url,
            headers=req.headers,
            json=req.body,
            timeout=req.timeout,
        )
        return {
            "status_code": resp.status_code,
            "headers": dict(resp.headers),
            "body": resp.text,
        }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Upstream timeout")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Start
# ─────────────────────────────────────────────────────────────────────────────

_start_time = time.time()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)