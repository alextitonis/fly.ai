"""Can the fly steer around obstacles? Today a close pillar only makes it stop and jump (DNp01); nothing turns it away.

    python drone/avoid.py screen --seed 7401                 # which descending neurons answer a pillar on one side
    python drone/avoid.py fly --mode turn --seed 7701        # one measured flight, JSON on the last line

Stage 1, the screen (development seeds, 7401-7402, nothing trained): LPLC2 (looming) or LC4 (threat) on one side, then every
descending-neuron type left and right. A type qualifies if the same side answers on both seeds, mirrored when the pillar is on the
other side, by at least MIN_HZ. Which way that should turn the drone is read from which side fires relative to the pillar. That
meaning is ours, as with the wind neurons and DNg41; the firing is the connectome's.

Stage 2, flight, seeds 7701-7708: the camera follower with a leader to chase and 8 pillars placed by the seed, 60 s each. Modes:
  blind   pillars removed from what the brain gets
  stop    today's: pillars drive LPLC2 and LC4, DNp01 stops and jumps
  turn    the same, plus the screen's neurons turn it
  --rewire scrambles the wiring under any of them
On dev seeds these flights barely touched a pillar even with 16 and blind, since the leader's route stays clear, so they're reported only.

Stage 3, `run`: the real test. The drone starts 1.5 m from a pillar, aimed at it, with up to 12 cm of sideways offset (it hits inside
18 cm), and nothing else in view. A trial ends in a hit, a pass (1 m beyond), or a stall (8 s, neither).
Gain from seeds 7751-7752. Rules fixed before running, seeds 7801-7804, 15 trials each, 95% bootstrap over trials:
  AVOIDS      turn hits at most 0.5x blind, interval on the difference above 0
  BEATS_STOP  turn passes at least 20 points over stop
  WIRING      turn passes at least 20 points over turn on scrambled wiring

Stage 4, the stall: over half of those trials hold still for 8 s, since a close pillar keeps firing DNp01 and each burst stops it. `--cooldown` (ours) lets the drone keep going for that many seconds after a jump before DNp01 can stop it again. On dev seeds 7751-7752 cooldowns cut "stalls" (73% to 60%, and 77% to 37% on the bench's brain), but those trials are only stopped about 6% of the time: they've turned about 3.8 rad and wander near the pillar, since nothing gives them a reason to go on.
`--goal` (ours) adds one: a destination 2.5 m past the pillar by dead reckoning, through LC10a, as forest.py passes its route. Alone it pulled the drone back into the pillar (hits 33-53%), so `--yield-near` (ours) drops that pull while a pillar is close ahead.
Settings from dev seeds, 30 trials each: gain 0.7, cooldown 2, yield 0.8 m, default brain: 73% passed, 17% hit, 10% neither.

Stage 5, the test. Those settings, seeds 9601-9604, 15 trials each, NUMBA_NUM_THREADS=2. All with the goal: turn; stop, the same with the connectome's turning neurons not read; blind, no pillars given to the brain; turn on scrambled wiring. Rules fixed before running, 95% bootstrap over trials, runs/avoid/test2/score.py:
  GETS_PAST  turn passes at least 60%, at least 20 points over stop, interval above 0
  SAFE       turn hits at most 25%, and at most 0.5x blind, interval on the difference above 0
  WIRING     turn passes at least 20 points over scrambled, interval above 0
Result 2026-11-02: 1 of 3. Passed 48% (stop 37%, +12, -5 to +28: MISS), hit 37% (blind 52%, 15 fewer, -3 to +32: MISS), over scrambled +45 (PASS). Dev's 73% didn't hold: blind gets past just as often. Seeds 9601-9604 are used up.

Stage 6, capped drive (PLAN.md 8.1). `dose` (bench, seed 7401): one side's LC4 at 0.05-0.15 V drives the turn-away DNs over DEAD in
42-86% of 0.5 s windows while the pilot's jump rule never fires (it fires from ~0.2 V; LPLC2 from ~0.4 V). Pillars used to drive LC4 up
to 0.8 V, so a close pillar jumped on every look: the stall. `--threat-max 0.15 --loom-max 0.2` keep the drive in that range.
Test 3 (rules in runs/avoid/test3/RULES.md, fixed before flying; seeds 9971-9974, 15 trials each, gain 0.7, no goal, no cooldown):
  cap 60% pass, 3% hit, 37% stall; uncapped 40% / 0% / 60%; blind 62% / 27% / 12%; cap on scrambled wiring 0% / 0% / 100%.
  GETS_PAST on the line: 36 vs 24 of 60 passes, exactly +20 points (+3 to +37); score.py prints MISS from float rounding (0.1999...).
  SAFE PASS (hits 3% vs blind 27%, +12 to +35). WIRING PASS (+60, +48 to +72). Seed 9971 alone passed 4/15. Seeds 9971-9974 are used up.

Stage 7, caps + a weak goal (PLAN.md 8.3). `goalbench` (bench, seed 7401): the goal through PFL3 steers weaker and lopsided than LC10a and
also drives the turn-away DNs, so it isn't a separate route; a weaker LC10a goal (`--goal-volts 0.3`) did best on dev (20/24, 1 hit).
Test 4 (runs/avoid/test4/RULES.md; seeds 9981-9984, used up): goal 70% pass / 25% hit / 5% stall; same without the goal 70% / 0% / 30%;
blind with the goal 68% / 25% / 7%; scrambled 0% / 0% / 100%. 1 of 3: GETS_PAST MISS (+0 over no goal), SAFE MISS (hits = blind),
WIRING PASS. Dev's 1 hit in 24 didn't hold. With any goal on a head-on pillar the drone's hits equal flying blind.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import mujoco
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from eyes import PixelEyes  # noqa: E402
from events import Events  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
from flybrain.eyes import FeatureDetectors  # noqa: E402
from flytalk import rewire  # noqa: E402
from follow import TURN_GAIN, FollowPilot, FollowSenses  # noqa: E402
import pilot as pilot_module  # noqa: E402
from predict import Tracker  # noqa: E402
from sim import ARENA, CRUISE, DroneSim, Thing  # noqa: E402
from sim.world import BEACONS, PILLAR_RADIUS  # noqa: E402

OUT = HERE / "runs" / "avoid"
MIN_HZ = 3.0
FLIES, WARM, STIM = 16, 25, 50
# From the screen, seeds 7401-7402: fire more on the side away from the pillar, repeating on both seeds in loom 0.8, threat 0.4 and 0.8.
# -1 = away. Read like DNa02, turn toward the side that fires more, so this turns it away from the pillar.
AVOID_TYPES = {"DNg01": -1, "DNa07": -1, "DNae004": -1}
DEAD = 4.0                            # spikes in the window: DNg01 rests near 17 Hz, so smaller differences are its noise
AVOID_GAIN = 0.25                     # rad/s per spike in the window, from the screen's flights on dev seeds


def screen(a) -> None:
    brain = FlyBrain(batch=FLIES, seed=a.seed)
    fd = FeatureDetectors(brain)
    channels = {"loom": fd.loom, "threat": fd.cells["threat"]}
    sc, ct, side = brain.superclass.astype(str), brain.cell_type.astype(str), brain.side.astype(str)
    dn = np.flatnonzero(np.isin(sc, ["descending_neuron", "descending_neuron_tbc"]))
    types = sorted(set(ct[dn]))
    idx = {t: {s: dn[(ct[dn] == t) & (side[dn] == s)] for s in "LR"} for t in types}

    def hz(inject, seed: int) -> dict:
        brain.reset(seed)
        for _ in range(WARM):
            brain.step()
        total = np.zeros((FLIES, brain.n), np.int32)
        for _ in range(STIM):
            for f, x in enumerate(brain.step(None, inject=inject)):
                total[f, x] += 1
        rate = total / (STIM * brain.dt)
        return {t: {s: float(rate[:, idx[t][s]].sum(1).mean()) if len(idx[t][s]) else 0.0 for s in "LR"} for t in types}

    rest = hz([], a.seed)
    res = {}
    for name, cells in channels.items():
        for v in (0.4, 0.8):
            l, r = hz([(cells["L"], v)], a.seed + 1), hz([(cells["R"], v)], a.seed + 2)
            rows = []
            for t in types:
                # pillar on the left: (left DN - right DN), and the mirror. Same sign and size on both = a side-true neuron
                on_l = (l[t]["L"] - l[t]["R"]) - (rest[t]["L"] - rest[t]["R"])
                on_r = (r[t]["R"] - r[t]["L"]) - (rest[t]["R"] - rest[t]["L"])
                if np.sign(on_l) == np.sign(on_r) and min(abs(on_l), abs(on_r)) >= MIN_HZ:
                    rows.append((t, round(on_l, 1), round(on_r, 1), round(rest[t]["L"] + rest[t]["R"], 1)))
            res[f"{name} {v}"] = sorted(rows, key=lambda x: -min(abs(x[1]), abs(x[2])))
            print(name, v, res[f"{name} {v}"][:12], flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"screen{a.seed}.json").write_text(json.dumps(res, indent=1))


DOSES = (0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.4, 0.8)
GRADED = ("DNp04", "DNp02", "DNg40", "DNp11", "DNp03")    # notebooks/escape_response.ipynb: rise smoothly on the looming side


def dose(a) -> dict:
    """Bench, no flight (PLAN.md 8.1): one side's LPLC2 (loom) or LC4 (threat) at each volt level, as Senses.inject feeds them.
    Per level: how often the pilot's jump rule (>= ESCAPE_SPIKES DNp01 spikes in ESCAPE_WINDOW steps) would fire in the STIM
    window, DNp01 Hz on each side, the TurnAway signal (spikes in a 0.5 s window, + = 'pillar on the left') and the graded DNs.
    The question: is there a range where the turn-away neurons answer but DNp01 doesn't jump yet?"""
    brain = FlyBrain(batch=FLIES, seed=a.seed, sensory_input=a.sensory_input)
    fd = FeatureDetectors(brain)
    channels = {"loom": fd.loom, "threat": fd.cells["threat"]}
    esc = {s: brain.cells(["DNp01"], s) for s in "LR"}
    turn = [(brain.cells([t], "L"), brain.cells([t], "R"), sign) for t, sign in AVOID_TYPES.items()]
    graded = {t: {s: brain.cells([t], s) for s in "LR"} for t in GRADED}
    W = pilot_module.ESCAPE_WINDOW

    def trial(inject) -> dict:
        brain.reset(a.seed)
        for _ in range(WARM):
            brain.step()
        e = np.zeros((STIM, FLIES), np.int32)            # DNp01 spikes per step, either side
        el, er = np.zeros(FLIES), np.zeros(FLIES)
        tw = np.zeros((STIM, FLIES))
        g = {t: {s: np.zeros(FLIES) for s in "LR"} for t in GRADED}
        mask = np.zeros(brain.n, bool)
        for k in range(STIM):
            for f, x in enumerate(brain.step(None, inject=inject)):
                mask[:] = False
                mask[x] = True
                l, r = int(mask[esc["L"]].sum()), int(mask[esc["R"]].sum())
                e[k, f], el[f], er[f] = l + r, el[f] + l, er[f] + r
                tw[k, f] = sum(s * (int(mask[cl].sum()) - int(mask[cr].sum())) for cl, cr, s in turn)
                for t in GRADED:
                    for s in "LR":
                        g[t][s][f] += int(mask[graded[t][s]].sum())
        roll = np.array([e[max(0, k - W + 1):k + 1].sum(0) for k in range(STIM)])
        jump = (roll >= pilot_module.ESCAPE_SPIKES).any(0)
        win = pilot_module.WINDOW
        turn_win = np.array([tw[max(0, k - win + 1):k + 1].sum(0) for k in range(win - 1, STIM)])   # full 0.5 s windows
        sec = STIM * brain.dt
        return {"jump": float(jump.mean()), "dnp01_L": float(el.mean() / sec), "dnp01_R": float(er.mean() / sec),
                "turn": float(turn_win.mean()), "turn_sd": float(turn_win.mean(0).std(ddof=1)),
                "turn_over_dead": float((np.abs(turn_win) >= DEAD).mean()),
                **{f"{t}_{s}": float(g[t][s].mean() / sec) for t in GRADED for s in "LR"}}

    out = {"seed": a.seed, "sensory_input": a.sensory_input, "flies": FLIES, "stim_steps": STIM, "rest": trial([])}
    print("rest", {k: round(v, 2) for k, v in out["rest"].items()}, flush=True)
    for name, cells in channels.items():
        for v in DOSES:
            r = trial([(cells["L"], v)])                   # pillar on the left: TurnAway should read +
            out[f"{name} {v}"] = r
            print(f"{name:6s} {v:5.3f}  jump {r['jump']:.2f}  DNp01 L {r['dnp01_L']:5.1f} R {r['dnp01_R']:5.1f}  "
                  f"turn {r['turn']:+6.2f} (|turn|>=DEAD {r['turn_over_dead']:.2f})  DNp04 L {r['DNp04_L']:5.1f}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"dose{a.seed}{'' if a.sensory_input else '_nosens'}.json").write_text(json.dumps(out, indent=1))
    return out


def goalbench(a) -> dict:
    """Bench, no flight (PLAN.md 8.3): the goal through PFL3 (central complex, notebooks/walking_inputs.ipynb: PFL3 L -> DNa02 R)
    against LC10a (today's goal, a chase signal). One side at each volt level; per level the pilot's steer (DNa02 left minus right,
    spikes in a 0.5 s window, + = turns left), how often the jump rule fires, and the TurnAway signal (+ = 'pillar on the left')."""
    brain = FlyBrain(batch=FLIES, seed=a.seed, sensory_input=a.sensory_input)
    fd = FeatureDetectors(brain)
    chans = {"PFL3": {s: brain.cells(["PFL3"], s) for s in "LR"}, "LC10a": fd.chase}
    steer = {s: brain.cells(["DNa02"], s) for s in "LR"}
    esc = brain.cells(["DNp01"])
    turn = [(brain.cells([t], "L"), brain.cells([t], "R"), sign) for t, sign in AVOID_TYPES.items()]
    win = pilot_module.WINDOW

    def trial(inject) -> dict:
        brain.reset(a.seed)
        for _ in range(WARM):
            brain.step()
        st, tw, e = np.zeros((STIM, FLIES)), np.zeros((STIM, FLIES)), np.zeros((STIM, FLIES))
        mask = np.zeros(brain.n, bool)
        for k in range(STIM):
            for f, x in enumerate(brain.step(None, inject=inject)):
                mask[:] = False
                mask[x] = True
                st[k, f] = int(mask[steer["L"]].sum()) - int(mask[steer["R"]].sum())
                tw[k, f] = sum(s * (int(mask[cl].sum()) - int(mask[cr].sum())) for cl, cr, s in turn)
                e[k, f] = int(mask[esc].sum())
        w = lambda x: np.array([x[k - win + 1:k + 1].sum(0) for k in range(win - 1, STIM)])   # noqa: E731
        roll = np.array([e[max(0, k - pilot_module.ESCAPE_WINDOW + 1):k + 1].sum(0) for k in range(STIM)])
        sw = w(st)
        return {"steer": float(sw.mean()), "steer_sd_flies": float(sw.mean(0).std(ddof=1)), "turn_away": float(w(tw).mean()),
                "jump": float((roll >= pilot_module.ESCAPE_SPIKES).any(0).mean())}

    out = {"seed": a.seed, "sensory_input": a.sensory_input, "rest": trial([])}
    print("rest", {k: round(v, 2) for k, v in out["rest"].items()}, flush=True)
    for name, cells in chans.items():
        print(name, "cells L/R", len(cells["L"]), len(cells["R"]), flush=True)
        for side in "LR":
            for v in (0.1, 0.2, 0.4, 0.8):
                r = trial([(cells[side], v)])
                out[f"{name} {side} {v}"] = r
                print(f"{name:5s} {side} {v:.1f}  steer {r['steer']:+6.2f} (sd over flies {r['steer_sd_flies']:.2f})  "
                      f"turn_away {r['turn_away']:+5.2f}  jump {r['jump']:.2f}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"goalbench{a.seed}.json").write_text(json.dumps(out, indent=1))
    return out


def brakebench(a) -> dict:
    """Bench, no flight (PLAN.md 8.4): DNpe023 -> MDN (notebooks/walking_inputs.ipynb) as a brake. Per drive: MDN spikes in the pilot's
    0.5 s window (forward = CRUISE_SPEED - BRAKE_GAIN * that, so 4 spikes is a full stop), the steer (DNa02 L-R), the TurnAway signal
    and the jump rule; and the capped pillar alone (LC4 0.15 V on the left) for comparison."""
    brain = FlyBrain(batch=FLIES, seed=a.seed, sensory_input=a.sensory_input)
    fd = FeatureDetectors(brain)
    pe = {s: brain.cells(["DNpe023"], s) for s in "LR"}
    mdn = brain.cells(["MDN"])
    steer = {s: brain.cells(["DNa02"], s) for s in "LR"}
    esc = brain.cells(["DNp01"])
    turn = [(brain.cells([t], "L"), brain.cells([t], "R"), sign) for t, sign in AVOID_TYPES.items()]
    win = pilot_module.WINDOW

    def trial(inject) -> dict:
        brain.reset(a.seed)
        for _ in range(WARM):
            brain.step()
        m, st, tw, e = (np.zeros((STIM, FLIES)) for _ in range(4))
        mask = np.zeros(brain.n, bool)
        for k in range(STIM):
            for f, x in enumerate(brain.step(None, inject=inject)):
                mask[:] = False
                mask[x] = True
                m[k, f] = int(mask[mdn].sum())
                st[k, f] = int(mask[steer["L"]].sum()) - int(mask[steer["R"]].sum())
                tw[k, f] = sum(s * (int(mask[cl].sum()) - int(mask[cr].sum())) for cl, cr, s in turn)
                e[k, f] = int(mask[esc].sum())
        w = lambda x: np.array([x[k - win + 1:k + 1].sum(0) for k in range(win - 1, STIM)])   # noqa: E731
        roll = np.array([e[max(0, k - pilot_module.ESCAPE_WINDOW + 1):k + 1].sum(0) for k in range(STIM)])
        mw = w(m)
        speed = np.clip(pilot_module.CRUISE_SPEED - pilot_module.BRAKE_GAIN * mw, 0, None)
        return {"mdn": float(mw.mean()), "speed": float(speed.mean()), "stopped": float((speed == 0).mean()),
                "steer": float(w(st).mean()), "turn_away": float(w(tw).mean()), "jump": float((roll >= pilot_module.ESCAPE_SPIKES).any(0).mean())}

    out = {"seed": a.seed, "sensory_input": a.sensory_input}
    conds = [("rest", [])] + [(f"DNpe023 {s} {v}", [(pe[s], v)]) for s in ("L", "R") for v in (0.1, 0.2, 0.4, 0.8)]
    conds += [(f"DNpe023 both {v}", [(np.concatenate([pe["L"], pe["R"]]), v)]) for v in (0.1, 0.2, 0.4, 0.8)]
    conds += [("pillar L (LC4 0.15)", [(fd.cells["threat"]["L"], 0.15)]),
              ("pillar L + DNpe023 both 0.4", [(fd.cells["threat"]["L"], 0.15), (np.concatenate([pe["L"], pe["R"]]), 0.4)])]
    for name, inj in conds:
        r = trial(inj)
        out[name] = r
        print(f"{name:28s} MDN {r['mdn']:5.2f}  speed {r['speed']:.2f} m/s (stopped {r['stopped']:.2f})  steer {r['steer']:+5.2f}  "
              f"turn_away {r['turn_away']:+5.2f}  jump {r['jump']:.2f}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"brakebench{a.seed}.json").write_text(json.dumps(out, indent=1))
    return out


def scatter_pillars(seed: int, n: int = 8, gap: float = 1.0) -> list[tuple[float, float]]:
    rng = np.random.default_rng(seed + 90000)
    out: list[tuple[float, float]] = []
    for _ in range(20000):
        if len(out) == n:
            break
        p = rng.uniform(-ARENA + 0.5, ARENA - 0.5, 2)
        # the drone restarts at the middle and the leader starts at (0.8, 0): both must start clear
        if np.hypot(*p) > 0.9 and np.hypot(p[0] - 0.8, p[1]) > 0.9 and all(np.hypot(*(p - np.array(q))) > gap for q in out):
            out.append((float(p[0]), float(p[1])))
    return out


class TurnAway:
    """Spikes in AVOID_TYPES -> a yaw away from the side the pillar looks to be on."""

    def __init__(self, brain, types: dict[str, int], gain: float):
        self.gain = gain
        self.groups = [(brain.cells([t], "L"), brain.cells([t], "R"), sign) for t, sign in types.items()]
        self.mask = np.zeros(brain.n, bool)
        self.hist: list[float] = []

    def observe(self, fired: np.ndarray) -> None:
        self.mask[:] = False
        self.mask[fired] = True
        # + = pillar on the left, by the screen's sign
        self.hist = (self.hist + [sum(s * (int(self.mask[l].sum()) - int(self.mask[r].sum())) for l, r, s in self.groups)])[-pilot_module.WINDOW:]

    def yaw(self) -> float:
        total = float(sum(self.hist))
        return 0.0 if abs(total) < DEAD else -self.gain * total    # pillar on the left -> turn right, which is negative yaw


def fly(a) -> dict:
    brain = FlyBrain(seed=a.seed)
    if a.rewire:
        rewire(brain, seed=a.seed + 1000)
    pilot_module.TURN_GAIN = TURN_GAIN
    senses, pilot = FollowSenses(brain), FollowPilot(brain)
    for _ in range(100):
        pilot.observe(brain.step())
    pillars = scatter_pillars(a.seed, a.pillars, a.gap)
    sim = DroneSim(seed=a.seed, n_fruit=0, gusts=False, leader=True, decoy=True, pillars=pillars)
    pixels = PixelEyes(BEACONS["leader"], seed=a.seed)
    turner = TurnAway(brain, AVOID_TYPES, a.gain if a.gain is not None else AVOID_GAIN) if a.mode == "turn" else None
    bus = Events(cooldown=1.0)
    ticks = round(brain.dt / sim.dt)
    dist, hits, walls, n, stops, near, things = [], 0, 0, 0, 0, [], []
    while sim.t < a.seconds:
        if n % 2 == 0:
            things = pixels.things(sim.eyes())
            for t in things:
                if t.kind == "pillar" and t.distance < pilot_module.THREAT_NEAR and abs(t.bearing) < np.radians(70):
                    bus.emit("obstacle_ahead", t=sim.t, key="ahead", bearing=t.bearing, distance=t.distance)
        n += 1
        feed = [t for t in things if t.kind != "pillar"] if a.mode == "blind" else things
        fired = brain.step(None, senses.inject(feed, match_pillars=True))
        pilot.observe(fired)
        cmd = pilot.command(sim.t, sim.pos[2])
        if turner is not None:
            turner.observe(fired)
            cmd["yaw_rate"] += turner.yaw()
        for _ in range(ticks):
            sim.step(**cmd)
        p = sim.pos
        dist.append(float(np.hypot(*(sim.leader.pos[:2] - p[:2]))))
        near.append(min(float(np.hypot(p[0] - x, p[1] - y)) - PILLAR_RADIUS for x, y in pillars))
        stops += cmd["forward"] == 0.0
        if sim.crashed:
            if min(np.hypot(p[0] - x, p[1] - y) for x, y in pillars) < PILLAR_RADIUS + 0.1:
                hits += 1
            else:
                walls += 1
            bus.emit("crash", t=sim.t)
            t = sim.data.time
            sim.reset()
            sim.data.time = t
            senses.leader_size, senses.pillars, things = None, [], []
    sim.close()
    minutes = a.seconds / 60
    return {"mode": a.mode, "rewired": a.rewire, "seed": a.seed, "seconds": a.seconds, "pillar_hits_min": round(hits / minutes, 2), "other_crashes_min": round(walls / minutes, 2),
            "mean_distance": round(float(np.mean(dist)), 3), "within_1m": round(float(np.mean(np.array(dist) < 1.0)), 3), "stopped": round(stops / len(dist), 3),
            "closest_share_under_30cm": round(float(np.mean(np.array(near) < 0.3)), 3), "events": dict(bus.counts)}


class CoolPilot(FollowPilot):
    """After a jump DNp01 can't stop it again for cooldown seconds: ours, so it can move past what set the jump off."""
    cooldown = 0.0
    free_until = -1.0

    def command(self, t: float, z: float) -> dict:
        if self.jump_until <= t < self.free_until:
            held, self.jump_until = self.jump_until, 1e9       # blocks a new jump inside Pilot.command; forward is put back below
            cmd = super().command(t, z)
            self.jump_until = held
            cmd["forward"] = max(0.0, pilot_module.CRUISE_SPEED - pilot_module.BRAKE_GAIN * self.count("backward_L", "backward_R"))
            cmd["forward"] = min(cmd["forward"], 0.55)
            cmd["climb"] = 1.0 * (CRUISE - z)
            return cmd
        was = self.jump_until
        cmd = super().command(t, z)
        if self.jump_until != was:
            self.free_until = self.jump_until + self.cooldown
        return cmd


def run(a) -> dict:
    brain = FlyBrain(seed=a.seed, sensory_input=a.sensory_input)
    if a.rewire:
        rewire(brain, seed=a.seed + 1000)
    pilot_module.TURN_GAIN = TURN_GAIN if a.goal else 0.5       # pilot.py's own gain: follow.py's 1.5 is for chasing, and with nothing to chase its noise spins the drone
    senses, pilot = FollowSenses(brain), CoolPilot(brain)
    pilot.cooldown = a.cooldown
    senses.loom_cap = a.loom_max if a.loom_max is not None else senses.loom_cap
    senses.threat_cap = a.threat_max if a.threat_max is not None else senses.threat_cap
    for _ in range(100):
        pilot.observe(brain.step())
    sim = DroneSim(seed=a.seed, n_fruit=0, gusts=False, leader=True, decoy=True, pillars=[(0.0, 0.0)])
    for other, at in ((sim.leader, (-2.9, 2.9)), (sim.decoy, (-2.9, -2.9))):      # parked well away, and dropped from what the brain gets
        other.SPEED, other.TURN = 0.0, 0.0
        other.pos[:2] = at
    pixels = PixelEyes(BEACONS["leader"], seed=a.seed)
    turner = TurnAway(brain, AVOID_TYPES, a.gain if a.gain is not None else AVOID_GAIN) if a.mode == "turn" else None
    goal_cells = {s: brain.cells(["PFL3"] if a.goal_via == "pfl3" else ["LC10a"], s) for s in "LR"}
    brake_cells = brain.cells(["DNpe023"])
    rng = np.random.default_rng(a.seed + 77)
    ticks = round(brain.dt / sim.dt)
    out = []
    for trial in range(a.trials):
        sim.reset()
        sim.data.qpos[:2] = [-1.5, rng.uniform(-0.12, 0.12)]
        mujoco.mj_forward(sim.model, sim.data)
        sim.control.reset(CRUISE)
        senses.leader_size, senses.pillars = None, []
        pilot.jump_until = pilot.free_until = -1.0
        start, n, things, closest, yaw_total, result = sim.t, 0, [], 9.0, 0.0, "stall"
        steps, stop_jump, stop_brake = 0, 0, 0
        tracker = Tracker()
        beyond = np.array([4.0, 0.0])              # in its own frame, from dead reckoning: 2.5 m past the pillar, straight on from where it starts
        while sim.t - start < 8.0:
            if n % 2 == 0:
                things = [t for t in pixels.things(sim.eyes()) if t.kind == "pillar"] if a.mode != "blind" else []
            n += 1
            feed = things
            close = any(t.kind == "pillar" and t.distance < a.yield_near and abs(t.bearing) < np.radians(60) for t in things)
            extra = []
            if a.goal and not close:               # ours: where it's headed, passed to LC10a as forest.py passes its route. A pillar close ahead takes over from it
                d = beyond - tracker.pose
                bearing = float((np.arctan2(d[1], d[0]) - tracker.h + np.pi) % (2 * np.pi) - np.pi)
                if a.goal_via == "lc10a" and a.goal_volts is None:
                    feed = things + [Thing("leader", bearing, float(np.hypot(*d)), 0.1)]
                else:                              # PLAN.md 8.3: the goal as a set voltage, split by bearing as Senses splits LC10a
                    left = float(np.clip(0.5 + bearing / 0.35, 0, 1))
                    v = a.goal_volts if a.goal_volts is not None else 0.8
                    if a.goal_via == "pfl3":      # PFL3 R turns it left (avoid.py goalbench), so a goal on the left drives PFL3 R
                        extra = [(goal_cells["R"], v * left), (goal_cells["L"], v * (1 - left))]
                    else:
                        extra = [(goal_cells["L"], v * left), (goal_cells["R"], v * (1 - left))]
                    extra = [(c, x) for c, x in extra if x > 0]
            if a.brake_volts:                      # PLAN.md 8.4, ours: a pillar close ahead drives DNpe023 -> MDN (pilot.py's brake), as it drives LC4
                near = [t.distance for t in things if t.kind == "pillar" and t.distance < pilot_module.THREAT_NEAR and abs(t.bearing) < np.radians(70)]
                if near:
                    extra = extra + [(brake_cells, a.brake_volts * (1 - min(near) / pilot_module.THREAT_NEAR))]
            fired = brain.step(None, senses.inject(feed, match_pillars=True) + extra)
            pilot.observe(fired)
            cmd = pilot.command(sim.t, sim.pos[2])
            if turner is not None:
                turner.observe(fired)
                cmd["yaw_rate"] += turner.yaw()
            tracker.move(cmd, brain.dt)
            yaw_total += abs(cmd["yaw_rate"]) * brain.dt
            steps += 1
            if cmd["forward"] == 0.0:
                stop_jump += sim.t < pilot.jump_until
                stop_brake += sim.t >= pilot.jump_until
            for _ in range(ticks):
                sim.step(**cmd)
            p = sim.pos
            closest = min(closest, float(np.hypot(p[0], p[1])) - PILLAR_RADIUS)
            if sim.crashed:
                result = "hit" if closest < 0.1 else "other"
                break
            if p[0] > 1.0:
                result = "pass"
                break
            if np.hypot(p[0], p[1]) > 2.5:              # flew off sideways: it missed the pillar, and that's a pass
                result = "pass"
                break
        out.append({"result": result, "closest": round(closest, 3), "turned": round(yaw_total, 2), "seconds": round(sim.t - start, 2), "stopped_jump": round(stop_jump / max(steps, 1), 3), "stopped_brake": round(stop_brake / max(steps, 1), 3)})
    sim.close()
    results = [o["result"] for o in out]
    return {"mode": a.mode, "rewired": a.rewire, "seed": a.seed, "gain": a.gain, "cooldown": a.cooldown, "sensory_input": a.sensory_input, "loom_max": a.loom_max, "threat_max": a.threat_max, "goal": a.goal, "goal_via": a.goal_via, "goal_volts": a.goal_volts, "brake_volts": a.brake_volts, "hit": results.count("hit"), "pass": results.count("pass"), "stall": results.count("stall"),
            "other": results.count("other"), "closest": round(float(np.median([o["closest"] for o in out])), 3), "trials": out}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    s = sub.add_parser("screen")
    s.add_argument("--seed", type=int, default=7401)
    d = sub.add_parser("dose", help="bench: DNp01 jump vs turn-away neurons across drive strengths (PLAN.md 8.1)")
    d.add_argument("--seed", type=int, default=7401)
    d.add_argument("--no-sensory-input", dest="sensory_input", action="store_false")
    bb = sub.add_parser("brakebench", help="bench: DNpe023 -> MDN as a brake (PLAN.md 8.4)")
    bb.add_argument("--seed", type=int, default=7401)
    bb.add_argument("--no-sensory-input", dest="sensory_input", action="store_false")
    gb = sub.add_parser("goalbench", help="bench: the goal through PFL3 vs LC10a, effect on DNa02 (PLAN.md 8.3)")
    gb.add_argument("--seed", type=int, default=7401)
    gb.add_argument("--no-sensory-input", dest="sensory_input", action="store_false")
    f = sub.add_parser("fly")
    f.add_argument("--mode", choices=("blind", "stop", "turn"), default="turn")
    f.add_argument("--seed", type=int, default=7451)
    f.add_argument("--seconds", type=float, default=60.0)
    f.add_argument("--rewire", action="store_true")
    f.add_argument("--pillars", type=int, default=8)
    f.add_argument("--gap", type=float, default=1.0)
    f.add_argument("--gain", type=float, default=None, help="development only")
    r = sub.add_parser("run")
    r.add_argument("--mode", choices=("blind", "stop", "turn"), default="turn")
    r.add_argument("--seed", type=int, default=7751)
    r.add_argument("--trials", type=int, default=15)
    r.add_argument("--rewire", action="store_true")
    r.add_argument("--gain", type=float, default=None)
    r.add_argument("--cooldown", type=float, default=0.0, help="seconds after a jump before DNp01 can stop it again")
    r.add_argument("--no-sensory-input", dest="sensory_input", action="store_false", help="the bench's brain")
    r.add_argument("--goal", action="store_true", help="a destination beyond the pillar, through LC10a")
    r.add_argument("--yield-near", type=float, default=0.0, help="m: with --goal, no pull toward it while a pillar is this close ahead")
    r.add_argument("--goal-via", choices=("lc10a", "pfl3"), default="lc10a", help="with --goal: which neurons carry it (PLAN.md 8.3)")
    r.add_argument("--goal-volts", type=float, default=None, help="with --goal: a set voltage, split by bearing (default: LC10a as a seen Thing)")
    r.add_argument("--brake-volts", type=float, default=0.0, help="V: a pillar close ahead drives DNpe023 (-> MDN brake) up to this (PLAN.md 8.4)")
    r.add_argument("--loom-max", type=float, default=None, help="V: most a pillar adds to LPLC2 per step (default pilot.CAP, 0.8)")
    r.add_argument("--threat-max", type=float, default=None, help="V: most a pillar adds to LC4 per step (default pilot.CAP, 0.8)")
    a = ap.parse_args()
    if a.what == "screen":
        screen(a)
    elif a.what == "dose":
        dose(a)
    elif a.what == "goalbench":
        goalbench(a)
    elif a.what == "brakebench":
        brakebench(a)
    elif a.what == "run":
        print(json.dumps(run(a)))
    else:
        print(json.dumps(fly(a)))


if __name__ == "__main__":
    main()
