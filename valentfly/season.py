"""Run real seasons of Be My ValentFLY -- no model, no training, no checkpoint.
Every "reading" below is the live mean spike-trace of the real MaleCNS
connectome's descending neurons (`flybrain.FlyBrain`), measured right after
0.5 s of stimulating that candidate's dedicated neuron population (see
`encode.py`). The proposal always goes to whichever candidate produced the
strongest reading. Nothing here is fit, trained, or scripted -- it's a
straight measurement, each time you run it.

    python valentfly/season.py --seasons 8 --seed 1 --html-out valentfly/site.html
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # the fly.ai core lives one level up

from flybrain import FlyBrain  # noqa: E402
from flybrain.reservoir import Trace, run  # noqa: E402

import env  # noqa: E402
from encode import Encoder  # noqa: E402

SITE_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "site_template.html")
STEPS_PER_DATE = 25  # 0.5 s at the brain's default 20 ms step
STRENGTH_MIN, STRENGTH_MAX = 0.35, 1.0
TRACE_TAU = 0.1
READING_WINDOW = 5  # average the last N steps of the trace as the "settled" reading


def render_site(seasons, out_path, template_path=SITE_TEMPLATE_PATH):
    with open(template_path, encoding="utf-8") as f:
        template = f.read()
    payload = json.dumps(seasons, separators=(",", ":"))
    html = template.replace("__SEASONS_JSON__", payload)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)


def stimulate_and_read(brain, trace, encoder, seat, compat_value, steps=STEPS_PER_DATE):
    """Stimulate `seat`'s population at a strength scaled by its true
    compatibility, run the brain forward, and return the settled mean
    descending-neuron trace -- the live reading, nothing predicted."""
    strength = STRENGTH_MIN + (STRENGTH_MAX - STRENGTH_MIN) * compat_value / env.COMPAT_MAX
    inject = (encoder.stimulate(seat, strength),)

    def encode(_t):
        return inject

    activity = run(brain, steps, encode=encode, trace=trace)
    return float(activity[-READING_WINDOW:].mean())


def run_season(brain, trace, encoder, rng):
    compat = env.random_problem(rng)
    brain.reset(seed=rng.randrange(1 << 30))
    trace.reset()

    rounds = []
    readings = []
    for seat in range(env.NUM_CANDIDATES):
        reading = stimulate_and_read(brain, trace, encoder, seat, compat[seat])
        readings.append(reading)
        rounds.append({
            "kind": "date",
            "candidate": seat,
            "value_before": round(reading, 4),
            "reward": -1.0,
            "revealed_value": compat[seat],
        })

    proposed = int(np.argmax(readings))
    reward, correct = env.score_proposal(compat, proposed)
    rounds.append({
        "kind": "propose",
        "candidate": proposed,
        "value_before": round(readings[proposed], 4),
        "reward": reward,
        "revealed_value": None,
    })

    return {
        "compat": compat,
        "true_best": compat.index(max(compat)),
        "rounds": rounds,
        "proposed": proposed,
        "correct": correct,
        "total_reward": round(sum(r["reward"] for r in rounds), 2),
        "dates_used": env.NUM_CANDIDATES,
    }


HOST_A, HOST_B = "Buzz", "Fizzy"


def narrate_season(season, season_num, seat_types):
    lines = [f"--- Season {season_num} ---"]
    lines.append(f"{HOST_A}: {env.NUM_CANDIDATES} candidates. No model, no training -- "
                 f"just the real 166,700-neuron connectome, live.")
    for r in season["rounds"]:
        if r["kind"] == "date":
            seat = r["candidate"]
            lines.append(f"{HOST_A}: dating candidate_{seat} (stimulating {seat_types[seat]}).")
            lines.append(f"{HOST_B}: revealed compatibility: {r['revealed_value']}. "
                         f"descending-neuron trace after 0.5s: {r['value_before']:.3f}.")
        else:
            lines.append(f"{HOST_A}: THIS IS IT. Proposing to candidate_{r['candidate']} "
                         f"-- the strongest live reading, {r['value_before']:.3f}.")
    if season["correct"]:
        lines.append(f"{HOST_B}: and candidate_{season['proposed']}'s TRUE compatibility was "
                     f"{season['compat'][season['proposed']]} -- the actual highest in the pool. "
                     f"The brain's own firing tracked it. True love, verified.")
    else:
        best = season["true_best"]
        lines.append(f"{HOST_B}: and candidate_{season['proposed']}'s TRUE compatibility was "
                     f"{season['compat'][season['proposed']]}. The actual best match was "
                     f"candidate_{best} at {season['compat'][best]}. The firing was strongest "
                     f"for the wrong one this time. Heartbreak, verified.")
    lines.append(f"{HOST_A}: {season['dates_used']} dates used, total reward {season['total_reward']:.1f}.")
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", type=int, default=8)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--device", default="auto", help="cpu, cuda, or auto (FlyBrain device)")
    parser.add_argument("--json-out", default=None)
    parser.add_argument("--html-out", default=None,
                         help="write a standalone, double-click-to-open recap page here")
    args = parser.parse_args()

    print("loading the real MaleCNS connectome (downloads ~260 MB the first time)...")
    brain = FlyBrain(device=args.device, seed=args.seed)
    encoder = Encoder(brain, env.NUM_CANDIDATES)
    trace = Trace(brain, types=["descending_neuron"], tau=TRACE_TAU)
    print(f"seats -> real neuron types: {dict(enumerate(encoder.types))}")

    rng = random.Random(args.seed)
    seasons = []
    for i in range(1, args.seasons + 1):
        season = run_season(brain, trace, encoder, rng)
        seasons.append(season)
        for line in narrate_season(season, i, encoder.types):
            print(line)
        print()

    solved = sum(1 for s in seasons if s["correct"])
    print(f"Season record: {solved}/{len(seasons)} correct proposals "
          f"(no training happened; this is just what the live brain landed on).")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(seasons, f, indent=2)
        print(f"[wrote {args.json_out}]")

    if args.html_out:
        render_site(seasons, args.html_out)
        print(f"[wrote {args.html_out} -- open it directly in a browser, no server needed]")


if __name__ == "__main__":
    main()
