#!/usr/bin/env python3
"""
Hermes Remote Worker Client.

Import this in any local script to delegate API calls to the remote VPS worker.
Usage:
    from worker_client import remote_enrich, remote_proxy

    # Enrich tokens via remote worker
    result = await remote_enrich(tokens=[{"chain":"base","address":"0x..."}])

    # Proxy any API call through remote worker
    resp = await remote_proxy("https://api.dexscreener.com/tokens/v1/base/0x...")
"""

import os
import httpx

WORKER_URL = os.environ.get("HERMES_WORKER_URL", "http://localhost:10000")
REQUEST_TIMEOUT = 60.0


async def remote_enrich(
    tokens: list[dict],
    layers: list[str] | None = None,
    worker_url: str | None = None,
) -> dict:
    """
    Enrich tokens using the remote worker.

    Args:
        tokens: [{"chain": "base", "address": "0x..."}, ...]
        layers: ["dexscreener", "rugcheck", "etherscan"]
        worker_url: Override worker URL (default: HERMES_WORKER_URL env)

    Returns:
        {"tokens": [...], "layer_status": {...}, "total_elapsed": 1.23}
    """
    url = worker_url or WORKER_URL
    if not layers:
        layers = ["dexscreener", "rugcheck", "etherscan"]

    payload = {"tokens": tokens, "layers": layers}

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(f"{url}/enrich", json=payload)
        resp.raise_for_status()
        return resp.json()


async def remote_proxy(
    url: str,
    method: str = "GET",
    headers: dict | None = None,
    body: dict | None = None,
    worker_url: str | None = None,
) -> dict:
    """
    Proxy an API call through the remote worker.

    Args:
        url: Target URL to fetch
        method: HTTP method
        headers: Request headers
        body: JSON body
        worker_url: Override worker URL

    Returns:
        {"status_code": 200, "headers": {...}, "body": "..."}
    """
    wurl = worker_url or WORKER_URL
    payload = {
        "url": url,
        "method": method,
        "headers": headers or {},
        "body": body,
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(f"{wurl}/proxy", json=payload)
        resp.raise_for_status()
        return resp.json()


async def check_worker_health(worker_url: str | None = None) -> dict:
    """Check if the remote worker is healthy."""
    wurl = worker_url or WORKER_URL
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{wurl}/health")
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
