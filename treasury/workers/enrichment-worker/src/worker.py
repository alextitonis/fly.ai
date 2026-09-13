"""Enrichment Worker — scores tokens using hermes-token-screener algorithms.

Imports hermes_screener.entry_guards (MIT, TerexitariusStomp) for self-improving
score adjustment based on trade history. Uses regime classification + loss
streak cooldowns to adapt scoring over time.

Flow:
1. Read unenriched tokens from D1
2. Fetch market data from DexScreener API
3. Score with heuristic (or hermes enhanced_score_token if available)
4. Apply hermes entry_guards with trade history from D1 (self-improving)
5. Write scores back to D1
"""
from __future__ import annotations

import json
import time

import numpy as np
from workers import WorkerEntrypoint, Response, fetch

# OSS imports (MIT, TerexitariusStomp/hermes-token-screener)
from hermes_screener.entry_guards import evaluate_entry_guard
from hermes_screener.regime import classify_regime

# Import hermes scoring as-is (MIT, TerexitariusStomp/hermes-token-screener)
try:
    from hermes_screener.enhanced_scoring import enhanced_score_token
except ImportError:
    enhanced_score_token = None

DEXSCREENER_API = "https://api.dexscreener.com/latest/dex"


class Default(WorkerEntrypoint):
    """Enrichment Worker — runs on Cron Trigger."""

    async def scheduled(self, event):
        await self._enrich_tokens()

    async def fetch(self, request):
        await self._enrich_tokens()
        return Response.json({"status": "enrichment_complete"})

    async def _enrich_tokens(self):
        """Fetch unenriched tokens from D1, score them, write back."""
        cursor = await self.env.DB.prepare(
            "SELECT address, symbol, launchpad FROM tokens "
            "WHERE (enriched_at IS NULL OR enriched_at < ?) AND ignored = 0 "
            "ORDER BY first_seen DESC LIMIT 20"
        ).bind(int(time.time()) - 3600).all()

        # Get trade history for hermes entry_guards (self-improving)
        history = await self._get_trade_history()

        for token in cursor.results or []:
            try:
                score_data = await self._score_token(token, history)
                if score_data:
                    await self._save_score(token["address"], score_data)
            except Exception as e:
                print(f"Enrichment failed for {token['address']}: {e}")

    async def _get_trade_history(self) -> list:
        """Query D1 for recent trade outcomes, formatted for hermes entry_guards."""
        rows = await self.env.DB.prepare(
            "SELECT t.symbol, t.launchpad as source, "
            "CASE WHEN pt.pnl_percent > 0 THEN 'win' ELSE 'loss' END as result "
            "FROM paper_trades pt JOIN tokens t ON pt.token_address = t.address "
            "WHERE pt.action = 'SELL' ORDER BY pt.created_at DESC LIMIT 50"
        ).all()
        return [{"symbol": r["symbol"], "source": r["source"] or "", "result": r["result"]}
                for r in (rows.results or [])]

    async def _score_token(self, token: dict, history: list) -> dict | None:
        """Fetch market data from DexScreener and score with hermes + entry guards."""
        resp = await fetch(f"{DEXSCREENER_API}/tokens/{token['address']}")
        if not resp.ok:
            return None

        data = await resp.json()
        pairs = data.get("pairs") or []
        if not pairs:
            return None

        pair = pairs[0]

        token_data = {
            "address": token["address"],
            "symbol": token.get("symbol") or pair.get("baseToken", {}).get("symbol", ""),
            "name": pair.get("baseToken", {}).get("name", ""),
            "chain": "robinhood",
            "price_usd": float(pair.get("priceUsd", 0) or 0),
            "liquidity_usd": float(pair.get("liquidity", {}).get("usd", 0) or 0),
            "volume_24h": float(pair.get("volume", {}).get("h24", 0) or 0),
            "volume_1h": float(pair.get("volume", {}).get("h1", 0) or 0),
            "txns_24h_buys": int(pair.get("txns", {}).get("h24", {}).get("buys", 0) or 0),
            "txns_24h_sells": int(pair.get("txns", {}).get("h24", {}).get("sells", 0) or 0),
            "price_change_24h": float(pair.get("priceChange", {}).get("h24", 0) or 0),
            "price_change_1h": float(pair.get("priceChange", {}).get("h1", 0) or 0),
            "fdv": float(pair.get("fdv", 0) or 0),
            "pair_created_at": pair.get("pairCreatedAt", 0),
            "dex_id": pair.get("dexId", ""),
            "pair_address": pair.get("pairAddress", ""),
        }

        # Score with hermes (if available) or fallback heuristic
        if enhanced_score_token:
            try:
                result = enhanced_score_token(token_data)
                raw_score = result.final_score
                reasons = {
                    "positives": result.positives,
                    "negatives": result.negatives,
                    "regime": result.regime if hasattr(result, "regime") else None,
                }
            except Exception as e:
                print(f"Hermes scoring failed: {e}")
                score_result = self._fallback_score(token_data)
                raw_score = score_result["score"]
                reasons = json.loads(score_result["reasons"])
        else:
            score_result = self._fallback_score(token_data)
            raw_score = score_result["score"]
            reasons = json.loads(score_result["reasons"])

        # Apply hermes entry_guards with trade history (self-improving)
        regime = classify_regime(token_data)
        guard_result = evaluate_entry_guard(
            token={"regime": regime.regime, "security_verdict": "medium_risk",
                   "source": token.get("launchpad", "")},
            history=history,
            base_threshold=0.74,
        )
        if not guard_result.allowed:
            return {
                "score": 0,
                "reasons": json.dumps({"blocked": True, "guard_reasons": guard_result.reasons,
                                        "raw_score": raw_score}),
                "enrichment": json.dumps(token_data),
            }
        adjusted_score = raw_score * guard_result.guard_multiplier
        reasons["guard_multiplier"] = guard_result.guard_multiplier
        reasons["regime"] = regime.regime

        return {
            "score": max(0, min(100, adjusted_score)),
            "reasons": json.dumps(reasons),
            "enrichment": json.dumps(token_data),
        }

    def _fallback_score(self, token_data: dict) -> dict:
        """Simple heuristic score when hermes is not available."""
        score = 0
        reasons = []

        liquidity = token_data.get("liquidity_usd", 0)
        if liquidity > 50000:
            score += 30
            reasons.append("High liquidity")
        elif liquidity > 10000:
            score += 15
            reasons.append("Decent liquidity")
        elif liquidity < 1000:
            score -= 20
            reasons.append("Low liquidity")

        volume = token_data.get("volume_24h", 0)
        if volume > 100000:
            score += 20
            reasons.append("High volume")
        elif volume > 10000:
            score += 10
            reasons.append("Moderate volume")

        price_change = token_data.get("price_change_24h", 0)
        if price_change > 50:
            score -= 10
            reasons.append("Pumped too hard")
        elif price_change > 0:
            score += 5
            reasons.append("Positive momentum")

        buys = token_data.get("txns_24h_buys", 0)
        sells = token_data.get("txns_24h_sells", 0)
        if buys + sells > 0:
            buy_ratio = buys / (buys + sells)
            if buy_ratio > 0.6:
                score += 15
                reasons.append("Buy pressure")
            elif buy_ratio < 0.4:
                score -= 10
                reasons.append("Sell pressure")

        return {
            "score": max(0, min(100, score)),
            "reasons": json.dumps({"positives": reasons, "negatives": []}),
            "enrichment": json.dumps(token_data),
        }

    async def _save_score(self, address: str, score_data: dict):
        """Save enrichment data and score to D1."""
        now = int(time.time())
        await self.env.DB.prepare(
            "UPDATE tokens SET score = ?, score_reasons = ?, enriched_at = ? WHERE address = ?"
        ).bind(score_data["score"], score_data["reasons"], now, address).run()
        await self.env.DB.prepare(
            "INSERT OR REPLACE INTO enrichment (chain, address, data, enriched_at) VALUES (?, ?, ?, ?)"
        ).bind("robinhood", address, score_data["enrichment"], str(now)).run()
