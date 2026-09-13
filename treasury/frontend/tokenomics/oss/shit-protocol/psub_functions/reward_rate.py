from ..policy.reward_rate import reward_rate_policy
from ..mechanism.reward_rate import reward_rate_mechanism


def p_reward_rate(_params, substep, state_history, state) -> dict:
    output = {"reward_rate": reward_rate_policy(state, _params)}
    return output


def s_reward_rate(_params, substep, state_history, state, _input) -> tuple:
    out = reward_rate_mechanism(state, _params, _input)

    return ("reward_rate", out)
