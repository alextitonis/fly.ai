"""Interleaved A/B of encoder + readout pairs, one brain, one dashboard.

Blocks of matches per arm are not comparable: elo drifts and match length drifts with
them (round 4, 2026-09-12). This alternates arms match by match instead, with the brain
loaded once so the dashboard stays up the whole way.

    python ab.py --user FLYBRAIN --identity ~/.ssh/sshfighter-flybrain --rounds 12 --dashboard
"""
from __future__ import annotations

import argparse
import sys
from argparse import Namespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fly_eyes import FeatureDetectors
from fly_fighter import Fly, play
from reservoir import Readout

# (name, encoder overrides, trained readout)
ARMS = [("loom06", {"loom_size": 0.6}, "readout-loom06.npz"),
        ("handset", {}, "readout.npz")]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--user", required=True)
    p.add_argument("--identity")
    p.add_argument("--rounds", type=int, default=12, help="matches per arm")
    p.add_argument("--char", default="BYU")
    p.add_argument("--opponents", default="bots", choices=["all", "humans", "bots"])
    p.add_argument("--flies", type=int, default=8)
    p.add_argument("--seed", type=int, default=64)
    p.add_argument("--device", choices=["cpu", "cuda", "auto"], default="cuda")
    p.add_argument("--dashboard", action="store_true")
    p.add_argument("--no-browser", action="store_true")
    p.add_argument("--move-readout", action="store_true",
                   help="let the movement readout steer (it backs away forever; rounds never end)")
    a = p.parse_args()

    fly = Fly(a.device, a.flies, a.seed, {})
    dash = None
    if a.dashboard:
        from fly_dashboard import Dashboard
        dash = Dashboard(fly)
        dash.start(open_browser=not a.no_browser)

    # one match per call, so the arm can be swapped between matches
    args = Namespace(user=a.user, identity=a.identity, char=a.char, opponents=a.opponents,
                     matches=1, record=None, readout=None, no_move_readout=not a.move_readout)

    for rnd in range(1, a.rounds + 1):
        for name, encoder, readout in ARMS:
            fly.features = FeatureDetectors(fly.brain, **encoder)   # swap the encoder
            fly.readout = Readout(Path(__file__).resolve().parent / readout)
            if not a.move_readout:
                fly.readout.move = None
            print(f"\n=== round {rnd}/{a.rounds}  arm={name}  encoder={encoder or 'hand-set'}  "
                  f"readout={readout} ===", flush=True)
            play(fly, args, dash)


if __name__ == "__main__":
    main()
