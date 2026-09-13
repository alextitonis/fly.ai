"""
ReferralRegistry + TokenOnboardingManager — SHIT-specific governance.
~30 lines. General governance delegated to SHIT Protocol governance.py.
"""

def governance_policy(params, substep, state_history, previous_state):
    """Policy: compute governance inputs from current state."""
    pending = previous_state.get('pending_onboarding', [])
    return {
        'pending_onboarding': list(pending) if isinstance(pending, list) else [],
    }

def governance_step(params, substep, state_history, previous_state, policy_input):
    """Handle SHIT-specific governance: referrals + token onboarding."""
    p = params.get('governance', {})

    # Referral fee splitting
    referral_fees = policy_input.get('referral_fees', 0)
    referrer_share = referral_fees * 0.10  # 10% to referrer
    protocol_share = referral_fees * 0.90  # 90% to protocol

    # Token onboarding timelock check
    pending_proposals = previous_state.get('pending_onboarding', [])
    current_epoch = previous_state.get('timestep', 0)
    timelock = p.get('onboardingTimelock', 172800) // 28800  # Convert to epochs
    expiry = p.get('onboardingExpiry', 1209600) // 28800

    active_proposals = []
    for prop in pending_proposals:
        age = current_epoch - prop.get('submit_epoch', 0)
        if age > expiry:
            continue  # Expired
        if age >= timelock and not prop.get('executed', False):
            prop['executable'] = True
        active_proposals.append(prop)

    return {
        'referral_referrer_share': referrer_share,
        'referral_protocol_share': protocol_share,
        'pending_onboarding': active_proposals,
    }
