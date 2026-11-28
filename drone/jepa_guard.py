"""PLAN.md section 9, step 4: a crash guard fed by the camera, for forest.py's patrol. Ours, not the connectome's.

Every 0.2 s the guard sees the three forward cameras (64 x 48, as in training), encodes them with the JEPA, and keeps the last few
latents and the commands flown between them. It then imagines the next second twice with the predictor: once holding the brain's
current command, once braking (forward 0, same turn). The classifier head says how likely a trunk is within 0.8 m ahead in each
imagined latent. If the brain's course looks risky (peak over THR) and braking lowers the risk, it drives DNpe023 (the 11-19 brake
bench: 0.8 V stops it, MDN reads it as a brake) in proportion to the risk. The brain still does all the steering.

"plain" is the same brake with no JEPA: a trunk the pixel step (FireEyes, ours) sees within 0.8 m and 45 degrees ahead drives
DNpe023 by how close it is. Comparing the two tells whether the JEPA's look ahead is what helps.
"""
from __future__ import annotations

from collections import deque

import numpy as np

from jepa import CAMS, SAMPLE_S
from jepa_fit import CLOSE, CMD_SCALE, MODELS, build_model

HISTORY = 3          # latents of context (0.6 s); with 5 imagined steps that fills the predictor's 8 positions
AHEAD = 5            # imagined steps of 0.2 s: 1 s
CONE = np.radians(45)


class JepaGuard:
    def __init__(self, brain, model: str = "cols", volts: float = 0.8, thr: float = 0.5):
        import torch
        self.torch = torch
        ck = torch.load(MODELS / f"{model}.pt", map_location="cuda")
        cfg = ck["cfg"]
        Encoder, Predictor, _ = build_model(dim=cfg["dim"], T=cfg["T"], pool=cfg.get("pool", "mean"))
        self.enc, self.pred = Encoder().cuda().eval(), Predictor().cuda().eval()
        self.enc.load_state_dict(ck["enc"])
        self.pred.load_state_dict(ck["pred"])
        h = np.load(MODELS / f"{model}_head.npz")
        self.mu, self.sd = (torch.tensor(h[k], device="cuda") for k in ("mu", "sd"))
        self.w, self.b = torch.tensor(h["ccoef"], device="cuda"), float(h["cint"])
        self.cells = brain.cells(["DNpe023"])
        self.volts, self.thr = volts, thr
        self.every = max(1, round(SAMPLE_S / brain.dt))
        self.reset()
        self.decisions = self.braking = 0
        self.risk_log: list[tuple[float, float]] = []

    def reset(self) -> None:
        self.z: deque = deque(maxlen=HISTORY)
        self.a: deque = deque(maxlen=HISTORY)
        self.acc, self.n, self.drive, self.last_cmd = np.zeros(3), 0, 0.0, np.zeros(3)

    def _risk(self, zs):
        return self.torch.sigmoid(((zs - self.mu) / self.sd) @ self.w + self.b)

    def extra(self, sim) -> list:
        """Called before each brain step: the brake drive to inject (held for 0.2 s between decisions)."""
        torch = self.torch
        if self.n % self.every == 0:
            if self.n:                                            # the command flown since the last frame
                self.a.append(self.acc / self.every)
            self.acc[:] = 0
            shots = sim.eyes(64, 48, names=CAMS)
            x = torch.from_numpy(np.stack([shots[c] for c in CAMS])[None]).cuda()
            with torch.no_grad():
                z = self.enc(x).float()[0]
                self.z.append(z)
                self.drive = 0.0
                if len(self.a) >= len(self.z) - 1:
                    ctx = torch.stack(list(self.z))[None]
                    past = [torch.tensor(v / CMD_SCALE, dtype=torch.float32, device="cuda") for v in list(self.a)[-(len(self.z) - 1):]] if len(self.z) > 1 else []
                    now = self.last_cmd
                    brake = np.array([0.0, 0.0, now[2]])
                    peaks = []
                    for cand in (now, brake):
                        c = torch.tensor(cand / CMD_SCALE, dtype=torch.float32, device="cuda")
                        acts = torch.stack(past + [c] * AHEAD)[None]
                        fut = self.pred.rollout(ctx, acts)[0]
                        peaks.append(float(self._risk(fut).max()))
                    risk, risk_brake = peaks
                    self.decisions += 1
                    self.risk_log.append((round(risk, 3), round(risk_brake, 3)))
                    if risk > self.thr and risk_brake < risk:
                        self.drive = self.volts * risk
                        self.braking += 1
        self.n += 1
        return [(self.cells, self.drive)] if self.drive > 0 else []

    def record(self, cmd: dict) -> None:
        """Called with the command actually flown this brain step."""
        v = np.array([cmd["forward"], cmd["climb"], cmd["yaw_rate"]], float)
        self.acc += v
        self.last_cmd = v

    def stats(self) -> dict:
        return {"guard": "jepa", "decisions": self.decisions, "braked": round(self.braking / max(self.decisions, 1), 3)}


class PlainBrake:
    def __init__(self, brain, volts: float = 0.8):
        self.cells, self.volts = brain.cells(["DNpe023"]), volts
        self.steps = self.braking = 0
        self.trees: list = []

    def reset(self) -> None:
        self.trees = []

    def extra(self, sim) -> list:
        self.steps += 1
        near = [t.distance for t in self.trees if t.distance < CLOSE and abs(t.bearing) < CONE]
        if not near:
            return []
        self.braking += 1
        return [(self.cells, self.volts * (1 - min(near) / CLOSE))]

    def record(self, cmd: dict) -> None:
        pass

    def stats(self) -> dict:
        return {"guard": "plain", "braked": round(self.braking / max(self.steps, 1), 3)}


# ---------------------------------------------------------------- the head-on test in the forest (PLAN.md 9.4)

START_GAP = 1.5      # m from the trunk's centre at the start, aimed at it, as avoid.py run
OFFSET = 0.12        # m: sideways offset at most (it hits inside 18 cm)
GOAL_PAST = 2.5      # m: the patrol's pull, a goal this far beyond the trunk, through LC10a as forest.py passes its route
TRIAL_S = 8.0


def pick(rng, trees: np.ndarray, half: float):
    """A trunk and a direction with room: no other trunk near the line from the start to 1 m past it, start inside the forest."""
    for _ in range(5000):
        i = int(rng.integers(len(trees)))
        c = trees[i]
        ang = rng.uniform(-np.pi, np.pi)
        u = np.array([np.cos(ang), np.sin(ang)])
        start = c - START_GAP * u
        if np.max(np.abs(start)) > half - 1.0 or np.max(np.abs(c + 1.5 * u)) > half - 0.5:
            continue
        others = np.delete(trees, i, 0)
        rel = others - start
        along = rel @ u
        side = np.abs(rel @ np.array([-u[1], u[0]]))
        if np.any((along > -0.6) & (along < START_GAP + 1.2) & (side < 0.7)):
            continue
        return i, c, u, ang
    raise RuntimeError("no clear trunk")


def headon(a) -> dict:
    import mujoco

    import forest
    import pilot as pilot_module
    from avoid import AVOID_TYPES, TurnAway
    from eyes import ALL_CAMERAS, use_cameras
    from flybrain import FlyBrain
    from flytalk import rewire
    from follow import TURN_GAIN, FollowPilot, FollowSenses
    from predict import Tracker
    from sim import CRUISE, Thing
    from sim.world import PILLAR_RADIUS

    brain = FlyBrain(seed=a.seed, sensory_input=False)        # the patrol's brain and settings (forest.py fly defaults)
    if a.rewire:
        rewire(brain, seed=a.seed + 1000)
    pilot_module.TURN_GAIN = TURN_GAIN
    senses, pilot = FollowSenses(brain), FollowPilot(brain)
    for _ in range(100):
        pilot.observe(brain.step())
    sim = forest.ForestSim(a.seed, decoys=False, fire=False)
    cameras = {"ahead_l": np.pi / 4, "ahead_r": -np.pi / 4}
    ALL_CAMERAS.update(cameras)
    use_cameras(tuple(cameras))
    eyes = forest.FireEyes((0, 0, 0), seed=a.seed)
    turner = TurnAway(brain, AVOID_TYPES, 0.7)
    guard = JepaGuard(brain, a.model, a.volts, a.thr) if a.guard == "jepa" else PlainBrake(brain, a.volts) if a.guard == "plain" else None
    trees = np.array(sim.plan["trees"])
    rng = np.random.default_rng(a.seed + 91000)
    ticks = round(brain.dt / sim.dt)
    out = []
    for trial in range(a.trials):
        i, c, u, ang = pick(rng, trees, forest.HALF)
        off = rng.uniform(-OFFSET, OFFSET) * np.array([-u[1], u[0]])
        sim.reset()
        sim.data.qpos[:2] = c - START_GAP * u + off
        sim.data.qpos[3:7] = [np.cos(ang / 2), 0, 0, np.sin(ang / 2)]
        mujoco.mj_forward(sim.model, sim.data)
        sim.control.reset(CRUISE)
        senses.leader_size, senses.pillars = None, []
        pilot.jump_until = -1.0
        tracker = Tracker()
        if guard is not None:
            guard.reset()
        start_p, start = sim.pos[:2].copy(), sim.t
        goal = np.array([START_GAP + GOAL_PAST, 0.0])               # in the tracker's frame: straight on, past the trunk
        n, seen, visible, closest, result, steps, stopped = 0, [], [], 9.0, "stall", 0, 0
        brake0 = getattr(guard, "braking", 0)
        while sim.t - start < TRIAL_S:
            if n % 2 == 0:
                shots = sim.eyes(names=tuple(cameras))
                visible = [t for t in eyes.things(shots) if t.kind == "pillar"]
                seen = visible if not a.blind else []          # --blind hides the trunks from the brain only: the plain brake still gets the pixel step
            n += 1
            d = goal - tracker.pose
            target = Thing("leader", float((np.arctan2(d[1], d[0]) - tracker.h + np.pi) % (2 * np.pi) - np.pi), float(np.hypot(*d)), forest.TARGET_SIZE)
            if guard is not None:
                guard.trees = visible
            fired = brain.step(None, senses.inject(seen + [target], match_pillars=True) + (guard.extra(sim) if guard is not None else []))
            pilot.observe(fired)
            cmd = pilot.command(sim.t, sim.pos[2])
            turner.observe(fired)
            cmd["yaw_rate"] += turner.yaw()
            cmd["forward"] = min(cmd["forward"], 0.55)
            if guard is not None:
                guard.record(cmd)
            tracker.move(cmd, brain.dt)
            steps += 1
            stopped += cmd["forward"] == 0.0
            for _ in range(ticks):
                sim.step(**cmd)
            p = sim.pos[:2]
            gaps = np.hypot(*(trees - p).T) - PILLAR_RADIUS
            closest = min(closest, float(gaps[i]))
            if sim.crashed:
                result = "hit" if gaps.min() < 0.1 else "other"
                break
            if (p - start_p) @ u > START_GAP + 1.0 or np.hypot(*(p - c)) > 2.5:
                result = "pass"
                break
        out.append({"result": result, "tree": i, "closest": round(closest, 3), "seconds": round(sim.t - start, 2), "stopped": round(stopped / max(steps, 1), 3),
                    "braked": getattr(guard, "braking", 0) - brake0})
    res = [o["result"] for o in out]
    return {"seed": a.seed, "guard": a.guard, "rewired": a.rewire, "blind": a.blind, "volts": a.volts, "thr": a.thr, "trials": len(out),
            "hit": res.count("hit"), "pass": res.count("pass"), "stall": res.count("stall"), "other": res.count("other"), "runs": out}


def score(folder: str, seeds: list[int]) -> dict:
    """The rule fixed in PLAN.md 9.4 before the test flew. 95% bootstrap over trials."""
    import json
    from pathlib import Path
    root = Path(__file__).resolve().parent / "runs" / "jepa_guard" / folder
    trials = {}
    for g in ("none", "plain", "jepa", "jepa_rewired"):
        rows = []
        for sd in seeds:
            f = root / f"{g}_{sd}.json"
            if f.exists() and f.stat().st_size:
                rows += [o["result"] for o in json.loads(f.read_text())["runs"]]
        trials[g] = np.array(rows)
    rng = np.random.default_rng(0)

    def rate(x, what):
        return float((x == what).mean()) if len(x) else float("nan")

    def interval(x, y, what):                       # rate(x) - rate(y)
        d = [rate(rng.choice(x, len(x)), what) - rate(rng.choice(y, len(y)), what) for _ in range(5000)]
        return [round(float(np.quantile(d, 0.025)), 3), round(float(np.quantile(d, 0.975)), 3)]

    out = {g: {"n": int(len(x)), **{w: round(rate(x, w), 3) for w in ("hit", "pass", "stall", "other")}} for g, x in trials.items()}
    n, p, j = trials["none"], trials["plain"], trials["jepa"]
    safer = interval(n, j, "hit")
    beats = interval(p, j, "hit")
    out["SAFER"] = {"jepa_hits_vs_none": [out["jepa"]["hit"], out["none"]["hit"]], "interval_none_minus_jepa": safer,
                    "PASS": out["jepa"]["hit"] <= 0.5 * out["none"]["hit"] and safer[0] > 0}
    out["BEATS_PLAIN"] = {"jepa_hits_vs_plain": [out["jepa"]["hit"], out["plain"]["hit"]], "interval_plain_minus_jepa": beats,
                          "PASS": out["jepa"]["hit"] < out["plain"]["hit"] and beats[0] > 0}
    return out


def main() -> None:
    import argparse
    import json
    ap = argparse.ArgumentParser(description="PLAN.md 9.4: head-on trunk trials in the forest, with or without a guard")
    ap.add_argument("what", choices=("headon", "score"))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--folder", default="headon_test")
    ap.add_argument("--first-seed", type=int, default=10011)
    ap.add_argument("--seeds", type=int, default=8)
    ap.add_argument("--trials", type=int, default=15)
    ap.add_argument("--guard", choices=("none", "jepa", "plain"), default="none")
    ap.add_argument("--model", default="cols")
    ap.add_argument("--volts", type=float, default=0.8)
    ap.add_argument("--thr", type=float, default=0.5)
    ap.add_argument("--rewire", action="store_true")
    ap.add_argument("--blind", action="store_true", help="no trunks given to the brain")
    a = ap.parse_args()
    if a.what == "score":
        print(json.dumps(score(a.folder, list(range(a.first_seed, a.first_seed + a.seeds))), indent=1))
        return
    if a.seed < 10001 or a.seed > 10099:
        raise SystemExit("head-on trials use the test block 10001-10099")
    print(json.dumps(headon(a)))


if __name__ == "__main__":
    import sys as _sys
    from pathlib import Path as _P
    _sys.path[:0] = [str(_P(__file__).resolve().parent), str(_P(__file__).resolve().parent.parent)]
    main()
