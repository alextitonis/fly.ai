"""JEPA world model from the drone's cameras, PLAN.md section 9. Step 0 so far: collecting the data.

    python drone/jepa.py collect --policy brain --seed 20001       # one forest patrol flown by the connectome, logged
    python drone/jepa.py collect --policy random --seed 20002      # one forest flight on random held commands, no brain
    python drone/jepa.py batch --first-seed 20001 --flights 40     # many, one at a time, each in its own process; skips done ones
    python drone/jepa.py stats                                     # how much is collected

What gets logged, every 0.2 s (one sample):
  frames   the drone's three forward cameras (front, and ahead_l / ahead_r at 45 degrees out), 64 x 48 by default: model input
  cmd      the command actually executed over the next 0.2 s (forward, climb, yaw_rate, averaged): model input
  start    True on the first sample after a take-off or a crash reset, so no prediction crosses it
  pose, vel, tree_*, fire_*, crash, source: FOR SCORING AND PROBES ONLY, never model input

Policies:
  brain    forest.py's patrol, the connectome flying (sensory_input=False, two forward cameras as in the forest test). With
           --explore (default 0.2) a share of the time our random held command replaces the brain's, so the predictor sees moves
           the brain wouldn't make. Those samples have source=1. The brain doesn't know; its own tracker drifts more as a result.
  random   no brain: random held commands, restarted at a random clear spot after each crash.
Seeds 20001 and up are for training data only. Tests use the 10001-10099 block in PLAN.md and never fly these forests.

Data goes to ~/fly-data/jepa (FLY_JEPA_DATA overrides), not drone/runs: the repo sits in OneDrive and gigabytes of frames would
sync. The JEPA and everything it learns is ours, not the connectome's (see PLAN.md section 9).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]

DATA = Path(os.environ.get("FLY_JEPA_DATA", Path.home() / "fly-data" / "jepa"))
SAMPLE_S = 0.2
CAMS = ("front", "ahead_l", "ahead_r")
AHEAD = np.radians(45)        # "ahead" for the nearest-tree label: within this of the heading
FORWARD = (0.0, 0.6)          # random commands: m/s
YAW = 1.5                     # rad/s either way
CLIMB_P, CLIMB = 0.15, 0.3    # sometimes climb or sink
HOLD = (0.4, 1.5)             # s a random command is held


def _wrap(a: float) -> float:
    return float((a + np.pi) % (2 * np.pi) - np.pi)


class Explorer:
    """Random held commands."""

    def __init__(self, rng: np.random.Generator):
        self.rng, self.until, self.cmd = rng, -1.0, {"forward": 0.0, "climb": 0.0, "yaw_rate": 0.0}

    def __call__(self, t: float) -> dict:
        if t >= self.until:
            r = self.rng
            climb = float(r.choice([-CLIMB, CLIMB])) if r.random() < CLIMB_P else 0.0
            self.cmd = {"forward": float(r.uniform(*FORWARD)), "climb": climb, "yaw_rate": float(r.uniform(-YAW, YAW))}
            self.until = t + float(r.uniform(*HOLD))
        return self.cmd


def logging_sim(base, policy: str, explore: float, width: int, height: int, seed: int):
    """A ForestSim subclass that records a sample every SAMPLE_S, and (policy brain) sometimes flies our random command instead."""

    class LogSim(base):
        def __init__(self, *a, **k):
            self.log = None
            super().__init__(*a, **k)
            self.log = {k: [] for k in ("frames", "cmd", "start", "pose", "vel", "tree_d", "tree_b", "ahead_d", "ahead_b", "fire_d", "fire_b", "crash", "source")}
            self.every = max(1, round(SAMPLE_S / self.dt))
            self.tick, self.acc, self.src_acc, self.fresh = 0, np.zeros(3), 0, True
            self.rng_x = np.random.default_rng(seed + 77000)
            self.explorer = Explorer(np.random.default_rng(seed + 78000))
            self.exploring_until, self.next_explore = -1.0, 0.0
            self.trees = np.array(self.plan["trees"]) if self.plan["trees"] else np.zeros((0, 2))
            if policy == "random":
                self.reset()                                 # a random start; reset() takes the first sample
            else:
                self._sample()

        def reset(self) -> None:
            super().reset()
            if getattr(self, "log", None) is None:
                return
            if policy == "random":                       # start somewhere new, facing anywhere
                import mujoco
                for _ in range(200):
                    from forest import HALF
                    p = self.rng_x.uniform(-HALF + 1, HALF - 1, 2)
                    if len(self.trees) == 0 or np.min(np.hypot(*(self.trees - p).T)) > 1.0:
                        break
                h = self.rng_x.uniform(-np.pi, np.pi)
                self.data.qpos[:2] = p
                self.data.qpos[3:7] = [np.cos(h / 2), 0, 0, np.sin(h / 2)]
                mujoco.mj_forward(self.model, self.data)
            self.fresh = True
            L = self.log
            if len(L["frames"]) > len(L["cmd"]) and self.tick > 0:   # a crash cut the window short: close it, so the crash stays in the data
                L["cmd"].append(self.acc / self.tick)
                L["source"].append(self.src_acc * 2 > self.tick)
            self.tick, self.acc, self.src_acc = 0, np.zeros(3), 0
            self._sample()

        def step(self, forward: float = 0.0, climb: float = 0.0, yaw_rate: float = 0.0) -> dict:
            if self.log is None or len(self.log["frames"]) == len(self.log["cmd"]):
                return super().step(forward, climb, yaw_rate)   # crashed and waiting for the reset: nothing to log
            src = 0
            if policy == "random":
                src = 1
            elif explore > 0:
                if self.t >= self.next_explore and self.t >= self.exploring_until:
                    if self.rng_x.random() < explore:     # spend about `explore` of the time on our command, in 1-2 s spells
                        self.exploring_until = self.t + self.rng_x.uniform(1.0, 2.0)
                    self.next_explore = self.t + 1.5
                if self.t < self.exploring_until:
                    src = 1
            if src:
                c = self.explorer(self.t)
                forward, climb, yaw_rate = c["forward"], c["climb"], c["yaw_rate"]
            out = super().step(forward, climb, yaw_rate)
            self.acc += (forward, climb, yaw_rate)
            self.src_acc += src
            self.tick += 1
            if out["crashed"]:
                self.log["crash"][-1] = True
            if self.tick >= self.every:
                n = len(self.log["cmd"])
                self.log["cmd"].append(self.acc / self.tick)
                self.log["source"].append(self.src_acc * 2 > self.tick)
                assert len(self.log["cmd"]) == n + 1 == len(self.log["frames"])
                self.tick, self.acc, self.src_acc = 0, np.zeros(3), 0
                if not out["crashed"]:                   # a crash resets the sim inside forest.fly (or our loop), which takes the next sample
                    self._sample()
            return out

        def _sample(self) -> None:
            L = self.log
            if len(L["frames"]) > len(L["cmd"]):           # the open sample never got its window (reset mid-window): replace it
                for k in ("frames", "start", "pose", "vel", "tree_d", "tree_b", "ahead_d", "ahead_b", "fire_d", "fire_b", "crash"):
                    L[k].pop()
            shots = self.eyes(width, height, names=CAMS)
            L["frames"].append(np.stack([shots[c] for c in CAMS]))
            L["start"].append(self.fresh)
            self.fresh = False
            p, h = self.pos, self.heading
            L["pose"].append([p[0], p[1], p[2], h])
            L["vel"].append(self.data.qvel[:3].copy())
            d, b = self._nearest(p, h, None)
            L["tree_d"].append(d)
            L["tree_b"].append(b)
            d, b = self._nearest(p, h, AHEAD)
            L["ahead_d"].append(d)
            L["ahead_b"].append(b)
            f = self.plan["fire"]
            if f is None:
                L["fire_d"].append(np.nan)
                L["fire_b"].append(np.nan)
            else:
                off = np.asarray(f) - p[:2]
                L["fire_d"].append(float(np.hypot(*off)))
                L["fire_b"].append(_wrap(float(np.arctan2(off[1], off[0])) - h))
            L["crash"].append(False)

        def _nearest(self, p, h, cone):
            from sim.world import PILLAR_RADIUS
            if len(self.trees) == 0:
                return np.nan, np.nan
            off = self.trees - p[:2]
            d = np.hypot(*off.T) - PILLAR_RADIUS
            b = (np.arctan2(off[:, 1], off[:, 0]) - h + np.pi) % (2 * np.pi) - np.pi
            ok = np.ones(len(d), bool) if cone is None else np.abs(b) <= cone
            if not ok.any():
                return np.nan, np.nan
            i = np.flatnonzero(ok)[np.argmin(d[ok])]
            return float(d[i]), float(b[i])

        def arrays(self) -> dict:
            L, n = self.log, len(self.log["cmd"])     # the last, open sample has no command yet: dropped
            out = {k: np.asarray(v[:n]) for k, v in L.items()}
            out["frames"] = out["frames"].astype(np.uint8)
            for k in ("cmd", "pose", "vel"):
                out[k] = out[k].astype(np.float32)
            for k in ("tree_d", "tree_b", "ahead_d", "ahead_b", "fire_d", "fire_b"):
                out[k] = out[k].astype(np.float32)
            return out

    return LogSim


def world_for(seed: int, policy: str) -> dict:
    """Variety across seeds, fixed by the seed so a rerun is the same. Not on seed parity: batch alternates policies by parity,
    and on batch 1 (20001-20040) that gave every brain flight green trees and every random one autumn trees.
    Brain flights stop once they hold at the fire (17-70 s on batch 1), so they get a fire on a third of seeds, random on two thirds."""
    r = np.random.default_rng(seed + 79000)
    return {"fire": bool(r.random() < (1 / 3 if policy == "brain" else 2 / 3)), "decoys": bool(r.random() < 0.5)}


def collect(a) -> Path:
    import forest
    if a.big:
        forest.big_world()
    w = world_for(a.seed, a.policy)
    LogSim = logging_sim(forest.ForestSim, a.policy, a.explore, a.width, a.height, a.seed)
    t0 = time.time()
    if a.policy == "brain":
        made = []

        class Caught(LogSim):
            def __init__(self, *x, **k):
                super().__init__(*x, **k)
                made.append(self)

            def close(self) -> None:                     # forest.fly closes the sim at the end: keep its log
                pass

        forest.ForestSim = Caught
        args = argparse.Namespace(seed=a.seed, seconds=a.seconds, rewire=False, big=a.big, real_fire=False, decoys=w["decoys"], no_fire=not w["fire"],
                                  cameras="two", sensory_input=False, turn_gain=forest.TURN_GAIN, avoid_gain=0.7, speed=0.55, out="")
        result = forest.fly(args)
        sim = made[-1]
    else:
        sim = LogSim(a.seed, w["decoys"], w["fire"])
        crashes = 0
        while sim.t < a.seconds:
            sim.step()                                   # the command comes from the explorer inside step()
            if sim.crashed:
                crashes += 1
                t = sim.data.time
                sim.reset()
                sim.data.time = t
        result = {"seed": a.seed, "crashes": crashes, "seconds": round(sim.t, 1)}
    arr = sim.arrays()
    DATA.mkdir(parents=True, exist_ok=True)
    out = DATA / f"forest{'_big' if a.big else ''}_{a.policy}_{a.seed}.npz"
    tmp = out.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, cams=np.array(CAMS), sample_s=SAMPLE_S, **arr)
    os.replace(tmp, out)
    meta = {"seed": a.seed, "policy": a.policy, "explore": a.explore if a.policy == "brain" else None, "big": a.big, **w,
            "samples": int(len(arr["cmd"])), "runs": int(arr["start"].sum()), "explored": round(float(arr["source"].mean()), 3),
            "size": [a.width, a.height], "wall_s": round(time.time() - t0, 1), "MB": round(out.stat().st_size / 1e6, 1),
            "flight": {k: result.get(k) for k in ("seconds", "crashes", "found", "legs_done", "median_drift", "stopped") if k in result}}
    out.with_suffix(".json").write_text(json.dumps(meta))
    print(json.dumps(meta))
    return out


def batch(a) -> None:
    """One flight at a time, each in a fresh process (a brain is 0.7 GB). Brain and random alternate unless --policy is given."""
    env = {**os.environ, "NUMBA_NUM_THREADS": os.environ.get("NUMBA_NUM_THREADS", "2"), "OMP_NUM_THREADS": os.environ.get("OMP_NUM_THREADS", "2")}
    for i in range(a.flights):
        seed = a.first_seed + i
        policy = a.policy or ("brain" if i % 2 == 0 else "random")
        out = DATA / f"forest{'_big' if a.big else ''}_{policy}_{seed}.npz"
        if out.exists():
            continue
        free = __import__("shutil").disk_usage(DATA.parent if DATA.parent.exists() else Path.home()).free / 1e9
        if free < a.min_free_gb:
            print(f"stopping: {free:.1f} GB free, under {a.min_free_gb}", flush=True)
            return
        cmd = [sys.executable, str(Path(__file__)), "collect", "--policy", policy, "--seed", str(seed), "--seconds", str(a.seconds),
               "--width", str(a.width), "--height", str(a.height), "--explore", str(a.explore)] + (["--big"] if a.big else [])
        r = subprocess.run(cmd, env=env, capture_output=True, text=True)
        last = (r.stdout.strip().splitlines() or [""])[-1]
        print(f"{seed} {policy} exit {r.returncode} {last}" + ("" if r.returncode == 0 else " | " + r.stderr.strip()[-400:]), flush=True)


def stats(a) -> None:
    rows = [json.loads(p.read_text()) for p in sorted(DATA.glob("*.json"))]
    by = {}
    for r in rows:
        b = by.setdefault(r["policy"], {"flights": 0, "samples": 0, "MB": 0.0, "wall_s": 0.0})
        b["flights"] += 1
        b["samples"] += r["samples"]
        b["MB"] += r["MB"]
        b["wall_s"] += r["wall_s"]
    print(json.dumps({"data": str(DATA), "by_policy": by, "samples": sum(b["samples"] for b in by.values()), "GB": round(sum(b["MB"] for b in by.values()) / 1e3, 2)}, indent=1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    for name in ("collect", "batch"):
        c = sub.add_parser(name)
        c.add_argument("--seconds", type=float, default=240.0)
        c.add_argument("--width", type=int, default=64)
        c.add_argument("--height", type=int, default=48)
        c.add_argument("--explore", type=float, default=0.2, help="brain flights: share of the time our random command flies instead")
        c.add_argument("--big", action="store_true", help="forest.py's 30 x 30 m forest")
        if name == "collect":
            c.add_argument("--policy", choices=("brain", "random"), required=True)
            c.add_argument("--seed", type=int, required=True)
        else:
            c.add_argument("--policy", choices=("brain", "random"), default=None)
            c.add_argument("--first-seed", type=int, default=20001)
            c.add_argument("--flights", type=int, default=40)
            c.add_argument("--min-free-gb", type=float, default=6.0)
    sub.add_parser("stats")
    sub.add_parser("pack")
    f = sub.add_parser("fit")
    f.add_argument("--name", required=True)
    f.add_argument("--fraction", type=float, default=1.0, help="share of the training flights (nested subsets)")
    f.add_argument("--steps", type=int, default=20000)
    f.add_argument("--batch", type=int, default=64)
    f.add_argument("--T", type=int, default=8, help="samples per window (0.2 s each)")
    f.add_argument("--dim", type=int, default=128)
    f.add_argument("--lr", type=float, default=3e-4)
    f.add_argument("--sigreg", type=float, default=1.0)
    f.add_argument("--ema", type=float, default=0.0, help="0 = end to end (LeWorldModel); e.g. 0.996 = EMA target encoder, the comparison")
    f.add_argument("--every", type=int, default=1000)
    f.add_argument("--seed", type=int, default=0)
    f.add_argument("--pool", choices=("mean", "cols"), default="mean")
    f.add_argument("--held-from", type=int, default=0, help="hold out every seed from here up (default: seeds ending in 0)")
    p = sub.add_parser("probe")
    p.add_argument("--models", nargs="+", required=True, help="the first one is the one the gate judges")
    p.add_argument("--cap", type=int, default=40000, help="probe training samples at most")
    p.add_argument("--pca-fit", type=int, default=8000)
    p.add_argument("--dim-pca", type=int, default=128)
    p.add_argument("--held-from", type=int, default=0)
    p.add_argument("--tag", default="", help="probe<tag>.json")
    hd = sub.add_parser("head", help="step 4: distance-ahead head on a model's latents")
    hd.add_argument("--model", default="cols")
    hd.add_argument("--C", type=float, default=0.1)
    a = ap.parse_args()
    if a.what in ("pack", "fit", "probe", "head"):
        import jepa_fit
        return getattr(jepa_fit, a.what)(a)
    if a.what == "collect":
        if a.seed < 20001:
            sys.exit("training data uses seeds 20001 and up; the test block is 10001-10099")
        collect(a)
    elif a.what == "batch":
        batch(a)
    else:
        stats(a)


if __name__ == "__main__":
    main()
