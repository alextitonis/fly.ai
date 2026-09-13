from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt
from web3 import Web3


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
FIGURES = ROOT / "figures"

RPC_URL = "http://127.0.0.1:8545"
ONE = 10**18
BPS = 10_000


def load_artifact(contract_file: str, contract_name: str) -> dict:
    path = OUT / contract_file / f"{contract_name}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"Artifact not found: {path}\n"
            "Run `forge build` first."
        )

    with path.open() as f:
        return json.load(f)


def deploy(w3: Web3, artifact: dict, *constructor_args):
    acct = w3.eth.accounts[0]
    contract = w3.eth.contract(
        abi=artifact["abi"],
        bytecode=artifact["bytecode"]["object"],
    )

    tx_hash = contract.constructor(*constructor_args).transact({"from": acct})
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    return w3.eth.contract(
        address=receipt.contractAddress,
        abi=artifact["abi"],
    )


def transact(w3: Web3, contract_fn, sender: str):
    tx_hash = contract_fn.transact({"from": sender})
    return w3.eth.wait_for_transaction_receipt(tx_hash)


def rate_to_scaled(rate: str) -> int:
    return int(Decimal(rate) * ONE)


def to_float(x: int) -> float:
    return x / ONE


def main() -> None:
    FIGURES.mkdir(exist_ok=True)

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise ConnectionError(
            f"Cannot connect to {RPC_URL}. Start Anvil first with `anvil`."
        )

    acct = w3.eth.accounts[0]
    attacker = w3.eth.accounts[1]

    mock_sy_artifact = load_artifact("MockSY.sol", "MockSY")
    py_index_artifact = load_artifact("PyIndexHarness.sol", "PyIndexHarness")
    oracle_artifact = load_artifact("UnsafeOracleConsumer.sol", "UnsafeOracleConsumer")
    lending_artifact = load_artifact("MockLendingProtocol.sol", "MockLendingProtocol")

    sy = deploy(w3, mock_sy_artifact, ONE)
    py_index = deploy(w3, py_index_artifact, sy.address)
    oracle = deploy(w3, oracle_artifact, sy.address, py_index.address)

    # 80% LTV
    lending = deploy(w3, lending_artifact, oracle.address, 8_000)

    sy_collateral = 100 * ONE

    # Deposit once at the beginning so borrow-limit curves are defined at every step.
    # This is a hypothetical collateral valuation path, not a claim of a live exploit.
    transact(w3, lending.functions.depositCollateral(sy_collateral), attacker)

    # Multi-step path:
    # - first, SY backing accrues yield and pushes PY index upward;
    # - then, current SY exchangeRate declines while PY index remains floored.
    states = [
        ("initial", "1.00", True),
        ("yield +3%", "1.03", True),
        ("yield +6%", "1.06", True),
        ("yield +10%", "1.10", True),
        ("small drawdown", "1.08", False),
        ("back to 1.02", "1.02", False),
        ("mild impairment", "0.95", False),
        ("stress 0.85", "0.85", False),
        ("stress 0.75", "0.75", False),
        ("severe impairment", "0.60", False),
    ]

    rows: list[dict] = []

    for step, (state, rate, update_index) in enumerate(states):
        rate_scaled = rate_to_scaled(rate)

        transact(w3, sy.functions.setExchangeRate(rate_scaled), acct)

        if update_index:
            transact(w3, py_index.functions.updatePyIndex(), acct)

        sy_rate = sy.functions.exchangeRate().call()
        py_current = py_index.functions.pyIndexCurrent().call()
        py_stored = py_index.functions.pyIndexStored().call()
        stress_gap = py_index.functions.stressGap().call()

        recoverable_value = (sy_collateral * sy_rate) // ONE
        accounting_value = (sy_collateral * py_current) // ONE

        unsafe_value = oracle.functions.unsafeValueUsingPyIndex(sy_collateral).call()
        safe_value = oracle.functions.safeValueUsingCurrentExchangeRate(sy_collateral).call()
        overvaluation = oracle.functions.overvaluationAmount(sy_collateral).call()

        unsafe_borrow_limit = lending.functions.unsafeBorrowLimit(attacker).call()
        safe_borrow_limit = lending.functions.safeBorrowLimit(attacker).call()

        # If borrower borrows up to the unsafe limit, this is the portion not covered
        # by current recoverable collateral value.
        bad_debt_gap = max(unsafe_borrow_limit - recoverable_value, 0)

        rows.append(
            {
                "step": step,
                "state": state,
                "sy_exchange_rate": to_float(sy_rate),
                "py_index_current": to_float(py_current),
                "py_index_stored": to_float(py_stored),
                "stress_gap": to_float(stress_gap),
                "recoverable_value": to_float(recoverable_value),
                "accounting_value": to_float(accounting_value),
                "unsafe_oracle_value": to_float(unsafe_value),
                "safe_oracle_value": to_float(safe_value),
                "overvaluation": to_float(overvaluation),
                "unsafe_borrow_limit": to_float(unsafe_borrow_limit),
                "safe_borrow_limit": to_float(safe_borrow_limit),
                "bad_debt_gap": to_float(bad_debt_gap),
            }
        )

    df = pd.DataFrame(rows)
    print(df)

    csv_path = ROOT / "data" / "processed" / "py_index_impairment_simulation.csv"
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False)

    plot_index_paths(df)
    plot_value_divergence(df)
    plot_borrow_limits(df)

    print(f"\nSaved CSV: {csv_path}")
    print(f"Saved figures to: {FIGURES}")


def plot_index_paths(df: pd.DataFrame) -> None:
    plt.figure(figsize=(10, 5.5))
    plt.plot(df["step"], df["sy_exchange_rate"], marker="o", label="Current SY exchangeRate")
    plt.plot(df["step"], df["py_index_current"], marker="o", label="PY accounting index")
    plt.title("SY Exchange Rate vs PY Accounting Index")
    plt.ylabel("Index level")
    plt.xlabel("Scenario step")
    plt.xticks(df["step"], df["state"], rotation=25, ha="right")
    plt.legend()
    plt.tight_layout()
    plt.savefig(FIGURES / "py_index_vs_sy_exchange_rate.png", dpi=200)
    plt.close()


def plot_value_divergence(df: pd.DataFrame) -> None:
    plt.figure(figsize=(10, 5.5))
    plt.plot(df["step"], df["recoverable_value"], marker="o", label="Recoverable backing")
    plt.plot(df["step"], df["accounting_value"], marker="o", label="Accounting value")
    plt.title("Accounting Value vs Recoverable Backing")
    plt.ylabel("Value for 100 SY")
    plt.xlabel("Scenario step")
    plt.xticks(df["step"], df["state"], rotation=25, ha="right")
    plt.legend()
    plt.tight_layout()
    plt.savefig(FIGURES / "accounting_vs_recoverable_value.png", dpi=200)
    plt.close()


def plot_borrow_limits(df: pd.DataFrame) -> None:
    plt.figure(figsize=(10, 5.5))
    plt.plot(df["step"], df["recoverable_value"], marker="o", label="Recoverable collateral value")
    plt.plot(df["step"], df["safe_borrow_limit"], marker="o", label="Safe borrow limit")
    plt.plot(df["step"], df["unsafe_borrow_limit"], marker="o", label="Unsafe borrow limit")
    plt.plot(df["step"], df["bad_debt_gap"], marker="o", label="Bad debt gap")
    plt.title("Unsafe Borrow Limit Under SY Impairment")
    plt.ylabel("Value")
    plt.xlabel("Scenario step")
    plt.xticks(df["step"], df["state"], rotation=25, ha="right")
    plt.legend()
    plt.tight_layout()
    plt.savefig(FIGURES / "unsafe_borrow_limit_bad_debt.png", dpi=200)
    plt.close()


if __name__ == "__main__":
    main()