"""The fly brain plays Floppy Bird.

  python flap/play.py run   --seeds 1-5 [--mode brain|swapped|random|still] [--set threshold=6 ...]
  python flap/play.py clip  --seed 3 [--out flap/videos/seed3.mp4]
  python flap/play.py clips --seeds 1-40 [--keep 3]      # play many, film the best runs + the funniest early death

Headless Chrome, muted, nothing opens on screen.
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

from fly import DEFAULT, Fly, View  # noqa: E402
from game import Game  # noqa: E402

MAX_SECONDS = 90.0
CHROME_ARGS = ["--mute-audio", "--autoplay-policy=user-gesture-required"]


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


def play(browser, brain, seed: int, p: dict, mode: str = "brain", recorder=None, random_rate: float = 2.0,
         easy: bool = False) -> dict:
    """One game. Returns pipes passed, seconds alive, flaps."""
    brain.reset(seed)
    for _ in range(int(round(0.5 / brain.dt))):   # let the network settle before the game starts
        brain.step()
    fly = Fly(brain, dict(p), mode)
    fly.rng = __import__("numpy").random.default_rng(seed)
    fly.random_rate = random_rate
    game = Game(browser, seed, easy)
    ms = brain.dt * 1000
    every = max(1, int(round(0.02 / brain.dt)))   # video stays at 50 fps whatever the brain step
    n = 0
    flaps, t, s = 0, 0.0, game.step(0)
    try:
        while t < MAX_SECONDS:
            s = game.step(ms)
            t += brain.dt
            alive = s["state"] == 1
            v = View(s["bx"], s["by"], s["gy"], s["gdx"], s["gh"], alive, s["score"])
            flap = fly.step(v) if alive else False
            if flap:
                game.flap()
                flaps += 1
            n += 1
            if recorder:
                recorder.mark(fly, flap)
                if n % every == 0 or not alive:
                    recorder.add(game.frame(), fly, v, t)
            if not alive:
                break
        if recorder:                          # a second of the death animation
            for _ in range(60):
                game.step(20)
                t += 0.02
                recorder.add(game.frame(), fly, v, t, dead=True)
    finally:
        game.close()
    return {"seed": seed, "mode": mode, "pipes": int(s["score"]), "seconds": round(t, 2), "flaps": flaps}


def open_browser(pw):
    """Chrome plus one throwaway load of the game, so every real run comes from the same cached files
    (the first load off the network plays differently; after it, a seed always replays the same)."""
    browser = pw.chromium.launch(args=CHROME_ARGS)
    Game(browser, 0).close()
    Game(browser, 0, easy=True).close()
    return browser


def add_common(ap):
    ap.add_argument("--easy", action="store_true", help="the game's own easy mode (?easy, 200 px gap)")
    ap.add_argument("--flies", type=int, default=1, help="flies voting (brain batch)")
    ap.add_argument("--dt", type=float, default=0.02, help="brain step, seconds")
    ap.add_argument("--device", default="auto")


def make_brain(a):
    from flybrain import FlyBrain
    return FlyBrain(device=a.device, batch=a.flies, dt=a.dt)


def main():
    ap = argparse.ArgumentParser()
    add_common(ap)
    ap.add_argument("cmd", choices=["run", "clip", "clips"])
    ap.add_argument("--seeds", default="1-5")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mode", default="brain")
    ap.add_argument("--set", nargs="*")
    ap.add_argument("--out")
    ap.add_argument("--keep", type=int, default=3)
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright
    p = settings(a.set)
    brain = make_brain(a)
    with sync_playwright() as pw:
        browser = open_browser(pw)
        if a.cmd == "run":
            for sd in seeds(a.seeds):
                t0 = time.time()
                r = play(browser, brain, sd, p, a.mode, easy=a.easy)
                r["wall"] = round(time.time() - t0, 1)
                print(json.dumps(r), flush=True)
        elif a.cmd == "clip":
            from video import Recorder
            out = Path(a.out or HERE / "videos" / f"seed{a.seed}.mp4")
            rec = Recorder(out)
            r = play(browser, brain, a.seed, p, a.mode, recorder=rec, easy=a.easy)
            rec.close(r)
            print(json.dumps(r), "->", out)
        else:
            from video import Recorder
            results = []
            for sd in seeds(a.seeds):
                r = play(browser, brain, sd, p, a.mode, easy=a.easy)
                print(json.dumps(r), flush=True)
                results.append(r)
            best = sorted(results, key=lambda r: (-r["pipes"], -r["seconds"]))[: a.keep]
            early = min(results, key=lambda r: (r["pipes"], r["seconds"]))
            picks = [(r, f"best-{i + 1}") for i, r in enumerate(best)] + [(early, "fastest-death")]
            for r, tag in picks:
                out = HERE / "videos" / f"{tag}-seed{r['seed']}-{r['pipes']}pipes.mp4"
                rec = Recorder(out)
                again = play(browser, brain, r["seed"], p, a.mode, recorder=rec, easy=a.easy)
                rec.close(again)
                note = "" if again["pipes"] == r["pipes"] else f" (replay scored {again['pipes']})"
                print(f"{tag}: {out.name}{note}")
        browser.close()


if __name__ == "__main__":
    main()
