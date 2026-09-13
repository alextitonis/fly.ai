"""
Experience Collector
====================
Hooks into every pipeline stage to capture (state, action, outcome) tuples.
Call these functions from existing scripts without modifying their core logic.

Usage in token_enricher.py:
    from hermes_screener.training import ExperienceCollector
    collector = ExperienceCollector()
    collector.record_token_scored(token_data, score, scoring_breakdown)

Usage in ai_trading_brain.py:
    collector.record_trade_decision(token_data, decision, confidence, reason)

Usage in trade_monitor.py:
    collector.record_trade_outcome(address, entry_price, exit_price, hold_hours,
                                   outcome_type, pnl_pct)
"""

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field
from enum import Enum


class PipelineStage(str, Enum):
    DISCOVERY = "discovery"  # token_discovery.py
    ENRICHMENT = "enrichment"  # token_enricher.py
    SCORING = "scoring"  # enhanced_scoring / cross_scoring
    WALLET = "wallet"  # wallet_tracker.py
    DECISION = "decision"  # ai_trading_brain.py
    MONITOR = "monitor"  # trade_monitor.py
    EXECUTION = "execution"  # contract_executor.py
    OUTCOME = "outcome"  # final trade result (pnl realised)
    ARBITRAGE = "arbitrage"  # arbitrage_scanner.py


@dataclass
class Experience:
    """A single (state, action, reward) experience tuple from the pipeline."""

    stage: str  # PipelineStage value
    token_address: str
    chain: str
    symbol: str

    # Observed state at time of action
    state: dict = field(default_factory=dict)

    # Action taken (decision, score, signal, etc.)
    action: dict = field(default_factory=dict)

    # Reward signal (None until outcome is known; filled by RewardCalculator)
    reward: float | None = None
    reward_components: dict = field(default_factory=dict)

    # Metadata
    timestamp: float = field(default_factory=time.time)
    episode_id: str = ""  # groups experiences for the same token/trade
    source_script: str = ""  # which script generated this

    def to_dict(self) -> dict:
        d = asdict(self)
        d["state"] = json.dumps(d["state"])
        d["action"] = json.dumps(d["action"])
        d["reward_components"] = json.dumps(d["reward_components"])
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Experience":
        d = dict(d)
        d["state"] = json.loads(d.get("state") or "{}")
        d["action"] = json.loads(d.get("action") or "{}")
        d["reward_components"] = json.loads(d.get("reward_components") or "{}")
        return cls(**d)


def _episode_id(address: str, chain: str) -> str:
    raw = f"{chain}:{address}:{int(time.time() / 3600)}"  # hour-bucketed
    return hashlib.sha1(raw.encode()).hexdigest()[:12]


class ExperienceCollector:
    """
    Drop-in collector. Import and call from any pipeline script.
    All writes are non-blocking (fire-and-forget to buffer).
    """

    def __init__(self, buffer=None, source_script: str = ""):
        # Lazy import to avoid circular deps
        if buffer is None:
            from .experience_buffer import ExperienceBuffer

            buffer = ExperienceBuffer()
        self._buf = buffer
        self._source = source_script

    def _save(self, exp: Experience):
        try:
            self._buf.push(exp)
        except Exception:
            # Never crash the main pipeline
            import traceback

            traceback.print_exc()

    # ------------------------------------------------------------------
    # Stage 1: Discovery
    # ------------------------------------------------------------------
    def record_discovery(self, token: dict):
        """Call when a new token candidate is found."""
        addr = token.get("contract_address", "")
        chain = token.get("chain", "")
        exp = Experience(
            stage=PipelineStage.DISCOVERY,
            token_address=addr,
            chain=chain,
            symbol=token.get("symbol", ""),
            state={
                "address_source": token.get("address_source", ""),
                "mentions": token.get("mentions", 0),
                "channel_count": token.get("channel_count", 0),
            },
            action={"discovered": True},
            episode_id=_episode_id(addr, chain),
            source_script=self._source or "token_discovery",
        )
        self._save(exp)

    # ------------------------------------------------------------------
    # Stage 2: Enrichment
    # ------------------------------------------------------------------
    def record_token_enriched(self, token: dict):
        """Call after all enrichment layers complete for a token."""
        addr = token.get("contract_address", "")
        chain = token.get("chain", "")
        state = {
            k: token.get(k)
            for k in [
                "fdv",
                "volume_h24",
                "volume_h1",
                "price_change_h1",
                "price_change_h6",
                "price_change_h24",
                "age_hours",
                "gmgn_smart_wallets",
                "gmgn_dev_hold",
                "goplus_is_honeypot",
                "rugcheck_rugged",
                "rugcheck_score",
                "defi_scammed",
                "etherscan_verified",
                "cg_is_listed",
                "channel_count",
                "mentions",
            ]
            if k in token
        }
        exp = Experience(
            stage=PipelineStage.ENRICHMENT,
            token_address=addr,
            chain=chain,
            symbol=token.get("symbol", ""),
            state=state,
            action={
                "layers_completed": token.get("_layers_completed", []),
                "disqualified": token.get("score", 1) == 0,
            },
            episode_id=_episode_id(addr, chain),
            source_script=self._source or "token_enricher",
        )
        self._save(exp)

    # ------------------------------------------------------------------
    # Stage 3: Scoring
    # ------------------------------------------------------------------
    def record_token_scored(self, token: dict, score: float, breakdown: dict | None = None):
        """Call after scoring (enhanced_scoring or cross_scoring)."""
        addr = token.get("contract_address", "")
        chain = token.get("chain", "")
        exp = Experience(
            stage=PipelineStage.SCORING,
            token_address=addr,
            chain=chain,
            symbol=token.get("symbol", ""),
            state={
                "fdv": token.get("fdv"),
                "volume_h24": token.get("volume_h24"),
                "smart_wallet_count": token.get("smart_wallet_count", 0),
                "insider_count": token.get("insider_count", 0),
                "age_hours": token.get("age_hours"),
                "social_score": token.get("social_score"),
                "positives": token.get("positives", []),
                "negatives": token.get("negatives", []),
            },
            action={
                "score": score,
                "breakdown": breakdown or {},
            },
            episode_id=_episode_id(addr, chain),
            source_script=self._source or "scoring",
        )
        self._save(exp)

    # ------------------------------------------------------------------
    # Stage 4: Wallet
    # ------------------------------------------------------------------
    def record_wallet_scored(self, wallet: dict):
        """Call after wallet_tracker scores a wallet."""
        addr = wallet.get("address", "")
        exp = Experience(
            stage=PipelineStage.WALLET,
            token_address="",
            chain=wallet.get("chain", ""),
            symbol="",
            state={
                "realized_pnl": wallet.get("realized_pnl"),
                "win_rate": wallet.get("win_rate"),
                "total_trades": wallet.get("total_trades"),
                "avg_roi": wallet.get("avg_roi"),
                "insider_flag": wallet.get("insider_flag"),
                "rug_history_count": wallet.get("rug_history_count"),
                "wallet_tags": wallet.get("wallet_tags"),
            },
            action={
                "wallet_score": wallet.get("wallet_score"),
                "smart_money_tag": wallet.get("smart_money_tag"),
            },
            episode_id=addr[:12],
            source_script=self._source or "wallet_tracker",
        )
        self._save(exp)

    # ------------------------------------------------------------------
    # Stage 5: AI Trading Decision
    # ------------------------------------------------------------------
    def record_trade_decision(
        self,
        token: dict,
        decision: str,
        confidence: float,
        position_pct: float,
        stop_loss_pct: float,
        take_profit_pct: float,
        reason: str,
    ):
        """Call when ai_trading_brain makes a buy/hold/sell decision."""
        addr = token.get("contract_address", token.get("address", ""))
        chain = token.get("chain", "")
        exp = Experience(
            stage=PipelineStage.DECISION,
            token_address=addr,
            chain=chain,
            symbol=token.get("symbol", ""),
            state={
                "score": token.get("score"),
                "fdv": token.get("fdv"),
                "volume_h24": token.get("volume_h24"),
                "smart_wallet_count": token.get("smart_wallet_count", 0),
                "price_change_h1": token.get("price_change_h1"),
                "age_hours": token.get("age_hours"),
                "positives": token.get("positives", []),
                "negatives": token.get("negatives", []),
                "existing_positions": token.get("_existing_positions", 0),
            },
            action={
                "decision": decision,
                "confidence": confidence,
                "position_pct": position_pct,
                "stop_loss_pct": stop_loss_pct,
                "take_profit_pct": take_profit_pct,
                "reason": reason,
            },
            episode_id=_episode_id(addr, chain),
            source_script=self._source or "ai_trading_brain",
        )
        self._save(exp)

    # ------------------------------------------------------------------
    # Stage 6: Monitor signals
    # ------------------------------------------------------------------
    def record_monitor_signal(
        self,
        address: str,
        chain: str,
        symbol: str,
        market_snapshot: dict,
        decay_severity: float,
        ai_action: str,
        ai_reason: str,
    ):
        """Call each time trade_monitor evaluates an open position."""
        exp = Experience(
            stage=PipelineStage.MONITOR,
            token_address=address,
            chain=chain,
            symbol=symbol,
            state={
                "market": market_snapshot,
                "decay_severity": decay_severity,
            },
            action={
                "ai_action": ai_action,
                "ai_reason": ai_reason,
            },
            episode_id=_episode_id(address, chain),
            source_script=self._source or "trade_monitor",
        )
        self._save(exp)

    # ------------------------------------------------------------------
    # Stage 7: Execution result
    # ------------------------------------------------------------------
    def record_execution(
        self,
        address: str,
        chain: str,
        symbol: str,
        action: str,
        tx_hash: str | None,
        success: bool,
        error: str = "",
    ):
        """Call after contract_executor attempts a swap."""
        exp = Experience(
            stage=PipelineStage.EXECUTION,
            token_address=address,
            chain=chain,
            symbol=symbol,
            state={},
            action={
                "action": action,
                "success": success,
                "tx_hash": tx_hash or "",
                "error": error,
            },
            episode_id=_episode_id(address, chain),
            source_script=self._source or "contract_executor",
        )
        self._save(exp)

    # ------------------------------------------------------------------
    # Stage 8: Trade outcome (most important - ground truth reward)
    # ------------------------------------------------------------------
    def record_trade_outcome(
        self,
        address: str,
        chain: str,
        symbol: str,
        entry_price: float,
        exit_price: float,
        hold_hours: float,
        outcome_type: str,
        pnl_pct: float,
        exit_reason: str = "",
    ):
        """
        Call when a position is closed (take-profit, stop-loss, rotation, manual).
        This is the ground-truth signal that drives reward calculation.

        outcome_type: "take_profit" | "stop_loss" | "rotation" | "manual" | "timeout"
        pnl_pct: signed percentage (e.g. +45.2 or -12.0)
        """
        from .reward_calculator import RewardCalculator

        calc = RewardCalculator()
        reward, components = calc.compute_outcome_reward(
            pnl_pct=pnl_pct,
            hold_hours=hold_hours,
            outcome_type=outcome_type,
        )
        exp = Experience(
            stage=PipelineStage.OUTCOME,
            token_address=address,
            chain=chain,
            symbol=symbol,
            state={
                "entry_price": entry_price,
                "exit_price": exit_price,
                "hold_hours": hold_hours,
            },
            action={
                "outcome_type": outcome_type,
                "exit_reason": exit_reason,
                "pnl_pct": pnl_pct,
            },
            reward=reward,
            reward_components=components,
            episode_id=_episode_id(address, chain),
            source_script=self._source or "trade_monitor",
        )
        self._save(exp)
        # Back-fill reward to all same-episode experiences
        self._buf.backfill_reward(
            episode_id=exp.episode_id,
            reward=reward,
            reward_components=components,
        )

    # ------------------------------------------------------------------
    # Stage 9: Arbitrage opportunity
    # ------------------------------------------------------------------
    def record_arb_opportunity(self, token_address: str, chain: str, symbol: str, opportunity: dict):
        """Call when arbitrage_scanner finds a profitable opportunity."""
        exp = Experience(
            stage=PipelineStage.ARBITRAGE,
            token_address=token_address,
            chain=chain,
            symbol=symbol,
            state={
                "buy_pool": opportunity.get("buy_pool", {}),
                "sell_pool": opportunity.get("sell_pool", {}),
                "gross_spread_pct": opportunity.get("gross_spread_pct"),
                "estimated_gas_usd": opportunity.get("estimated_gas_usd"),
            },
            action={
                "net_profit_pct": opportunity.get("net_profit_pct"),
                "is_profitable": opportunity.get("is_profitable"),
                "trade_amount_usd": opportunity.get("trade_amount_usd"),
            },
            episode_id=_episode_id(token_address, chain),
            source_script=self._source or "arbitrage_scanner",
        )
        self._save(exp)
