"""Pick the interface settings on tuning seeds, then test on seeds the sweep never saw, against controls.

  python flap/sweep.py grid  [--seeds 1-6]          # writes flap/results/grid.json
  python flap/sweep.py eval  [--seeds 101-130] [--set k=v ...]   # brain vs swapped vs random vs still

Controls (same pipes, same seeds):
  swapped  the same brain with its up/down steering swapped
  random   coin-flip flaps at the brain's own flap rate
  still    never flaps
Only the interface is tuned (eye spread, flap threshold, gap between flaps); the connectome is never changed.
"""
from __future__ import annotations

import argparse
import itertools
import json
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from play import add_common, make_brain, open_browser, play, seeds, settings  # noqa: E402

GRID = {"threshold": [3.0, 6.0, 10.0], "spread": [0.2, 0.35], "refractory": [0.15, 0.25]}
OUT = HERE / "results"


def summary(rs):
    pipes = [r["pipes"] for r in rs]
    return {"mean_pipes": round(statistics.mean(pipes), 2), "max_pipes": max(pipes),
            "passed_1+": sum(p > 0 for p in pipes), "mean_seconds": round(statistics.mean(r["seconds"] for r in rs), 2),
            "flaps_per_s": round(sum(r["flaps"] for r in rs) / sum(r["seconds"] for r in rs), 2), "runs": len(rs)}


def main():
    ap = argparse.ArgumentParser()
    add_common(ap)
    ap.add_argument("cmd", choices=["grid", "eval"])
    ap.add_argument("--seeds")
    ap.add_argument("--set", nargs="*")
    ap.add_argument("--grid", help='JSON, e.g. {"pitch": [0, 20]}')
    ap.add_argument("--name", help="results file name (default grid / eval)")
    a = ap.parse_args()
    grid = json.loads(a.grid) if a.grid else GRID
    a.name = a.name or a.cmd
    from playwright.sync_api import sync_playwright
    OUT.mkdir(exist_ok=True)
    brain = make_brain(a)
    with sync_playwright() as pw:
        browser = open_browser(pw)
        if a.cmd == "grid":
            ss = seeds(a.seeds or "1-6")
            rows = []
            for combo in itertools.product(*grid.values()):
                p = settings(a.set)
                p.update(dict(zip(grid, combo)))
                t0 = time.time()
                rs = [play(browser, brain, s, p, easy=a.easy) for s in ss]
                row = {"settings": dict(zip(grid, combo)), **summary(rs), "wall": round(time.time() - t0)}
                rows.append(row)
                print(json.dumps(row), flush=True)
                (OUT / f"{a.name}.json").write_text(json.dumps(rows, indent=1))
            best = max(rows, key=lambda r: (r["mean_pipes"], r["mean_seconds"]))
            print("BEST", json.dumps(best))
        else:
            ss = seeds(a.seeds or "101-130")
            p = settings(a.set)
            out = {"settings": p, "seeds": a.seeds or "101-130", "easy": a.easy, "flies": a.flies, "dt": a.dt}
            brain_runs = [play(browser, brain, s, p, "brain", easy=a.easy) for s in ss]
            out["brain"] = summary(brain_runs)
            print("brain", json.dumps(out["brain"]), flush=True)
            rate = out["brain"]["flaps_per_s"]
            for mode in ["swapped", "random", "still"]:
                rs = [play(browser, brain, s, p, mode, random_rate=rate, easy=a.easy) for s in ss]
                out[mode] = summary(rs)
                print(mode, json.dumps(out[mode]), flush=True)
            out["per_seed"] = brain_runs
            (OUT / f"{a.name}.json").write_text(json.dumps(out, indent=1))
        browser.close()


if __name__ == "__main__":
    main()
