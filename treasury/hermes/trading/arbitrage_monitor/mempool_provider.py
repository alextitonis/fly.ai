
"""MempoolProvider — WebSocket-based real-time transaction monitoring.

Subscribes to the txpool via eth_subscribe("newPendingTransactions").
Filters for DEX router selectors and forwards matching txs.

Requires a WebSocket RPC (local Geth/Erigon or archive node).
Usage:
    provider = MempoolProvider(chain="ethereum", rpc_url="ws://127.0.0.1:8546",
                               on_tx=handler)
    await provider.start()
"""

import asyncio, json, logging, re
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncIterator, Callable, Optional
from .calldata_decoder import enrich_swap_intent_from_tx, SwapIntent

logger = logging.getLogger(__name__)

# Known DEX router selectors (EIP-1971 function signature→bytes4)
DEX_ROUTER_SELECTORS = {
    # Uniswap V2
    "0x38ed1739", "0x18cbafe5", "0x8803dbee", "0x4a25d94a",
    "0x7ff36ab5", "0x4fb63a4d", "0xfb3bdb41", "0x5df0f9c1",
    # Uniswap V3
    "0x6f1eaf58", "0xc04a8e70", "0x8a8c523c", "0x09e83076",
    # SushiSwap
    "0x4a8c18cb",
}

DEX_ROUTER_ADDRESSES = {
    # Ethereum
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D".lower(): "Uniswap V2",
    "0xE592427A0AEce92De3Edee1F18E0157C05861564".lower(): "Uniswap V3",
    "0x1111111254EEB25477B68fb85Ed929f73A960582".lower(): "1inch",
    # Base
    "0x2626664c2603336E57B271c5C0B26F421741eD08".lower(): "Uniswap V3 Base",
    # Arbitrum
    "0x1c4D8A4b475122E00Efc6F99eE3a97cF76c56C16".lower(): "Uniswap V3 Arb",
    # Polygon
    "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff".lower(): "QuickSwap",
}

@dataclass
class MempoolTransaction:
    tx_hash:  str
    from_addr: str
    to_addr:   str
    data:      str   # hex calldata
    value:     int   # wei
    gas_price: Optional[int] = None
    timestamp: Optional[datetime] = None

    def selector(self) -> str:
        return self.data[:10] if self.data and len(self.data) >= 10 else ""

def detect_dex_router(tx: MempoolTransaction) -> Optional[str]:
    sig = tx.selector()
    if sig in DEX_ROUTER_SELECTORS:
        return f"selector:{sig}"
    if tx.to_addr:
        addr = tx.to_addr.lower()
        if addr in DEX_ROUTER_ADDRESSES:
            return DEX_ROUTER_ADDRESSES[addr]
    return None

class MempoolProvider:
    def __init__(
        self,
        chain: str,
        rpc_url: str,
        on_tx: Callable[[MempoolTransaction], None],
        batch_size: int = 10,
        debounce_ms: int = 600,
    ):
        self.chain = chain
        self.rpc_url = rpc_url
        self.on_tx = on_tx
        self.batch_size = batch_size
        self.debounce_ms = debounce_ms
        self._pending_hashes = {}
        self._pending_futs  = {}
        self._running = False
        self._task = None
        self._ws = None

    async def start(self):
        import websockets
        logger.info("[Mempool] Connect %s", self.rpc_url)
        self._ws = await websockets.connect(self.rpc_url)
        await self._ws.send(json.dumps({
            "jsonrpc":"2.0","id":1,"method":"eth_subscribe",
            "params":["newPendingTransactions"]
        }))
        sub_id = json.loads(await self._ws.recv())["result"]
        logger.info("[Mempool] Subscribed id=%s", sub_id)
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def _loop(self):
        debounce_task = None
        while self._running:
            try:
                raw = await asyncio.wait_for(self._ws.recv(), timeout=30)
                msg = json.loads(raw)
                if msg.get("method") != "eth_subscription":
                    continue
                hashes = msg["params"]["result"]
                if isinstance(hashes, str):
                    hashes = [hashes]
                for h in hashes:
                    self._pending_futs[h] = asyncio.create_task(
                        self._fetch_tx(h)
                    )
                if debounce_task is None or debounce_task.done():
                    debounce_task = asyncio.create_task(self._debounced_process())
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(e)
                await asyncio.sleep(5)
                await self.start()
                return

    async def _fetch_tx(self, tx_hash: str) -> Optional[MempoolTransaction]:
        import aiohttp
        payload = {
            "jsonrpc":"2.0","id":1,
            "method":"eth_getTransactionByHash",
            "params":[tx_hash],
        }
        http_url = self.rpc_url.replace("ws://","http://").replace("wss://","https://")
        async with aiohttp.ClientSession() as s:
            async with s.post(http_url, json=payload) as resp:
                data = await resp.json()
                if data.get("result"):
                    r = data["result"]
                    return MempoolTransaction(
                        tx_hash=tx_hash,
                        from_addr=r.get("from",""),
                        to_addr  =r.get("to",""),
                        data     =r.get("input","0x") or "0x",
                        value    =int(r.get("value","0x0"),16),
                        gas_price=int(r.get("gasPrice","0x0"),16) if r.get("gasPrice") else None,
                        timestamp=datetime.utcnow(),
                    )
        return None

    async def _debounced_process(self):
        await asyncio.sleep(self.debounce_ms / 1000.0)
        if not self._pending_futs:
            return
        results = await asyncio.gather(*self._pending_futs.values(), return_exceptions=True)
        dex_txs  = []
        swap_intents = []
        for tx, result in zip(self._pending_futs.keys(), results):
            if isinstance(result, Exception) or result is None:
                continue
            if detect_dex_router(result):
                dex_txs.append(result)
                # Decode calldata → structured swap intent
                intent = enrich_swap_intent_from_tx(
                    tx_hash=result.tx_hash,
                    tx_from=result.from_addr,
                    to_addr=result.to_addr,
                    calldata=result.data,
                    gas_price=result.gas_price,
                )
                if intent:
                    swap_intents.append(intent)
                    self.on_tx(intent)   # emit SwapIntent to daemon
        self._pending_futs.clear()
        logger.info("[Mempool] batch=%d  dex=%d  swaps=%d", len(results), len(dex_txs), len(swap_intents))

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
