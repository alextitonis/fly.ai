from hermes_screener.trading.liquidity_manager import (
    ArrakisAdapter,
    GammaAdapter,
    KaminoAdapter,
    LiquidityManager,
    NoDeploymentPathError,
    PoolOpportunity,
)


def test_raise_when_idle_token_has_no_route():
    manager = LiquidityManager(gas_reserve={}, dust_threshold_usd=0.5)
    balances = {"BONK": 50000.0, "WETH": 0.0}
    prices = {"BONK": 0.00002, "WETH": 3000.0}
    opportunities = [
        PoolOpportunity(
            id="arrakis-weth-usdc",
            protocol="arrakis",
            chain="base",
            token_a="WETH",
            token_b="USDC",
            apr=0.12,
            supports_single_sided=False,
            max_allocation_usd=10_000,
        )
    ]

    try:
        manager.build_plan(balances, prices, opportunities)
        raise AssertionError("Expected NoDeploymentPathError")
    except NoDeploymentPathError as exc:
        assert "BONK" in str(exc)


def test_full_utilization_with_single_sided_sweep():
    manager = LiquidityManager(gas_reserve={"USDC": 10.0}, dust_threshold_usd=1.0)
    balances = {"USDC": 1000.0, "WETH": 0.1, "SOL": 2.0}
    prices = {"USDC": 1.0, "WETH": 3000.0, "SOL": 150.0}

    opportunities = [
        PoolOpportunity(
            id="arrakis-weth-usdc",
            protocol="arrakis",
            chain="base",
            token_a="WETH",
            token_b="USDC",
            apr=0.10,
            supports_single_sided=False,
            max_allocation_usd=2000,
        ),
        PoolOpportunity(
            id="kamino-sol-usdc",
            protocol="kamino",
            chain="solana",
            token_a="SOL",
            token_b="USDC",
            apr=0.16,
            supports_single_sided=True,
            max_allocation_usd=5000,
        ),
        PoolOpportunity(
            id="kamino-usdc-only",
            protocol="kamino",
            chain="solana",
            token_a="USDC",
            token_b=None,
            apr=0.08,
            supports_single_sided=True,
            max_allocation_usd=5000,
        ),
    ]

    plan = manager.build_plan(balances, prices, opportunities)
    assert plan.utilization_pct >= 99.0
    assert sum(v * prices[k] for k, v in plan.projected_idle.items()) <= 1.0
    assert len(plan.actions) >= 2


def test_dual_sided_generates_balancing_swap_and_deploy():
    manager = LiquidityManager(gas_reserve={}, dust_threshold_usd=0.1, max_slippage_bps=100)
    balances = {"WETH": 1.0, "USDC": 100.0}
    prices = {"WETH": 3000.0, "USDC": 1.0}
    opportunities = [
        PoolOpportunity(
            id="gamma-weth-usdc",
            protocol="gamma",
            chain="base",
            token_a="WETH",
            token_b="USDC",
            apr=0.20,
            supports_single_sided=False,
            max_allocation_usd=5000,
        )
    ]

    plan = manager.build_plan(balances, prices, opportunities)
    action_types = [a.action_type for a in plan.actions]
    assert "swap_for_pair_balance" in action_types
    assert "deploy_dual_sided" in action_types


def test_arrakis_adapter_payload_shape():
    payload = ArrakisAdapter.build_rebalance_payload(
        burns=[{"liquidity": 1, "range": {"lowerTick": -10, "upperTick": 10, "feeTier": 500}}],
        mints=[{"liquidity": 2, "range": {"lowerTick": -5, "upperTick": 5, "feeTier": 500}}],
        swap={"payload": "0x", "router": "0xrouter", "amountIn": 10, "expectedMinReturn": 9, "zeroForOne": True},
        min_burn0=1,
        min_burn1=1,
        min_deposit0=1,
        min_deposit1=1,
    )
    assert set(payload.keys()) == {
        "burns",
        "mints",
        "swap",
        "minBurn0",
        "minBurn1",
        "minDeposit0",
        "minDeposit1",
    }


def test_gamma_adapter_payload_shape():
    params = GammaAdapter.build_rebalance_params(
        strategy="0xstrategy",
        center=10,
        t_left=100,
        t_right=120,
        limit_width=20,
        weight0=5000,
        weight1=5000,
        use_carpet=True,
    )
    assert params["tLeft"] == 100
    assert params["useCarpet"] is True


def test_kamino_adapter_method_selection():
    a_side = KaminoAdapter.build_single_sided_deposit("addr", "A", 100.0, 50)
    b_side = KaminoAdapter.build_single_sided_deposit("addr", "B", 100.0, 50)
    assert a_side["method"] == "singleSidedDepositTokenA"
    assert b_side["method"] == "singleSidedDepositTokenB"
