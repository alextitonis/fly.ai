from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TokenSpec:
    symbol: str
    chain: str
    address: str
    decimals: int


class PortfolioRegistry:
    """Tracks every token the bot trades and should keep non-idle."""

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def load(self) -> list[TokenSpec]:
        if not self.path.exists():
            return []
        raw = json.loads(self.path.read_text())
        out: list[TokenSpec] = []
        for item in raw:
            out.append(
                TokenSpec(
                    symbol=str(item["symbol"]).upper(),
                    chain=str(item["chain"]).lower(),
                    address=str(item["address"]),
                    decimals=int(item.get("decimals", 18 if item["chain"] == "base" else 9)),
                )
            )
        return out

    def save(self, tokens: list[TokenSpec]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = [
            {
                "symbol": t.symbol,
                "chain": t.chain,
                "address": t.address,
                "decimals": t.decimals,
            }
            for t in tokens
        ]
        self.path.write_text(json.dumps(payload, indent=2))

    def upsert(self, token: TokenSpec) -> None:
        cur = self.load()
        key = (token.chain, token.address.lower())
        filtered = [t for t in cur if (t.chain, t.address.lower()) != key]
        filtered.append(token)
        self.save(sorted(filtered, key=lambda x: (x.chain, x.symbol, x.address.lower())))

    def remove(self, chain: str, address: str) -> None:
        cur = self.load()
        key = (chain.lower(), address.lower())
        filtered = [t for t in cur if (t.chain, t.address.lower()) != key]
        self.save(filtered)
