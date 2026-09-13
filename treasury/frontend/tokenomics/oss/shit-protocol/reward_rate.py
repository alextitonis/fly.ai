from ..types import StateType, ParamsType


def reward_rate_mechanism(state: StateType, params: ParamsType, _input):
    # Simple pass through
    out = _input["reward_rate"]

    assert out > 0, "Reward rate is negative, please check"

    return out
