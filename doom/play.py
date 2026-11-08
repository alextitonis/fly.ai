"""A fruit fly connectome plays Freedoom.

  python doom/play.py run  --seeds 1-5 [--level center] [--mode brain|swapped|blind] [--set fire=15 ...]
  python doom/play.py clip --seed 3 [--max 25] [--out doom/videos/seed3.mp4]

Headless and silent: ViZDoom renders off-screen with sound off; nothing opens on screen.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import eye as eyemod  # noqa: E402
from fly import DEFAULT, Fly  # noqa: E402
from game import Doom  # noqa: E402

STEPS_PER_TIC = 2          # brain dt = 1/70 s, Doom runs 35 tics/s


def seeds(text: str) -> list[int]:
    out = []
    for part in text.split(","):
        a, _, b = part.partition("-")
        out += list(range(int(a), int(b or a) + 1))
    return out


def settings(pairs) -> dict:
    p = dict(DEFAULT)
    for kv in pairs or []:
        k, v = kv.split("=")
        if k not in p:
            raise SystemExit(f"unknown setting {k}; known: {', '.join(p)}")
        p[k] = float(v)
    return p


def play(brain, eye, seed: int, p: dict, level="center", mode="brain", recorder=None, max_seconds=60.0) -> dict:
    brain.reset(seed)
    for _ in range(35):
        brain.step()
    fly = Fly(brain, eye, dict(p), mode)
    game = Doom(level, seed)
    shots, t, alive = 0, 0.0, True
    try:
        while t < max_seconds and alive:
            for _ in range(STEPS_PER_TIC):
                fly.step(game.frame, game.things)
            a = fly.act()
            shots += a["attack"]
            alive = game.step(**a)
            t += 1 / 35
            if recorder:
                recorder.add(game, fly, a, t)
        if recorder and not alive:
            for _ in range(35):
                t += 1 / 35
                recorder.add(game, fly, {"attack": False}, t, dead=True)
    finally:
        game.close()
    return {"seed": seed, "level": level, "mode": mode, "kills": game.kills, "seconds": round(t, 1),
            "health": max(0, game.health), "shots": shots}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "clip"])
    ap.add_argument("--seeds", default="1-5")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--level", default="center")
    ap.add_argument("--mode", default="brain")
    ap.add_argument("--set", nargs="*")
    ap.add_argument("--flies", type=int, default=8)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--max", type=float, default=60.0)
    ap.add_argument("--out")
    a = ap.parse_args()

    from flybrain import FlyBrain
    brain = FlyBrain(device=a.device, batch=a.flies, dt=1 / 70)
    eye = eyemod.load()
    p = settings(a.set)
    if a.cmd == "run":
        for sd in seeds(a.seeds):
            t0 = time.time()
            r = play(brain, eye, sd, p, a.level, a.mode, max_seconds=a.max)
            r["wall"] = round(time.time() - t0, 1)
            print(json.dumps(r), flush=True)
    else:
        from video import Recorder
        out = Path(a.out or HERE / "videos" / f"{a.level}-seed{a.seed}.mp4")
        rec = Recorder(out, brain, eye)
        r = play(brain, eye, a.seed, p, a.level, a.mode, recorder=rec, max_seconds=a.max)
        rec.close()
        print(json.dumps(r), "->", out)


if __name__ == "__main__":
    main()
