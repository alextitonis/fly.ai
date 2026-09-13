from __future__ import annotations

from dataclasses import dataclass, field
from math import inf


class NoDeploymentPathError(RuntimeError):
    """Raised when deployable balances cannot be routed into fee-generating liquidity."""


@dataclass(frozen=True)
class PoolOpportunity:
    id: str
    protocol: str
    chain: str
    token_a: str
    token_b: str | None
    apr: float
    supports_single_sided: bool = False
    max_allocation_usd: float = inf


@dataclass(frozen=True)
class LiquidityAction:
    action_type: str
    protocol: str
    chain: str
    details: dict


@dataclass(frozen=True)
class DeploymentPlan:
    actions: list[LiquidityAction]
    projected_idle: dict[str, float]
    utilization_pct: float


@dataclass
class LiquidityManager:
    gas_reserve: dict[str, float] = field(default_factory=dict)
    dust_threshold_usd: float = 1.0
    max_slippage_bps: int = 50

    def build_plan(
        self,
        balances: dict[str, float],
        prices_usd: dict[str, float],
        opportunities: list[PoolOpportunity],
    ) -> DeploymentPlan:
        self._validate_inputs(balances, prices_usd)

        available = {t: max(0.0, float(v) - float(self.gas_reserve.get(t, 0.0))) for t, v in balances.items()}
        deployable_before_usd = self._sum_usd(available, prices_usd)
        actions: list[LiquidityAction] = []

        for opp in sorted(opportunities, key=lambda x: x.apr, reverse=True):
            if opp.token_b is None:
                actions.extend(self._allocate_single_token_vault(available, prices_usd, opp))
            elif opp.supports_single_sided:
                actions.extend(self._allocate_single_sided_pair(available, prices_usd, opp))
            else:
                actions.extend(self._allocate_dual_sided_pair(available, prices_usd, opp))

        # Last-chance sweep: any remaining token must go to a single-sided opportunity for that token.
        for token, amount in list(available.items()):
            if amount <= 0:
                continue
            token_idle_usd = amount * prices_usd[token]
            if token_idle_usd <= self.dust_threshold_usd:
                continue
            sweep_target = self._best_single_sided_for_token(token, opportunities)
            if sweep_target is not None:
                allocation = min(
                    amount,
                    max(0.0, sweep_target.max_allocation_usd / prices_usd[token]),
                )
                if allocation <= 0:
                    raise NoDeploymentPathError(
                        f"Single-sided route exists but at capacity for token {token}; idle={amount:.8f}"
                    )

                available[token] -= allocation
                actions.append(
                    LiquidityAction(
                        action_type="deploy_single_sided",
                        protocol=sweep_target.protocol,
                        chain=sweep_target.chain,
                        details={
                            "opportunity_id": sweep_target.id,
                            "deposit_token": token,
                            "deposit_amount": allocation,
                        },
                    )
                )
                continue

            dual_target = self._best_dual_for_token(token, opportunities)
            if dual_target is not None:
                actions.extend(self._force_dual_sweep(token, available, prices_usd, dual_target))
                # If still idle and no single-sided route exists, treat as non-deployable residual.
                token_idle_usd_after = available.get(token, 0.0) * prices_usd[token]
                if (
                    token_idle_usd_after > self.dust_threshold_usd
                    and self._best_single_sided_for_token(token, opportunities) is None
                ):
                    raise NoDeploymentPathError(
                        f"No fee-generating route for token {token}; idle={available.get(token, 0.0):.8f} ({token_idle_usd_after:.2f} USD)"
                    )
                continue

            raise NoDeploymentPathError(
                f"No fee-generating route for token {token}; idle={amount:.8f} ({token_idle_usd:.2f} USD)"
            )

        idle_after_usd = self._sum_usd(available, prices_usd)
        utilization_pct = (
            100.0 if deployable_before_usd == 0 else (1.0 - idle_after_usd / deployable_before_usd) * 100.0
        )
        return DeploymentPlan(
            actions=actions,
            projected_idle=available,
            utilization_pct=max(0.0, min(100.0, utilization_pct)),
        )

    def _validate_inputs(self, balances: dict[str, float], prices_usd: dict[str, float]) -> None:
        for token, amount in balances.items():
            if amount < 0:
                raise ValueError(f"Negative balance not allowed: {token}={amount}")
            if amount > 0 and (token not in prices_usd or prices_usd[token] <= 0):
                raise ValueError(f"Missing/invalid USD price for token {token}")

    def _sum_usd(self, amounts: dict[str, float], prices_usd: dict[str, float]) -> float:
        return sum(max(0.0, amt) * prices_usd.get(token, 0.0) for token, amt in amounts.items())

    def _best_single_sided_for_token(
        self,
        token: str,
        opportunities: list[PoolOpportunity],
    ) -> PoolOpportunity | None:
        candidates = [
            x for x in opportunities if x.supports_single_sided and (x.token_a == token or x.token_b == token)
        ]
        if not candidates:
            return None
        return sorted(candidates, key=lambda x: x.apr, reverse=True)[0]

    def _best_dual_for_token(
        self,
        token: str,
        opportunities: list[PoolOpportunity],
    ) -> PoolOpportunity | None:
        candidates = [x for x in opportunities if x.token_b is not None and (x.token_a == token or x.token_b == token)]
        if not candidates:
            return None
        return sorted(candidates, key=lambda x: x.apr, reverse=True)[0]

    def _force_dual_sweep(
        self,
        token: str,
        available: dict[str, float],
        prices_usd: dict[str, float],
        opp: PoolOpportunity,
    ) -> list[LiquidityAction]:
        assert opp.token_b is not None
        a = opp.token_a
        b = opp.token_b
        if token not in {a, b}:
            return []
        if a not in prices_usd or b not in prices_usd:
            return []

        other = b if token == a else a
        token_usd = available[token] * prices_usd[token]
        other_usd = available.get(other, 0.0) * prices_usd[other]

        # Force-swap enough of token into the pair counterpart so remaining capital can be LPed.
        if token_usd <= self.dust_threshold_usd:
            return []

        swap_usd = min(token_usd / 2.0, max(0.0, token_usd - other_usd))
        actions: list[LiquidityAction] = []
        if swap_usd > self.dust_threshold_usd:
            from_amount = swap_usd / prices_usd[token]
            received_usd = swap_usd * (1 - self.max_slippage_bps / 10_000)
            to_amount = received_usd / prices_usd[other]

            available[token] -= from_amount
            available[other] = available.get(other, 0.0) + to_amount
            actions.append(
                LiquidityAction(
                    action_type="swap_for_pair_balance",
                    protocol="internal_router",
                    chain=opp.chain,
                    details={
                        "from_token": token,
                        "to_token": other,
                        "from_amount": from_amount,
                        "min_to_amount": to_amount,
                        "slippage_bps": self.max_slippage_bps,
                        "opportunity_id": opp.id,
                    },
                )
            )

        # Now deploy both sides.
        deploy_side_usd = min(available[token] * prices_usd[token], available.get(other, 0.0) * prices_usd[other])
        deploy_side_usd = min(deploy_side_usd, opp.max_allocation_usd / 2.0)
        if deploy_side_usd <= self.dust_threshold_usd:
            return actions

        amount_token = deploy_side_usd / prices_usd[token]
        amount_other = deploy_side_usd / prices_usd[other]
        available[token] -= amount_token
        available[other] -= amount_other

        if token == a:
            amount_a, amount_b = amount_token, amount_other
        else:
            amount_a, amount_b = amount_other, amount_token

        actions.append(
            LiquidityAction(
                action_type="deploy_dual_sided",
                protocol=opp.protocol,
                chain=opp.chain,
                details={
                    "opportunity_id": opp.id,
                    "token_a": a,
                    "token_b": b,
                    "amount_a": amount_a,
                    "amount_b": amount_b,
                },
            )
        )
        return actions

    def _allocate_single_token_vault(
        self,
        available: dict[str, float],
        prices_usd: dict[str, float],
        opp: PoolOpportunity,
    ) -> list[LiquidityAction]:
        token = opp.token_a
        if available.get(token, 0.0) <= 0:
            return []

        max_token = max(0.0, opp.max_allocation_usd / prices_usd[token])
        allocation = min(available[token], max_token)
        if allocation <= 0:
            return []

        available[token] -= allocation
        return [
            LiquidityAction(
                action_type="deploy_single_asset",
                protocol=opp.protocol,
                chain=opp.chain,
                details={
                    "opportunity_id": opp.id,
                    "deposit_token": token,
                    "deposit_amount": allocation,
                },
            )
        ]

    def _allocate_single_sided_pair(
        self,
        available: dict[str, float],
        prices_usd: dict[str, float],
        opp: PoolOpportunity,
    ) -> list[LiquidityAction]:
        assert opp.token_b is not None
        a = opp.token_a
        b = opp.token_b
        a_usd = available.get(a, 0.0) * prices_usd[a]
        b_usd = available.get(b, 0.0) * prices_usd[b]

        if a_usd <= 0 and b_usd <= 0:
            return []

        chosen = a if a_usd >= b_usd else b
        chosen_amt = available.get(chosen, 0.0)
        max_token = max(0.0, opp.max_allocation_usd / prices_usd[chosen])
        allocation = min(chosen_amt, max_token)
        if allocation <= 0:
            return []

        available[chosen] -= allocation
        return [
            LiquidityAction(
                action_type="deploy_single_sided",
                protocol=opp.protocol,
                chain=opp.chain,
                details={
                    "opportunity_id": opp.id,
                    "deposit_token": chosen,
                    "deposit_amount": allocation,
                    "pair_token": b if chosen == a else a,
                },
            )
        ]

    def _allocate_dual_sided_pair(
        self,
        available: dict[str, float],
        prices_usd: dict[str, float],
        opp: PoolOpportunity,
    ) -> list[LiquidityAction]:
        assert opp.token_b is not None
        a = opp.token_a
        b = opp.token_b

        if a not in prices_usd or b not in prices_usd:
            return []

        usd_a = available.get(a, 0.0) * prices_usd[a]
        usd_b = available.get(b, 0.0) * prices_usd[b]
        total_usd = usd_a + usd_b
        if total_usd <= self.dust_threshold_usd:
            return []

        cap_usd = min(total_usd, opp.max_allocation_usd)
        target_side_usd = cap_usd / 2.0
        actions: list[LiquidityAction] = []

        # Create a balancing swap if one leg is underweight.
        if usd_a < target_side_usd and usd_b > target_side_usd:
            swap_usd = target_side_usd - usd_a
            from_token, to_token = b, a
        elif usd_b < target_side_usd and usd_a > target_side_usd:
            swap_usd = target_side_usd - usd_b
            from_token, to_token = a, b
        else:
            swap_usd = 0.0
            from_token = to_token = ""

        if swap_usd > self.dust_threshold_usd:
            from_amount = swap_usd / prices_usd[from_token]
            received_usd = swap_usd * (1 - self.max_slippage_bps / 10_000)
            to_amount = received_usd / prices_usd[to_token]

            available[from_token] -= from_amount
            available[to_token] += to_amount
            actions.append(
                LiquidityAction(
                    action_type="swap_for_pair_balance",
                    protocol="internal_router",
                    chain=opp.chain,
                    details={
                        "from_token": from_token,
                        "to_token": to_token,
                        "from_amount": from_amount,
                        "min_to_amount": to_amount,
                        "slippage_bps": self.max_slippage_bps,
                        "opportunity_id": opp.id,
                    },
                )
            )

        deploy_a = max(0.0, available.get(a, 0.0))
        deploy_b = max(0.0, available.get(b, 0.0))
        deploy_side_usd = min(deploy_a * prices_usd[a], deploy_b * prices_usd[b], target_side_usd)

        if deploy_side_usd <= self.dust_threshold_usd:
            return actions

        amount_a = deploy_side_usd / prices_usd[a]
        amount_b = deploy_side_usd / prices_usd[b]
        available[a] -= amount_a
        available[b] -= amount_b

        actions.append(
            LiquidityAction(
                action_type="deploy_dual_sided",
                protocol=opp.protocol,
                chain=opp.chain,
                details={
                    "opportunity_id": opp.id,
                    "token_a": a,
                    "token_b": b,
                    "amount_a": amount_a,
                    "amount_b": amount_b,
                },
            )
        )
        return actions


class ArrakisAdapter:
    """Payload builder aligned with Arrakis V2 `Rebalance` struct keys."""

    @staticmethod
    def build_rebalance_payload(
        burns: list[dict],
        mints: list[dict],
        swap: dict,
        min_burn0: int,
        min_burn1: int,
        min_deposit0: int,
        min_deposit1: int,
    ) -> dict:
        return {
            "burns": burns,
            "mints": mints,
            "swap": swap,
            "minBurn0": min_burn0,
            "minBurn1": min_burn1,
            "minDeposit0": min_deposit0,
            "minDeposit1": min_deposit1,
        }


class GammaAdapter:
    """Payload builder aligned with Gamma IMultiPositionManager.RebalanceParams."""

    @staticmethod
    def build_rebalance_params(
        strategy: str,
        center: int,
        t_left: int,
        t_right: int,
        limit_width: int,
        weight0: int,
        weight1: int,
        use_carpet: bool,
    ) -> dict:
        return {
            "strategy": strategy,
            "center": center,
            "tLeft": t_left,
            "tRight": t_right,
            "limitWidth": limit_width,
            "weight0": weight0,
            "weight1": weight1,
            "useCarpet": use_carpet,
        }


class KaminoAdapter:
    """Instruction recipe builder using kliquidity-sdk method names."""

    @staticmethod
    def build_single_sided_deposit(
        strategy_address: str,
        deposit_token_side: str,
        amount_decimal: float,
        slippage_bps: int = 50,
    ) -> dict:
        method = "singleSidedDepositTokenA" if deposit_token_side.upper() == "A" else "singleSidedDepositTokenB"
        return {
            "strategyAddress": strategy_address,
            "method": method,
            "amount": amount_decimal,
            "slippageBps": slippage_bps,
        }
