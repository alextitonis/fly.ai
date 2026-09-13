"""
Dataset Builder
===============
Converts experience buffer entries into instruction-tuning JSONL datasets.

Output format: standard chat/instruction format usable by TRL SFTTrainer.

Two dataset types generated:
  1. decision_dataset.jsonl  - token state -> trade decision (buy/hold/sell)
  2. scoring_dataset.jsonl   - token features -> quality score (regression as text)

Each sample is a (system_prompt, user_prompt, assistant_response) triple.
Samples are weighted by |reward| so high-impact experiences dominate training.

Negative samples (bad decisions, rugged tokens) are also included so the model
learns what NOT to do -- they get a corrective "ideal" response generated from
the reward signal.
"""

import json
import random
import time
from pathlib import Path

from .experience_buffer import ExperienceBuffer
from .experience_collector import PipelineStage

DEFAULT_OUT_DIR = Path.home() / ".hermes" / "data" / "training" / "datasets"


# -----------------------------------------------------------------------
# Prompt templates
# -----------------------------------------------------------------------

SYSTEM_DECISION = """You are an expert DeFi trading AI. You analyze token metrics
and smart money signals to make precise buy/hold/sell decisions.
Always respond with valid JSON only."""

SYSTEM_SCORING = """You are an expert DeFi token analyst. You score tokens
from 0-100 based on their fundamentals, social signals, and smart money data.
Always respond with valid JSON only."""

SYSTEM_MONITOR = """You are a DeFi position monitor. You watch open trades
for decay signals and decide whether to hold, sell, or rotate.
Always respond with valid JSON only."""


def _fmt_state_decision(state: dict, action: dict) -> str:
    """Format a token state into a readable user prompt for decision tasks."""
    parts = ["Analyze this token and decide whether to buy, hold, or sell.\n\nToken Metrics:"]
    mapping = {
        "score": ("Screener Score", "{:.1f}/100"),
        "fdv": ("FDV", "${:,.0f}"),
        "volume_h24": ("24h Volume", "${:,.0f}"),
        "volume_h1": ("1h Volume", "${:,.0f}"),
        "price_change_h1": ("1h Price Change", "{:+.1f}%"),
        "price_change_h6": ("6h Price Change", "{:+.1f}%"),
        "age_hours": ("Token Age", "{:.1f} hours"),
        "smart_wallet_count": ("Smart Wallets", "{} wallets"),
        "insider_count": ("Insider Count", "{}"),
        "social_score": ("Social Score", "{:.1f}"),
        "existing_positions": ("Open Positions", "{}"),
    }
    for key, (label, fmt) in mapping.items():
        val = state.get(key)
        if val is not None:
            try:
                parts.append(f"  {label}: {fmt.format(val)}")
            except Exception:
                parts.append(f"  {label}: {val}")

    positives = state.get("positives", [])
    negatives = state.get("negatives", [])
    if positives:
        parts.append(f"\nPositive Signals: {', '.join(positives[:5])}")
    if negatives:
        parts.append(f"Negative Signals: {', '.join(negatives[:5])}")

    parts.append(
        '\nRespond with JSON: {"decision": "buy"|"hold"|"sell", '
        '"confidence": 0-100, "position_pct": 0-5, '
        '"stop_loss_pct": 5-30, "take_profit_pct": 50-500, '
        '"reason": "brief explanation"}'
    )
    return "\n".join(parts)


def _ideal_decision_response(action: dict, reward: float) -> dict:
    """
    Generate the ideal response for a training sample.
    For positive rewards: reinforce the action taken.
    For negative rewards: correct toward the opposite/safer action.
    """
    decision = action.get("decision", "hold")
    confidence = action.get("confidence", 50)
    pos_pct = action.get("position_pct", 2)
    sl_pct = action.get("stop_loss_pct", 15)
    tp_pct = action.get("take_profit_pct", 100)
    reason = action.get("reason", "")

    if reward >= 0.1:
        # Positive outcome: reinforce the action but cap overconfidence
        ideal_confidence = min(95, int(confidence + reward * 20))
        return {
            "decision": decision,
            "confidence": ideal_confidence,
            "position_pct": round(pos_pct, 1),
            "stop_loss_pct": round(sl_pct, 1),
            "take_profit_pct": round(tp_pct, 1),
            "reason": reason,
        }
    elif reward <= -0.3:
        # Bad outcome: the ideal action would have been to not buy / exit earlier
        if decision == "buy":
            return {
                "decision": "hold",
                "confidence": 30,
                "position_pct": 0,
                "stop_loss_pct": sl_pct,
                "take_profit_pct": tp_pct,
                "reason": "Risk signals suggest passing on this token.",
            }
        else:
            return {
                "decision": "sell",
                "confidence": 80,
                "position_pct": 0,
                "stop_loss_pct": sl_pct,
                "take_profit_pct": tp_pct,
                "reason": "Exit immediately to preserve capital.",
            }
    else:
        # Neutral: return original action unchanged
        return {
            "decision": decision,
            "confidence": confidence,
            "position_pct": round(pos_pct, 1),
            "stop_loss_pct": round(sl_pct, 1),
            "take_profit_pct": round(tp_pct, 1),
            "reason": reason,
        }


def _fmt_state_scoring(state: dict) -> str:
    parts = ["Score this token from 0-100 based on its fundamentals.\n\nToken Data:"]
    for k, v in state.items():
        if v is not None and k not in ("positives", "negatives"):
            parts.append(f"  {k}: {v}")
    for key in ("positives", "negatives"):
        val = state.get(key)
        if val:
            parts.append(f"{key.capitalize()}: {', '.join(val[:5])}")
    parts.append('\nRespond with JSON: {"score": 0-100, "reasoning": "brief"}')
    return "\n".join(parts)


def _fmt_state_monitor(state: dict, action: dict) -> str:
    market = state.get("market", {})
    decay = state.get("decay_severity", 0)
    parts = [f"Monitor open position. Decay severity: {decay:.1f}/10\n\nMarket snapshot:"]
    for k, v in market.items():
        if v is not None:
            parts.append(f"  {k}: {v}")
    parts.append('\nRespond with JSON: {"action": "hold"|"sell"|"rotate", ' '"confidence": 0-100, "reason": "brief"}')
    return "\n".join(parts)


# -----------------------------------------------------------------------
# Builder
# -----------------------------------------------------------------------


class DatasetBuilder:

    def __init__(
        self,
        buffer: ExperienceBuffer | None = None,
        out_dir: Path = DEFAULT_OUT_DIR,
    ):
        self.buf = buffer or ExperienceBuffer()
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)

    def build_all(
        self,
        limit: int = 10_000,
        min_abs_reward: float = 0.05,
    ) -> dict:
        """
        Build all dataset files. Returns summary dict.
        """
        t0 = time.time()
        exps = self.buf.fetch_trainable(
            only_with_reward=True,
            exclude_trained=False,  # include; mark_trained called after train
        )

        # Filter by minimum signal strength
        exps = [e for e in exps if e.reward is not None and abs(e.reward) >= min_abs_reward]
        random.shuffle(exps)

        decision_samples = []
        scoring_samples = []
        monitor_samples = []
        used_ids = []

        for exp in exps:
            reward = exp.reward or 0.0

            if exp.stage == PipelineStage.DECISION:
                user_prompt = _fmt_state_decision(exp.state, exp.action)
                ideal_resp = _ideal_decision_response(exp.action, reward)
                decision_samples.append(
                    {
                        "messages": [
                            {"role": "system", "content": SYSTEM_DECISION},
                            {"role": "user", "content": user_prompt},
                            {"role": "assistant", "content": json.dumps(ideal_resp)},
                        ],
                        "reward": reward,
                        "episode_id": exp.episode_id,
                        "source": exp.source_script,
                    }
                )
                used_ids.append(exp.episode_id)  # track by episode

            elif exp.stage == PipelineStage.SCORING:
                score_given = exp.action.get("score") or (exp.action.get("breakdown") or {}).get("total", 50)
                # Ideal score adjusted by reward
                ideal_score = max(0, min(100, score_given + reward * 30))
                scoring_samples.append(
                    {
                        "messages": [
                            {"role": "system", "content": SYSTEM_SCORING},
                            {"role": "user", "content": _fmt_state_scoring(exp.state)},
                            {
                                "role": "assistant",
                                "content": json.dumps(
                                    {
                                        "score": round(ideal_score, 1),
                                        "reasoning": f"Adjusted from {score_given:.0f} based on outcome (reward={reward:.2f})",
                                    }
                                ),
                            },
                        ],
                        "reward": reward,
                        "episode_id": exp.episode_id,
                    }
                )

            elif exp.stage == PipelineStage.MONITOR:
                ideal_action = exp.action.get("ai_action", "hold")
                if reward < -0.3 and ideal_action == "hold":
                    ideal_action = "sell"  # correct the monitor
                monitor_samples.append(
                    {
                        "messages": [
                            {"role": "system", "content": SYSTEM_MONITOR},
                            {
                                "role": "user",
                                "content": _fmt_state_monitor(exp.state, exp.action),
                            },
                            {
                                "role": "assistant",
                                "content": json.dumps(
                                    {
                                        "action": ideal_action,
                                        "confidence": max(20, min(95, int(abs(reward) * 80))),
                                        "reason": exp.action.get("ai_reason", ""),
                                    }
                                ),
                            },
                        ],
                        "reward": reward,
                        "episode_id": exp.episode_id,
                    }
                )

        # Sort by |reward| descending so high-value samples come first
        for samples in (decision_samples, scoring_samples, monitor_samples):
            samples.sort(key=lambda x: abs(x["reward"]), reverse=True)

        # Write files
        counts = {}
        for name, samples in [
            ("decision_dataset", decision_samples[:limit]),
            ("scoring_dataset", scoring_samples[:limit]),
            ("monitor_dataset", monitor_samples[:limit]),
        ]:
            path = self.out_dir / f"{name}.jsonl"
            with open(path, "w") as f:
                for s in samples:
                    f.write(json.dumps(s) + "\n")
            counts[name] = len(samples)

        # Write combined dataset
        all_samples = decision_samples + scoring_samples + monitor_samples
        all_samples.sort(key=lambda x: abs(x["reward"]), reverse=True)
        combined_path = self.out_dir / "combined_dataset.jsonl"
        with open(combined_path, "w") as f:
            for s in all_samples[:limit]:
                f.write(json.dumps(s) + "\n")
        counts["combined"] = len(all_samples[:limit])

        elapsed = time.time() - t0
        summary = {
            "status": "ok",
            "elapsed_s": round(elapsed, 2),
            "counts": counts,
            "total_exps": len(exps),
            "out_dir": str(self.out_dir),
            "files": {
                "decision": str(self.out_dir / "decision_dataset.jsonl"),
                "scoring": str(self.out_dir / "scoring_dataset.jsonl"),
                "monitor": str(self.out_dir / "monitor_dataset.jsonl"),
                "combined": str(combined_path),
            },
        }
        return summary

    def split_train_eval(
        self,
        dataset_path: Path,
        eval_ratio: float = 0.1,
        seed: int = 42,
    ) -> tuple:
        """Split a JSONL file into train/eval. Returns (train_path, eval_path)."""
        random.seed(seed)
        samples = []
        with open(dataset_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    samples.append(line)
        random.shuffle(samples)
        split = max(1, int(len(samples) * (1 - eval_ratio)))
        train_path = Path(str(dataset_path).replace(".jsonl", "_train.jsonl"))
        eval_path = Path(str(dataset_path).replace(".jsonl", "_eval.jsonl"))
        with open(train_path, "w") as f:
            f.write("\n".join(samples[:split]) + "\n")
        with open(eval_path, "w") as f:
            f.write("\n".join(samples[split:]) + "\n")
        return train_path, eval_path
