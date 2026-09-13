"""
Reward Calculator
=================
Converts raw pipeline outcomes into scalar rewards for RL/fine-tuning.

Reward philosophy:
  - Primary signal: realized PnL from closed trades
  - Secondary signals: decision quality (confidence calibration),
    hold time efficiency, risk-adjusted returns
  - Shaped rewards: intermediate signals for stages without direct PnL
    (discovery quality -> enrichment accuracy -> scoring precision)

All rewards are normalized to [-1.0, +1.0].
"""

import math


class RewardCalculator:

    # Reward bands for PnL
    BANDS = [
        # (min_pnl_pct, max_pnl_pct, reward)
        (200, float("inf"), 1.00),  # moonshot
        (100, 200, 0.85),
        (50, 100, 0.70),
        (25, 50, 0.50),
        (10, 25, 0.30),
        (5, 10, 0.15),
        (0, 5, 0.05),  # barely positive
        (-5, 0, -0.05),
        (-10, -5, -0.20),
        (-20, -10, -0.45),
        (-30, -20, -0.65),
        (float("-inf"), -30, -1.00),  # stop-loss blown / rug
    ]

    # Outcome type multipliers
    OUTCOME_MULT = {
        "take_profit": 1.0,  # clean exit
        "stop_loss": -0.1,  # penalty for hitting stop (bad risk mgmt)
        "rotation": 0.9,  # slightly discounted (opportunity cost)
        "manual": 0.8,
        "timeout": 0.7,  # held too long
    }

    # Hold time efficiency shaping (hours)
    # Ideal hold: 2-24h. Penalise < 0.5h (churn) or > 72h (stale)
    def hold_time_shaping(self, hold_hours: float) -> float:
        if hold_hours < 0.5:
            return -0.15
        if hold_hours < 2:
            return -0.05
        if hold_hours <= 24:
            return 0.0  # neutral
        if hold_hours <= 72:
            return -0.05
        return -0.15

    def _pnl_to_base_reward(self, pnl_pct: float) -> float:
        for lo, hi, r in self.BANDS:
            if lo <= pnl_pct < hi:
                return r
        return -1.0

    def compute_outcome_reward(
        self,
        pnl_pct: float,
        hold_hours: float,
        outcome_type: str,
    ) -> tuple[float, dict]:
        """
        Primary reward for a closed trade.
        Returns (total_reward, component_dict).
        """
        base = self._pnl_to_base_reward(pnl_pct)
        hold_adj = self.hold_time_shaping(hold_hours)
        outcome_mul = self.OUTCOME_MULT.get(outcome_type, 1.0)
        total = max(-1.0, min(1.0, (base + hold_adj) * outcome_mul))
        components = {
            "base_reward": round(base, 4),
            "hold_adj": round(hold_adj, 4),
            "outcome_mul": outcome_mul,
            "total": round(total, 4),
            "pnl_pct": pnl_pct,
            "hold_hours": hold_hours,
            "outcome_type": outcome_type,
        }
        return total, components

    def compute_decision_reward(
        self,
        decision: str,
        confidence: float,
        eventual_pnl_pct: float | None,
    ) -> tuple[float, dict]:
        """
        Calibration reward: was the AI confident in the right direction?
        Used to create training signal for the decision stage before
        the full outcome reward propagates back.
        """
        if eventual_pnl_pct is None:
            return 0.0, {"note": "no outcome yet"}

        correct_direction = (
            (decision == "buy" and eventual_pnl_pct > 0)
            or (decision == "sell" and eventual_pnl_pct < 0)
            or (decision == "hold" and abs(eventual_pnl_pct) < 5)
        )
        calibration = confidence / 100.0  # 0-1
        if correct_direction:
            reward = calibration * 0.5  # max 0.5 for a correct decision
        else:
            reward = -calibration * 0.5  # max -0.5 for wrong + overconfident
        components = {
            "decision": decision,
            "confidence": confidence,
            "eventual_pnl_pct": eventual_pnl_pct,
            "correct_direction": correct_direction,
            "calibration_reward": round(reward, 4),
        }
        return round(reward, 4), components

    def compute_scoring_reward(
        self,
        score_given: float,
        eventual_pnl_pct: float | None,
    ) -> tuple[float, dict]:
        """
        Did the score correctly predict token quality?
        High score + pumped = reward. High score + dumped = penalty.
        """
        if eventual_pnl_pct is None:
            return 0.0, {"note": "no outcome yet"}

        normalised_score = score_given / 100.0  # 0-1
        # Map pnl to directional signal: sigmoid centered at 0
        pnl_signal = math.tanh(eventual_pnl_pct / 50.0)  # -1 to +1

        # Reward = how aligned was the score with the actual outcome
        reward = normalised_score * pnl_signal * 0.5
        components = {
            "score_given": score_given,
            "eventual_pnl_pct": eventual_pnl_pct,
            "pnl_signal": round(pnl_signal, 4),
            "scoring_reward": round(reward, 4),
        }
        return round(reward, 4), components
