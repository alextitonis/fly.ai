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
         easy: bool = False, max_seconds: float = MAX_SECONDS, until: int = 0,
         gap: int = 0) -> dict:
    """One game. Returns pipes passed, seconds alive, flaps."""
    brain.reset(seed)
    for _ in range(int(round(0.5 / brain.dt))):   # let the network settle before the game starts
        brain.step()
    fly = Fly(brain, dict(p), mode)
    fly.rng = __import__("numpy").random.default_rng(seed)
    fly.random_rate = random_rate
    game = Game(browser, seed, easy, gap)
    ms = brain.dt * 1000
    every = max(1, int(round(0.02 / brain.dt)))   # video stays at 50 fps whatever the brain step
    n = 0
    flaps, t, s = 0, 0.0, game.step(0)
    stop_at = None                            # with `until`: end the clip shortly after that many pipes
    try:
        while t < max_seconds:
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
            if until and s["score"] >= until and stop_at is None:
                stop_at = t + 0.8
            if stop_at is not None and t >= stop_at:
                break
        if recorder and not alive:            # a second of the death animation
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
    ap.add_argument("--gap", type=int, default=0, help="pipe gap in px (game default 90, easy 200)")
    ap.add_argument("--flies", type=int, default=8, help="flies voting (brain batch)")
    ap.add_argument("--dt", type=float, default=0.01, help="brain step, seconds")
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
    ap.add_argument("--max", type=float, default=20.0, help="clip length cap, seconds (clip/clips only)")
    ap.add_argument("--until", type=int, default=0, help="end the clip just after this many pipes")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright
    p = settings(a.set)
    brain = make_brain(a)
    with sync_playwright() as pw:
        browser = open_browser(pw)
        if a.cmd == "run":
            for sd in seeds(a.seeds):
                t0 = time.time()
                r = play(browser, brain, sd, p, a.mode, easy=a.easy, gap=a.gap)
                r["wall"] = round(time.time() - t0, 1)
                print(json.dumps(r), flush=True)
        elif a.cmd == "clip":
            from video import Recorder
            out = Path(a.out or HERE / "videos" / f"seed{a.seed}.mp4")
            rec = Recorder(out)
            r = play(browser, brain, a.seed, p, a.mode, recorder=rec, easy=a.easy, max_seconds=a.max, until=a.until, gap=a.gap)
            rec.close(r)
            print(json.dumps(r), "->", out)
        else:
            # Every game is filmed as it is played (the GPU brain doesn't replay a seed exactly), then only the
            # best few and the fastest death are kept.
            from video import Recorder
            tmp = HERE / "videos" / "_tmp"
            results = []
            for sd in seeds(a.seeds):
                rec = Recorder(tmp / f"seed{sd}.mp4")
                r = play(browser, brain, sd, p, a.mode, recorder=rec, easy=a.easy, max_seconds=a.max, until=a.until, gap=a.gap)
                rec.close(r)
                r["file"] = rec.out
                print(json.dumps({k: v for k, v in r.items() if k != "file"}), flush=True)
                results.append(r)
            best = sorted(results, key=lambda r: (-r["pipes"], -r["seconds"]))[: a.keep]
            early = min(results, key=lambda r: (r["pipes"], r["seconds"]))
            tag = "easy-" if a.easy else ""
            picks = [(r, f"{tag}best-{i + 1}") for i, r in enumerate(best)] + [(early, f"{tag}fastest-death")]
            for r, name in picks:
                if not r["file"].exists():        # same game picked twice
                    continue
                out = HERE / "videos" / f"{name}-seed{r['seed']}-{r['pipes']}pipes.mp4"
                out.unlink(missing_ok=True)
                r["file"].replace(out)
                print(f"{name}: {out.name}")
            for f in tmp.glob("*.mp4"):
                f.unlink()
            tmp.rmdir()
        browser.close()


if __name__ == "__main__":
    main()
