"""Fly minds for the fly market: what a fly is born with, what it learns, and what its children inherit.

Pure Python (no brain, no numpy) so the API can import it when a fly is bred.

Born with (traits, drawn once, mixed and mutated in children):
  risk          share of its fake ETH it spends on a buy                        0.10-0.40
  lr            dopamine learning rate                                          0.05-0.30
  k             neighbours its memory looks at                                  3-9
  memory_size   market situations it remembers                                  20-80
  tube_growth   how fast a slime-mold tube to a coin thickens when it pays      0.10-0.50
  tube_decay    how fast unused tubes wither                                    0.02-0.10
  caution       how bad a remembered outcome must be to stop a trade            0.000-0.020

Learns (all at the interface between the market and its brain; the connectome itself is not rewired, because in this
model the mushroom body, where flies really learn with dopamine, fires at its ceiling and can't learn yet):
  dopamine   reward = the log change of its portfolio over a round; dopamine = clip(20 x reward, -1, 1). It drives
             the fly's PAM reward neurons in its next brain run, and a three-factor update on what it did last round:
             gain[sense] += lr x dopamine x how strongly that sense was driven, bias[action] += lr x dopamine.
             Gains scale how hard the market hits each sense (0.2-2.5); a bias scales, or below 0.15 blocks, an action.
  memory     (situation, action, reward) for its last memory_size trades; before a trade it looks at the k most
             similar situations where it did the same thing, skips the trade if all k exist and lost more than
             `caution` on average (but still trades 20% of the time, to keep learning), and trades 1.3x if they gained.
  v2: rewards come from each trade's own coin 3 rounds later (a buy gains if the coin rose, a sell if it fell, minus
      the fee), dopamine = clip(10 x that), and urges drift back toward 1 by 0.02 a round. v1 used the whole
      portfolio's round and lost to non-learning flies (README, "Does learning help?").
  tubes      Physarum-style: each coin has a tube; a coin that made it money thickens its tube, every tube decays.
             The coin it notices as "pumping" is weighted by its tube, so it keeps coming back to what paid.
Children: traits from either parent at random, each mutated with a small chance; the lineage's `inherit` style
decides the rest: traits (nothing learned), partial (learned gains, biases and tubes pulled halfway back to a newborn,
a quarter of each parent's memories), all (parents' learned state averaged, all memories up to the size limit).
The style is itself inherited, with a small chance of switching.
"""
from __future__ import annotations

import math
import random

CHANNELS = ["target", "threat", "wind"]
ACTIONS = ["buy", "panic_sell", "take_profit", "sell"]
STYLES = ["traits", "partial", "all"]
TRAITS = {
    "risk": (0.10, 0.40, False), "lr": (0.02, 0.10, False), "k": (3, 9, True), "memory_size": (20, 80, True),
    "tube_growth": (0.10, 0.50, False), "tube_decay": (0.02, 0.10, False), "caution": (0.01, 0.05, False),
}
GAIN_RANGE, BIAS_RANGE, BIAS_BLOCK = (0.2, 2.5), (0.0, 2.0), 0.15
MUTATION, STYLE_SWITCH = 0.2, 0.1
# v2 (2026-09-14), after the first market_eval check failed (learning 0.76 vs frozen 1.19 fake ETH): a trade is judged
# by its own coin over HORIZON rounds, not the whole portfolio's round; urges drift back toward 1 each round; memory
# needs k agreeing memories to skip a trade and still trades anyway EXPLORE of the time.
HORIZON = 3
FEE_LOG = math.log(1 / (1 - 0.003))
FEE_LOG_BY: dict[str, float] = {}      # symbols with a different fee (market.py: stablecoins)
BIAS_RECOVER = 0.02
EXPLORE = 0.2


def _draw(rng: random.Random, name: str) -> float | int:
    lo, hi, whole = TRAITS[name]
    return rng.randint(lo, hi) if whole else round(rng.uniform(lo, hi), 4)


def fresh_learned() -> dict:
    return {"gains": {c: 1.0 for c in CHANNELS}, "bias": {a: 1.0 for a in ACTIONS}, "open": []}


def born(fly_id: str, rng: random.Random, style: str | None = None) -> dict:
    return {"fly_id": fly_id, "traits": {t: _draw(rng, t) for t in TRAITS}, "learned": fresh_learned(), "memory": [],
            "tubes": {}, "inherit": style or rng.choice(STYLES),
            "stats": {"rounds": 0, "rewards": 0.0, "good_trades": 0, "bad_trades": 0, "vetoes": 0, "dopamine": 0.0},
            "parents": [], "learning": {"dopamine": True, "memory": True, "tubes": True},
            "launch": {"urge": 0.0, "coins": [], "rounds": 0, "last_round": None}}   # launches.py; a child starts its own


LEARNERS = ("dopamine", "memory", "tubes")


def clean_style(raw) -> dict:
    """An owner's trading style from the API: {learning?: {dopamine, memory, tubes}, risk?}. ValueError if malformed.
    The brain still makes every trade; a style only sets what the fly starts from."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError("style must be an object")
    out = {}
    if raw.get("learning") is not None:
        choice = raw["learning"]
        if not isinstance(choice, dict) or any(not isinstance(choice.get(k), bool) for k in LEARNERS):
            raise ValueError("learning must say true or false for dopamine, memory and tubes")
        out["learning"] = {k: choice[k] for k in LEARNERS}
    if raw.get("risk") is not None:
        risk, (lo, hi, _) = raw["risk"], TRAITS["risk"]
        if isinstance(risk, bool) or not isinstance(risk, (int, float)) or not lo <= risk <= hi:
            raise ValueError(f"risk must be between {lo:.2f} and {hi:.2f}")
        out["risk"] = round(float(risk), 4)
    return out


def apply_style(mind: dict, style: dict) -> dict:
    """Put a cleaned style on a mind (born, bred or existing). Mutates and returns it."""
    if "learning" in style:
        mind["learning"] = dict(style["learning"])
    if "risk" in style:
        mind.setdefault("traits", {})["risk"] = style["risk"]
    return mind


def ensure(mind: dict, fly_id: str, rng: random.Random) -> dict:
    """Fill anything missing (minds written before a field existed)."""
    base = born(fly_id, rng, mind.get("inherit"))
    for t, v in base["traits"].items():
        mind.setdefault("traits", {}).setdefault(t, v)
    learned = mind.setdefault("learned", {})
    learned.setdefault("gains", {}).update({c: learned["gains"].get(c, 1.0) for c in CHANNELS})
    learned.setdefault("bias", {}).update({a: learned["bias"].get(a, 1.0) for a in ACTIONS})
    learned.pop("pending", None)
    learned.setdefault("open", [])
    mind.setdefault("memory", [])
    mind.setdefault("tubes", {})
    mind.setdefault("inherit", base["inherit"])
    stats = mind.setdefault("stats", {})
    for s, v in base["stats"].items():
        stats.setdefault(s, v)
    mind.setdefault("parents", [])
    mind.setdefault("learning", dict(base["learning"]))
    if not mind.get("launch"):                              # the column defaults to {}
        mind["launch"] = dict(base["launch"])
    mind.setdefault("fly_id", fly_id)
    return mind


def clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def tube(mind: dict, symbol: str) -> float:
    return float(mind["tubes"].get(symbol, 1.0))


def situation(drive: dict, held_share: float) -> list[float]:
    """What the market looked like to the fly, for memory: moves and chop, and how much of it was in coins."""
    return [drive["target"]["move"], drive["threat"]["move"], drive["wind"]["chop"], held_share]


def recall(mind: dict, state: list[float], action: str, median: bool = False) -> tuple[float | None, int]:
    """Mean reward of the k most similar remembered situations where it did the same action; with median, their
    median (2026-10-06, the trading desks: one rug's log reward of -2.3 among 9 neighbours pulled the mean under
    -caution for every situation like it, so the live desk's fly vetoed nearly every buy, never traded, and so never
    remembered anything newer - the median weighs that rug as one bad memory of nine)."""
    same = [m for m in mind["memory"] if m["action"] == action]
    if not same:
        return None, 0
    near = sorted(same, key=lambda m: sum((a - b) ** 2 for a, b in zip(m["state"], state)))[: int(mind["traits"]["k"])]
    if median:
        r = sorted(m["reward"] for m in near)
        mid = len(r) // 2
        return (r[mid] if len(r) % 2 else (r[mid - 1] + r[mid]) / 2), len(near)
    return sum(m["reward"] for m in near) / len(near), len(near)


def open_trade(mind: dict, symbol: str, price: float, action: str, drive: dict, state: list[float]) -> None:
    """Remember a trade until HORIZON rounds have passed, when its own coin decides how it went."""
    mind["learned"]["open"].append({"symbol": symbol, "price": price, "action": action, "drive": drive, "state": state,
                                    "round": mind["stats"]["rounds"]})


def trade_reward(trade: dict, price_now: float) -> float:
    """A buy is good if its coin went up since; a sell (of any kind) is good if its coin went down. Minus the fee."""
    move = math.log(max(price_now, 1e-18) / max(trade["price"], 1e-18))
    return (move if trade["action"] == "buy" else -move) - FEE_LOG_BY.get(trade.get("symbol"), FEE_LOG)


def learn(mind: dict, prices: dict[str, float], coin_flux: dict[str, float], learning: dict[str, bool]) -> float:
    """Once a round: trades that are HORIZON rounds old are judged by their own coin; each gives dopamine that updates
    the gains and urge behind it and is stored in memory. Urges drift back toward 1, tubes grow and decay.
    learning: which of dopamine / memory / tubes are on (the offline check switches them off).
    Returns the mean dopamine of the trades judged this round (0 if none), which drives PAM in the next brain run."""
    t, learned, stats = mind["traits"], mind["learned"], mind["stats"]
    stats["rounds"] += 1
    due = [o for o in learned["open"] if stats["rounds"] - o["round"] >= HORIZON and o["symbol"] in prices]
    learned["open"] = [o for o in learned["open"] if o not in due][-50:]
    hits = []
    for o in due:
        reward = trade_reward(o, prices[o["symbol"]])
        dopamine = clip(10.0 * reward, -1.0, 1.0)
        hits.append(dopamine)
        stats["rewards"] = round(stats["rewards"] + reward, 6)
        stats["good_trades" if reward > 0 else "bad_trades"] += 1
        if learning.get("dopamine", True):
            for c in CHANNELS:
                learned["gains"][c] = round(clip(learned["gains"][c] + t["lr"] * dopamine * o["drive"].get(c, 0.0), *GAIN_RANGE), 4)
            learned["bias"][o["action"]] = round(clip(learned["bias"][o["action"]] + t["lr"] * dopamine, *BIAS_RANGE), 4)
        if learning.get("memory", True):
            mind["memory"] = (mind["memory"] + [{"state": o["state"], "action": o["action"], "reward": round(reward, 5)}])[-int(t["memory_size"]):]
    for a in ACTIONS:                                           # urges drift back toward 1 so no action is off for good
        b = learned["bias"][a]
        learned["bias"][a] = round(b + clip(1.0 - b, -BIAS_RECOVER, BIAS_RECOVER), 4)
    dopamine = sum(hits) / len(hits) if hits else 0.0
    stats["dopamine"] = round(dopamine, 3)
    if learning.get("tubes", True):
        for symbol, flux in coin_flux.items():
            grown = tube(mind, symbol) + t["tube_growth"] * max(flux, 0.0) * 20.0
            mind["tubes"][symbol] = round(clip(grown, 0.05, 5.0), 4)
        for symbol in list(mind["tubes"]):
            mind["tubes"][symbol] = round(max(0.05, mind["tubes"][symbol] * (1 - t["tube_decay"])), 4)
    return dopamine


def child(child_id: str, a: dict | None, b: dict | None, rng: random.Random) -> dict:
    """A child's mind from its parents' (either may be None: it never traded)."""
    parents = [m for m in (a, b) if m]
    if not parents:
        return born(child_id, rng)
    style = rng.choice([m.get("inherit", "partial") for m in parents])
    if rng.random() < STYLE_SWITCH:
        style = rng.choice(STYLES)
    out = born(child_id, rng, style)
    for t in TRAITS:
        value = rng.choice(parents)["traits"].get(t, out["traits"][t])
        if rng.random() < MUTATION:
            lo, hi, whole = TRAITS[t]
            value = value + rng.gauss(0, (hi - lo) * 0.15)
            value = int(round(clip(value, lo, hi))) if whole else round(clip(value, lo, hi), 4)
        out["traits"][t] = value
    out["parents"] = [m["fly_id"] for m in parents]
    if style == "traits":
        return out

    def avg(get, keys, pull):
        return {k: round(sum(get(m).get(k, 1.0) for m in parents) / len(parents) * (1 - pull) + 1.0 * pull, 4) for k in keys}

    pull = 0.5 if style == "partial" else 0.0
    out["learned"]["gains"] = avg(lambda m: m["learned"].get("gains", {}), CHANNELS, pull)
    out["learned"]["bias"] = avg(lambda m: m["learned"].get("bias", {}), ACTIONS, pull)
    symbols = sorted({s for m in parents for s in m.get("tubes", {})})
    out["tubes"] = avg(lambda m: m.get("tubes", {}), symbols, pull)
    share = 0.25 if style == "partial" else 1.0
    memories = []
    for m in parents:
        mem = m.get("memory", [])
        memories += rng.sample(mem, int(len(mem) * share)) if share < 1 else list(mem)
    out["memory"] = memories[-int(out["traits"]["memory_size"]):]
    return out
