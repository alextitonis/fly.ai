"""Run a real fruit-fly brain on a message, for the fly-mode Claude skill. Prints JSON.

    python fly_brain.py "someone brought pizza"          # the fly senses it and its brain reacts
    python fly_brain.py --sense threat "anything"         # pick the sense yourself

What happens: the message is turned into one thing a fly could sense (a hand-written keyword table: a swatter or a
deadline looms, pizza is a taste, "hi cutie" is another fly moving past...). That sense's neurons are stimulated in
the MaleCNS v1.0 connectome (166,700 neurons, the flybrain package) for 1 s at 20 ms steps, and the same brain with
nothing happening is run as a baseline. What the fly did is read from its behaviour neurons against that baseline:
escape (DNp01, jumped), steering (DNa02, turned), walking and backing up (DNg100 / MDN), grooming (DNg12), and its
wing motor neurons (buzzed). The keyword table is the only hand-written part; the reaction is the connectome's.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

import numpy as np

SENSES = {
    "threat": (["LC4", "LPLC2"], "a huge shape looming at it (looming detectors)"),
    "taste": (["claw_tpGRN", "dorsal_tpGRN", "BM_Taste"], "something tasty on its mouthparts (taste neurons)"),
    "mate": (["LC10a"], "another fly moving nearby (moving-target detectors)"),
    "wind": (["JO-CL", "JO-CM", "JO-CA2", "JO-EV1", "JO-EV2", "JO-EV3", "JO-EV5", "JO-EV6", "JO-ED1",
              "JO-ED2_a", "JO-ED2_b", "JO-ED2_c"], "wind on its antennae (Johnston's organ)"),
    "touch": (["BM_InOm"], "something brushing its eyes (eye bristles)"),
    "smell": (["ORN_DA1"], "the smell of another male (cVA pheromone receptors)"),
    "nothing": ([], "nothing in particular"),
}
KEYWORDS = {
    "threat": r"swat|slap|kill|\bhit\b|attack|danger|scary|monster|boss|deadline|\bbugs?\b|crash|error|fail|angry|shout|spider|bird|\bhands?\b|\brun\b|urgent|panic|police|tax",
    "taste": r"pizza|food|eat|hungry|sugar|sweet|cake|fruit|banana|apple|wine|beer|coffee|juice|lunch|dinner|snack|honey|candy|trash|garbage|rotten|burger",
    "mate": r"\bhi\b|hello|hey|cute|love|date|kiss|crush|friend|party|meet|dance|flirt|beautiful|handsome|single|tinder|gm\b",
    "wind": r"wind|fan|blow|breeze|air|storm|cold|ac\b|window|fly away|fast",
    "touch": r"touch|poke|tickle|pet|hug|scratch|brush|rub|itch|face|eye",
    "smell": r"smell|perfume|cologne|stink|scent|odou?r|fart|sweat|deodorant",
}
WING_MN = ["DLMn a, b", "DLMn c-f", "DVMn 1a-c", "DVMn 2a, b", "DVMn 3a, b", "MNwm35", "MNwm36",
           "b1 MN", "b2 MN", "b3 MN", "hg1 MN", "hg2 MN", "hg3 MN", "hg4 MN", "i1 MN", "i2 MN",
           "iii1 MN", "iii3 MN", "ps1 MN", "tp1 MN", "tp2 MN", "tpn MN"]
WARM, STIM, AMOUNT, RUNS = 25, 50, 0.8, 3


def sense_of(text: str) -> str:
    text = text.lower()
    scores = {s: len(re.findall(p, text)) for s, p in KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "nothing"


def episode(brain, stim_cells, groups, dn, dn_col, seed):
    brain.reset(seed)
    counts = {g: 0 for g in groups}
    dn_counts = np.zeros(len(dn))
    for s in range(WARM + STIM):
        inject = [(stim_cells, AMOUNT)] if s >= WARM and len(stim_cells) else []
        fired = brain.step(inject=inject)
        if s < WARM:
            continue
        for g, mask in groups.items():
            counts[g] += int(mask[fired].sum())
        col = dn_col[fired]
        np.add.at(dn_counts, col[col >= 0], 1)
    return counts, dn_counts


def load():
    """The brain and the neuron groups a reaction is read from: built once, reused for every react()."""
    from flybrain import FlyBrain
    brain = FlyBrain(batch=1, dt=0.020, sensory_input=False)   # downloads ~260 MB of brain files on first use
    n = brain.n

    def mask(ids):
        m = np.zeros(n, bool)
        m[ids] = True
        return m

    types = np.unique(brain.cell_type.astype(str))
    groups = {
        "escape": mask(np.concatenate([brain.groups["escape_L"], brain.groups["escape_R"]])),
        "steer_left": mask(brain.groups["steer_L"]),
        "steer_right": mask(brain.groups["steer_R"]),
        "walk": mask(np.concatenate([brain.groups["forward_L"], brain.groups["forward_R"]])),
        "back": mask(np.concatenate([brain.groups["backward_L"], brain.groups["backward_R"]])),
        "groom": mask(brain.cells([t for t in types if t.startswith("DNg12")])),
        "wings": mask(brain.cells(WING_MN)),
    }
    dn = brain.cells(["descending_neuron"])
    dn_col = np.full(n, -1)
    dn_col[dn] = np.arange(len(dn))
    return brain, groups, dn, dn_col


def react(loaded, sense: str, message: str = "", seed: int = 7) -> dict:
    """Stimulate one sense in the loaded brain and read what the fly did (the document main() prints)."""
    brain, groups, dn, dn_col = loaded
    n = brain.n
    stim_cells = brain.cells(SENSES[sense][0]) if SENSES[sense][0] else np.array([], int)

    rest = {g: 0.0 for g in groups}
    felt = {g: 0.0 for g in groups}
    rest_dn = np.zeros(len(dn))
    felt_dn = np.zeros(len(dn))
    for r in range(RUNS):
        c0, d0 = episode(brain, np.array([], int), groups, dn, dn_col, seed + r)
        c1, d1 = episode(brain, stim_cells, groups, dn, dn_col, seed + r)
        for g in groups:
            rest[g] += c0[g] / RUNS
            felt[g] += c1[g] / RUNS
        rest_dn += d0 / RUNS
        felt_dn += d1 / RUNS

    extra = {g: felt[g] - rest[g] for g in groups}
    did = []
    if extra["escape"] >= 3:
        did.append("jumped")
    if extra["wings"] >= max(15.0, 0.25 * rest["wings"]):
        did.append("buzzed its wings")
    if extra["groom"] >= max(10.0, 0.25 * rest["groom"]):
        did.append("groomed")
    turn = extra["steer_left"] + extra["steer_right"]
    if turn >= 3:
        side = extra["steer_left"] - extra["steer_right"]
        did.append("turned left" if side >= 1 else "turned right" if side <= -1 else "turned")
    if extra["walk"] >= 3:
        did.append("walked forward")
    if extra["back"] >= 3:
        did.append("backed up")

    dn_types = brain.cell_type[dn].astype(str)
    by_type: dict[str, float] = {}
    for t, v in zip(dn_types, felt_dn - rest_dn):
        by_type[t] = by_type.get(t, 0.0) + float(v)
    top = sorted(by_type.items(), key=lambda kv: -kv[1])[:5]

    return {
        "message": message,
        "sense": sense,
        "felt": SENSES[sense][1],
        "stimulated": SENSES[sense][0],
        "did": did or ["nothing: it just sat there"],
        "extra_spikes": {g: round(v, 1) for g, v in extra.items()},
        "top_descending_neurons": [{"type": t, "extra_spikes": round(v, 1)} for t, v in top if v > 0.5],
        "wing_spikes_per_s": round(felt["wings"] / (STIM * 0.020), 1),
        "brain": f"MaleCNS v1.0 connectome, {n:,} neurons, 1 s at 20 ms steps vs the same brain at rest, {RUNS} runs averaged",
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("message", nargs="*", help="what was said to the fly")
    p.add_argument("--sense", choices=list(SENSES), help="skip the keyword table and stimulate this sense")
    p.add_argument("--seed", type=int, default=7)
    args = p.parse_args()
    message = " ".join(args.message)
    sense = args.sense or sense_of(message)

    try:
        import flybrain  # noqa: F401
    except ImportError:
        print(json.dumps({"error": "the flybrain package isn't installed: pip install flybrain"}))
        sys.exit(1)
    print(json.dumps(react(load(), sense, message, args.seed), indent=1))


if __name__ == "__main__":
    main()
