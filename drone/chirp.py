"""Sound between drones, past the bench: does "come here" work in the air, and can a chirp carry anything else?

    python drone/chirp.py fly --mode sound --seed 8951        # one run of come-here trials, JSON on the last line
    python drone/chirp.py score                               # the flight test against its rules
    python drone/chirp.py codes --seed 9101                   # pulsed chirps on the bench, about 20 min

hear.py found one command: a steady tone on JO-E, on one side, turns the fly that way. That used to be a bench result only.

1. Flight. The brain gets no pictures: only sound. Another drone hovers 1.5-2.5 m away, at any bearing, and chirps 1.5 s on, 0.5 s off. A trial
   ends when the drone is within REACH of it (a reach), leaves the arena (away), or after TRIAL_S (timeout).
   The microphone is ours and is a model, not a measurement: two mics pointing left and right, loudness falling as 1/distance, and
   propeller noise left over after filtering for the chirp, NOISE volts on every brain step. How loud a real speaker is against real
   propellers hasn't been measured, so `--noise` is reported at several levels. The yaw and speed gains are ours too, as in pilot.py.
   Everything between the JO-E neurons and the wind descending neurons is the connectome.
   Modes: sound, silent (speaker off), mirror (mics swapped: it should turn away), and --rewire.
   Constants below are picked on seeds 8951-8952. Rules fixed before running, seeds 9001-9004, 15 trials each, 95% bootstrap over trials:
     REACHES   sound reaches at least 60% of the time, at least 40 points over silent, interval above 0
     MIRROR    sound reaches at least 20 points over mirror, interval above 0
     WIRING    the first 2 s turn the right way (sources 30-150 degrees off the nose) at least 20 points more than on scrambled wiring,
               interval above 0. Turning, not reaching: on the bench scrambled wiring brakes with no sound at all, so it can't reach anyway

2. Codes, on the bench. hear.py only tried steady tones, and alarm and stop missed. Five patterns (steady, 25, 10, 5, 2 Hz) on seven sets of ear
   neurons (JO-A, B, C, E, A+B, C+E, all) on both antennas at 0.8 V, 1 s, 16 flies each, real and scrambled wiring. Rules fixed before running. A pass
   only counts if it repeats on a fresh seed, since many conditions are tried (9101, then 9102):
     ALARM     the pilot's jump (DNp01) in at least 75% of flies, 20 points over scrambled, silence at most 10%
     STOP      the pilot's brake (MDN) in at least 75% of flies, 20 points over scrambled, silence at most 10%
     PATTERN   a decoder on the descending neurons (100 ms bins, 4-fold) names the pattern (5 classes) at least 40% of the time, 15 points over scrambled:
               does the timing get through? flytalk.py says the listener ignores it
     DATA      the same decoder names the full message (35 and silence) at at least 2 bits per chirp, 0.5 bits over scrambled
   A plain microphone and a demodulator would read all 36 messages (5.2 bits) with no brain at all. So DATA asks what the brain lets through, and can't show that
   the brain is the better way to send data.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from flybrain import FlyBrain  # noqa: E402
from flytalk import rewire  # noqa: E402
from hear import STOP_SPIKES, ear, rolling  # noqa: E402
import pilot as pilot_module  # noqa: E402
from pilot import CAP, ESCAPE_SPIKES, ESCAPE_WINDOW, GROUPS, WINDOW, Pilot  # noqa: E402
from sim import ARENA, DroneSim  # noqa: E402

OUT = HERE / "runs" / "chirp"
REACH = 0.5           # m
TRIAL_S = 20.0
CHIRP_ON, CHIRP_OFF = 1.5, 0.5
NOISE = 0.05          # volts of propeller noise after filtering, per brain step
LOUD = 1.0            # volts at 1 m, on a mic pointing straight at the speaker
SPEED = 0.3           # m/s
YAW_GAIN = 0.05       # rad/s per spike of the wind neurons left-minus-right in the window: pilot.py's until development says otherwise
FLIES, WARM, STEPS, BIN = 16, 25, 50, 5
PATTERNS = {"steady": None, "25 Hz": (1, 1), "10 Hz": (2, 3), "5 Hz": (5, 5), "2 Hz": (12, 13)}     # brain steps on, off
SETS = {"JO-A": ["JO-A"], "JO-B": ["JO-B"], "JO-C": ["JO-C"], "JO-E": ["JO-E"], "A+B": ["JO-A", "JO-B"], "C+E": ["JO-C", "JO-E"], "all": ["JO-A", "JO-B", "JO-C", "JO-E"]}


def mics(bearing: float, distance: float) -> tuple[float, float]:
    """Volts on the left and right ear neurons from a speaker at this bearing (+ = left): loudness falls with distance."""
    level = LOUD / max(distance, 0.1)
    return level * (1 + np.sin(bearing)) / 2, level * (1 - np.sin(bearing)) / 2


def fly(a) -> dict:
    brain = FlyBrain(seed=a.seed)
    if a.rewire:
        rewire(brain, seed=a.seed + 1000)
    pilot_module.TURN_GAIN = 0.5                   # pilot.py's own gain, as in avoid.py: with nothing to chase, follow.py's turns its noise into spinning
    pilot_module.WIND_TURN = a.yaw_gain
    pilot = Pilot(brain)
    cells = {s: ear(brain, "JO-E", s) for s in "LR"}
    for _ in range(100):
        pilot.observe(brain.step())
    sim = DroneSim(seed=a.seed, n_fruit=0, gusts=False, leader=True, pillars=[])
    sim.leader.SPEED, sim.leader.TURN = 0.0, 0.0
    places = np.random.default_rng(a.seed + 77)    # the same places in every mode, so runs on one seed are paired
    hiss = np.random.default_rng(a.seed + 78)
    ticks = round(brain.dt / sim.dt)
    out = []
    for _ in range(a.trials):
        sim.reset()
        pilot.jump_until = -1.0
        angle, far = places.uniform(-np.pi, np.pi), places.uniform(1.5, 2.5)
        sim.leader.pos[:2] = [far * np.cos(angle), far * np.sin(angle)]
        for _ in range(25):                        # settle between trials: the last trial's turn shouldn't carry over
            pilot.observe(brain.step())
        start, result, closest, early, b0, stopped, n = sim.t, "timeout", 9.0, 0.0, None, 0, 0
        while sim.t - start < TRIAL_S:
            d = sim.leader.pos[:2] - sim.pos[:2]
            dist = float(np.hypot(*d))
            b = float((np.arctan2(d[1], d[0]) - sim.heading + np.pi) % (2 * np.pi) - np.pi)
            b0 = b if b0 is None else b0
            closest = min(closest, dist)
            if dist < REACH:
                result = "reach"
                break
            on = a.mode != "silent" and (sim.t - start) % (CHIRP_ON + CHIRP_OFF) < CHIRP_ON
            left, right = mics(b, dist) if on else (0.0, 0.0)
            if a.mode == "mirror":
                left, right = right, left
            left, right = (float(np.clip(v + hiss.normal(0, a.noise), 0, CAP)) for v in (left, right))
            fired = brain.step(None, inject=[(cells["L"], left), (cells["R"], right)])
            pilot.observe(fired)
            cmd = pilot.command(sim.t, sim.pos[2])
            cmd["forward"] = min(cmd["forward"], a.speed)
            if sim.t - start < 2.0:
                early += cmd["yaw_rate"] * brain.dt
            stopped += cmd["forward"] == 0.0
            n += 1
            for _ in range(ticks):
                sim.step(**cmd)
            if sim.crashed or np.max(np.abs(sim.pos[:2])) > ARENA:
                result = "away"
                break
        right_way = bool(np.sign(early) == np.sign(b0)) if np.radians(30) <= abs(b0) <= np.radians(150) else None
        out.append({"result": result, "closest": round(closest, 3), "seconds": round(sim.t - start, 2), "bearing": round(b0, 3), "right_way": right_way,
                    "turned": round(early, 3), "stopped": round(stopped / max(n, 1), 3)})
    sim.close()
    results = [o["result"] for o in out]
    ways = [o["right_way"] for o in out if o["right_way"] is not None]
    return {"mode": a.mode, "rewired": a.rewire, "seed": a.seed, "noise": a.noise, "speed": a.speed, "yaw_gain": a.yaw_gain, "reach": results.count("reach"), "away": results.count("away"),
            "timeout": results.count("timeout"), "right_way": round(float(np.mean(ways)), 3) if ways else None, "stopped": round(float(np.mean([o["stopped"] for o in out])), 3), "trials": out}


def boot(a: np.ndarray, b: np.ndarray, reps: int = 20000) -> tuple[float, float, float]:
    rng = np.random.default_rng(0)
    x = a[rng.integers(0, len(a), (reps, len(a)))].mean(1) - b[rng.integers(0, len(b), (reps, len(b)))].mean(1)
    return float(a.mean() - b.mean()), float(np.percentile(x, 2.5)), float(np.percentile(x, 97.5))


def score(a) -> None:
    folder, seeds = OUT / "test", range(9001, 9005)
    runs = {m: [json.loads((folder / f"{m}{s}.json").read_text()) for s in seeds if (folder / f"{m}{s}.json").exists()] for m in ("sound", "silent", "mirror", "sound_rewire")}
    reach = {m: np.array([t["result"] == "reach" for r in rs for t in r["trials"]], float) for m, rs in runs.items()}
    way = {m: np.array([t["right_way"] for r in rs for t in r["trials"] if t["right_way"] is not None], float) for m, rs in runs.items()}
    for m in runs:
        print(f"{m:14} runs {len(runs[m])}  reach {reach[m].mean():.3f}  right way {way[m].mean():.3f}  stopped {np.mean([r['stopped'] for r in runs[m]]):.3f}")
    s, m_, w = boot(reach["sound"], reach["silent"]), boot(reach["sound"], reach["mirror"]), boot(way["sound"], way["sound_rewire"])
    print(f"REACHES {reach['sound'].mean():.3f}, over silent {s[0]:+.3f} ({s[1]:+.3f} to {s[2]:+.3f}): {'PASS' if reach['sound'].mean() >= 0.6 and s[0] >= 0.4 and s[1] > 0 else 'MISS'}")
    print(f"MIRROR  over mirror {m_[0]:+.3f} ({m_[1]:+.3f} to {m_[2]:+.3f}): {'PASS' if m_[0] >= 0.2 and m_[1] > 0 else 'MISS'}")
    print(f"WIRING  right way over scrambled {w[0]:+.3f} ({w[1]:+.3f} to {w[2]:+.3f}): {'PASS' if w[0] >= 0.2 and w[1] > 0 else 'MISS'}")


def conditions() -> list[tuple[str, str]]:
    return [("silence", "-")] + [(s, p) for s in SETS for p in PATTERNS]


def on_at(pattern: str, step: int) -> bool:
    shape = PATTERNS[pattern]
    return shape is None or step % sum(shape) < shape[0]


def play_all(brain, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """DN counts (conditions, flies, bins, cells) and pilot groups per step (conditions, flies, steps, 6)."""
    sc = brain.superclass.astype(str)
    dn = np.flatnonzero(np.isin(sc, ["descending_neuron", "descending_neuron_tbc"]))
    groups = [brain.groups[g] for g in GROUPS[:6]]
    lut = np.zeros(brain.n, bool)
    counts, traces = [], []
    for i, (name, pattern) in enumerate(conditions()):
        cells = None
        if name != "silence":
            cells = np.concatenate([ear(brain, c, s) for c in SETS[name] for s in "LR"])
        brain.reset(seed + 1000 * i)
        for _ in range(WARM):
            brain.step(None, inject=[])
        whole = np.zeros((FLIES, STEPS // BIN, brain.n), np.int16)
        trace = np.zeros((FLIES, STEPS, len(groups)), np.int16)
        for t in range(STEPS):
            inject = [(cells, 0.8)] if cells is not None and on_at(pattern, t) else []
            for b, f in enumerate(brain.step(None, inject=inject)):
                whole[b, t // BIN, f] += 1
                lut[:] = False
                lut[f] = True
                trace[b, t] = [lut[g].sum() for g in groups]
        counts.append(whole[:, :, dn])
        traces.append(trace)
        print(f"  {name} {pattern}: DN {whole[:, :, dn].sum((1, 2)).mean():.0f} spikes", flush=True)
    return np.stack(counts), np.stack(traces)


def predict(X: np.ndarray, y: np.ndarray, folds: int = 4, lam: float = 100.0) -> np.ndarray:
    """Cross-validated class for every sample: the same ridge as hear.decoder."""
    fold = np.random.default_rng(0).permutation(len(y)) % folds
    Y, out = np.eye(y.max() + 1)[y], np.zeros(len(y), int)
    for k in range(folds):
        a, b = fold != k, fold == k
        mu, sd = X[a].mean(0), X[a].std(0) + 1e-3
        A, B = (X[a] - mu) / sd, (X[b] - mu) / sd
        coef = np.linalg.solve(A @ A.T + lam * np.eye(len(A)), Y[a] - Y[a].mean(0))
        out[b] = (B @ A.T @ coef).argmax(1)
    return out


def bits(y: np.ndarray, pred: np.ndarray) -> float:
    """Information between message and decoded message, from the held-out confusion table. Small samples bias it up, for real and scrambled alike."""
    n = y.max() + 1
    c = np.zeros((n, n))
    np.add.at(c, (y, pred), 1)
    p = c / c.sum()
    px, py = p.sum(1, keepdims=True), p.sum(0, keepdims=True)
    keep = p > 0
    return float((p[keep] * np.log2(p[keep] / (px @ py)[keep])).sum())


def score_codes(real: tuple, scr: tuple) -> dict:
    conds = conditions()
    res: dict = {"conditions": {}}
    jump = lambda t: float((rolling(t, [4, 5], ESCAPE_WINDOW) >= ESCAPE_SPIKES).mean())     # noqa: E731
    stop = lambda t: float((rolling(t, [2, 3], WINDOW) >= STOP_SPIKES).mean())              # noqa: E731
    silent = {"jump": jump(real[1][0]), "stop": stop(real[1][0]), "jump_scrambled": jump(scr[1][0]), "stop_scrambled": stop(scr[1][0])}
    res["silence"] = silent
    res["alarm"], res["stop"] = [], []
    for i, (name, pattern) in enumerate(conds[1:], 1):
        r = {"jump": jump(real[1][i]), "stop": stop(real[1][i]), "jump_scrambled": jump(scr[1][i]), "stop_scrambled": stop(scr[1][i])}
        res["conditions"][f"{name} {pattern}"] = r
        if r["jump"] >= 0.75 and r["jump"] - r["jump_scrambled"] >= 0.2 and silent["jump"] <= 0.1:
            res["alarm"].append(f"{name} {pattern}")
        if r["stop"] >= 0.75 and r["stop"] - r["stop_scrambled"] >= 0.2 and silent["stop"] <= 0.1:
            res["stop"].append(f"{name} {pattern}")
    shape = lambda dn: dn.reshape(dn.shape[0] * dn.shape[1], -1).astype(np.float32)         # noqa: E731
    names = list(PATTERNS)
    y_all = np.repeat(np.arange(len(conds)), FLIES)
    y_pat = np.repeat([names.index(p) for _, p in conds[1:]], FLIES)
    for label, (dn, _) in (("real", real), ("scrambled", scr)):
        res[f"pattern_{label}"] = round(float((predict(shape(dn[1:]), y_pat) == y_pat).mean()), 3)
        pred = predict(shape(dn), y_all)
        res[f"message_{label}"] = round(float((pred == y_all).mean()), 3)
        res[f"bits_{label}"] = round(bits(y_all, pred), 3)
    res["rule_pattern"] = bool(res["pattern_real"] >= 0.4 and res["pattern_real"] - res["pattern_scrambled"] >= 0.15)
    res["rule_data"] = bool(res["bits_real"] >= 2 and res["bits_real"] - res["bits_scrambled"] >= 0.5)
    return res


def codes(a) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    brain = FlyBrain(batch=FLIES, seed=a.seed, sensory_input=False)
    print("real", flush=True)
    real = play_all(brain, a.seed)
    print("scrambled", flush=True)
    rewire(brain, seed=a.seed + 3)
    scr = play_all(brain, a.seed + 500)
    res = score_codes(real, scr)
    (OUT / f"codes{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: v for k, v in res.items() if k != "conditions"}, indent=1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    f = sub.add_parser("fly")
    f.add_argument("--mode", choices=("sound", "silent", "mirror"), default="sound")
    f.add_argument("--seed", type=int, default=8951)
    f.add_argument("--trials", type=int, default=15)
    f.add_argument("--rewire", action="store_true")
    f.add_argument("--noise", type=float, default=NOISE)
    f.add_argument("--speed", type=float, default=SPEED)
    f.add_argument("--yaw-gain", type=float, default=YAW_GAIN, help="development only")
    sub.add_parser("score")
    c = sub.add_parser("codes")
    c.add_argument("--seed", type=int, default=9101)
    a = ap.parse_args()
    if a.what == "fly":
        print(json.dumps(fly(a)))
    elif a.what == "score":
        score(a)
    else:
        codes(a)


if __name__ == "__main__":
    main()
