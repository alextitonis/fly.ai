"""
Governance, automation, token registry, and deployment configuration simulation.

Models:
- ShitGovernor: On-chain governance (proposal, voting, timelock)
- ShitGelatoResolver: Automation dependency (Gelato outage risk + fallback keeper)
- TokenRegistry / TokenOnboardingManager: Dynamic impact token onboarding (min liquidity $10K)
- ShitCoolerConfig: Peg-support interest rate discount when price below floor
- Deployment misconfiguration: Missing setUsdc/setShitToken/setAuthorizedMinter
- Kernel policy activation: Module/policy install/activate lifecycle

Contract sources:
- contracts/src/governance/ShitGovernor.sol
- contracts/src/automation/ShitGelatoResolver.sol
- contracts/src/token-management/TokenRegistry.sol
- contracts/src/token-management/TokenOnboardingManager.sol
- contracts/script/DeployAll.s.sol
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field

EPOCHS_PER_DAY = 3


@dataclass
class GovernanceParams:
    # On-chain governance
    governance_enabled: bool = True
    voting_delay_epochs: int = 3  # 1 day
    voting_period_epochs: int = 21  # 7 days
    proposal_threshold_pct: float = 0.01  # 1% of supply to propose
    quorum_pct: float = 0.04  # 4% quorum
    timelock_delay_epochs: int = 6  # 2 days
    proposal_frequency: float = 0.05  # Probability per epoch

    # Flash loan attack risk
    flash_loan_risk: float = 0.002  # Per-epoch probability of flash loan voting attack

    # Gelato automation
    gelato_enabled: bool = True
    gelato_outage_probability: float = 0.003  # Per-epoch outage probability
    gelato_outage_duration_epochs: int = 3  # Typical outage length
    fallback_keeper_enabled: bool = True  # KEEPER_ROLE multisig can manually trigger
    fallback_keeper_activation_delay: int = 1  # Epochs before fallback kicks in

    # Token registry
    impact_token_onboarding_enabled: bool = True
    new_token_frequency: float = 0.02  # Probability of new token per epoch
    new_token_avg_value: float = 500_000.0
    new_token_liquidity_risk: float = 0.30  # 30% chance new token is illiquid
    min_liquidity_usd: float = 10_000.0  # Min liquidity depth required (from contract)
    liquidity_check_enabled: bool = True  # Whether liquidity oracle is set

    # Deployment config risks
    authorized_minter_set: bool = True  # Was setAuthorizedMinter called?
    usdc_address_correct: bool = True  # Was setUsdc called with correct address?
    shit_token_set: bool = True  # Was setShitToken called?

    num_epochs: int = 90
    random_seed: int = 42


@dataclass
class GovernanceState:
    active_proposals: int = 0
    passed_proposals: int = 0
    failed_proposals: int = 0
    executed_proposals: int = 0
    flash_loan_attacks: int = 0

    gelato_active: bool = True
    gelato_outage_epochs: int = 0
    total_gelato_outages: int = 0
    gelato_outage_active: bool = False
    fallback_keeper_active: bool = False  # Fallback keeper compensates during Gelato outage
    fallback_epochs: int = 0  # Epochs where fallback keeper was active

    onboarded_tokens: int = 0
    illiquid_tokens: int = 0
    total_onboarded_value: float = 0.0

    config_errors: int = 0


def simulate_governance(params: GovernanceParams) -> pd.DataFrame:
    """Simulate governance, automation, and token registry dynamics."""
    rng = np.random.default_rng(params.random_seed)
    state = GovernanceState()
    records = []

    # Check deployment config at start
    if not params.authorized_minter_set:
        state.config_errors += 1
    if not params.usdc_address_correct:
        state.config_errors += 1
    if not params.shit_token_set:
        state.config_errors += 1

    for epoch in range(params.num_epochs):
        # ─── Governance ───
        if params.governance_enabled:
            # New proposals
            if rng.random() < params.proposal_frequency:
                state.active_proposals += 1

            # Proposal outcomes (simplified: proposals created voting_delay ago finish)
            if state.active_proposals > 0 and epoch > params.voting_delay_epochs:
                # Each proposal has a chance of passing
                for _ in range(state.active_proposals):
                    if rng.random() < params.quorum_pct * 10:  # Simplified quorum check
                        state.passed_proposals += 1
                    else:
                        state.failed_proposals += 1
                state.active_proposals = 0

            # Timelock execution
            if state.passed_proposals > 0 and epoch % params.timelock_delay_epochs == 0:
                state.executed_proposals += state.passed_proposals
                state.passed_proposals = 0

            # Flash loan attack
            if rng.random() < params.flash_loan_risk:
                state.flash_loan_attacks += 1

        # ─── Gelato automation (with fallback keeper) ───
        if params.gelato_enabled:
            if not state.gelato_outage_active:
                if rng.random() < params.gelato_outage_probability:
                    state.gelato_outage_active = True
                    state.gelato_outage_epochs = params.gelato_outage_duration_epochs
                    state.total_gelato_outages += 1
                    state.gelato_active = False
                    state.fallback_keeper_active = False  # Not yet activated
            else:
                state.gelato_outage_epochs -= 1
                # Fallback keeper activates after delay
                if not state.fallback_keeper_active and params.fallback_keeper_enabled:
                    outage_elapsed = params.gelato_outage_duration_epochs - state.gelato_outage_epochs
                    if outage_elapsed >= params.fallback_keeper_activation_delay:
                        state.fallback_keeper_active = True
                        state.fallback_epochs += 1
                elif state.fallback_keeper_active:
                    state.fallback_epochs += 1

                if state.gelato_outage_epochs <= 0:
                    state.gelato_outage_active = False
                    state.gelato_active = True
                    state.fallback_keeper_active = False

        # ─── Token registry onboarding (with min liquidity check) ───
        if params.impact_token_onboarding_enabled:
            if rng.random() < params.new_token_frequency:
                # Check minimum liquidity requirement
                if params.liquidity_check_enabled:
                    # Simulate token liquidity depth (log-normal distribution)
                    token_liquidity = rng.lognormal(8, 1.5)  # Median ~$3K, but wide distribution
                    if token_liquidity < params.min_liquidity_usd:
                        continue  # Token rejected: insufficient liquidity

                state.onboarded_tokens += 1
                token_value = params.new_token_avg_value * rng.uniform(0.5, 2.0)
                state.total_onboarded_value += token_value
                if rng.random() < params.new_token_liquidity_risk:
                    state.illiquid_tokens += 1

        records.append({
            'epoch': epoch,
            'day': epoch / EPOCHS_PER_DAY,
            'active_proposals': state.active_proposals,
            'passed_proposals': state.passed_proposals,
            'failed_proposals': state.failed_proposals,
            'executed_proposals': state.executed_proposals,
            'flash_loan_attacks': state.flash_loan_attacks,
            'gelato_active': state.gelato_active,
            'gelato_outage_active': state.gelato_outage_active,
            'total_gelato_outages': state.total_gelato_outages,
            'fallback_keeper_active': state.fallback_keeper_active,
            'fallback_epochs': state.fallback_epochs,
            'onboarded_tokens': state.onboarded_tokens,
            'illiquid_tokens': state.illiquid_tokens,
            'total_onboarded_value': state.total_onboarded_value,
            'config_errors': state.config_errors,
            'premium_seller_operational': (state.gelato_active or state.fallback_keeper_active) and params.authorized_minter_set,
            'pegkeeper_operational': state.gelato_active or state.fallback_keeper_active,
            'liquidations_operational': state.gelato_active or state.fallback_keeper_active,
        })

    return pd.DataFrame(records)


def governance_summary(df: pd.DataFrame) -> dict:
    return {
        'total_proposals': df['executed_proposals'].iloc[-1] + df['failed_proposals'].iloc[-1],
        'executed_proposals': df['executed_proposals'].iloc[-1],
        'failed_proposals': df['failed_proposals'].iloc[-1],
        'flash_loan_attacks': df['flash_loan_attacks'].iloc[-1],
        'gelato_outages': df['total_gelato_outages'].iloc[-1],
        'gelato_uptime_pct': df['gelato_active'].mean() * 100,
        'fallback_activated_epochs': df['fallback_keeper_active'].sum(),
        'effective_uptime_pct': (df['gelato_active'] | df['fallback_keeper_active']).mean() * 100,
        'onboarded_tokens': df['onboarded_tokens'].iloc[-1],
        'illiquid_tokens': df['illiquid_tokens'].iloc[-1],
        'total_onboarded_value': df['total_onboarded_value'].iloc[-1],
        'config_errors': df['config_errors'].iloc[-1],
        'premium_seller_downtime_epochs': (~df['premium_seller_operational']).sum(),
        'pegkeeper_downtime_epochs': (~df['pegkeeper_operational']).sum(),
    }
