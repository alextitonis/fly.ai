from ..types import StateType, ParamsType


def reward_rate_policy_flat():
    rr = 0.000198  # (1 + r) ^ 365 ~ 7.5%
    return rr


def reward_rate_policy(state: StateType, params: ParamsType):
    if params["reward_rate_policy"] == "Flat":
        return reward_rate_policy_flat()
    else:
        assert False,"reward_rate_policy should be 'flat'."
