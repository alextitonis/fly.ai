from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TransferPlan:
    source_exchange: str
    destination_exchange: str
    amount_usd: float


def rebalance_transfer_plan(
    balances: dict[str, float],
    targets: dict[str, float],
    min_transfer_usd: float = 50.0,
) -> list[TransferPlan]:
    deficits: list[tuple[str, float]] = []
    surpluses: list[tuple[str, float]] = []

    for ex, target in targets.items():
        bal = balances.get(ex, 0.0)
        delta = bal - target
        if delta > 0:
            surpluses.append((ex, delta))
        elif delta < 0:
            deficits.append((ex, -delta))

    plans: list[TransferPlan] = []
    i = j = 0
    while i < len(surpluses) and j < len(deficits):
        src, s_amt = surpluses[i]
        dst, d_amt = deficits[j]
        xfer = min(s_amt, d_amt)

        if xfer >= min_transfer_usd:
            plans.append(TransferPlan(src, dst, float(xfer)))

        s_amt -= xfer
        d_amt -= xfer
        surpluses[i] = (src, s_amt)
        deficits[j] = (dst, d_amt)

        if s_amt <= 1e-9:
            i += 1
        if d_amt <= 1e-9:
            j += 1

    return plans
