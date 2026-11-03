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
   Seeds 9001-9004 ran on sensory_input=True, FlyBrain's default, while hear.py's bench is False. Seeds 9021-9024 (--no-sensory-input, folder test_nosensory)
   repeat the test on the bench's brain with the same constants and the same rules, nothing retuned, so a miss there is a miss.
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
     PATTERN   a decoder on the descending neurons (20 ms bins, 4-fold) names the pattern (5 classes) at least 40% of the time, 15 points over scrambled,
               and 15 points over the same decoder on each neuron's spike count for the whole second. That last part is what makes it about timing: patterns
               also differ in how much sound they carry (steady is twice the rest), and counts alone can pick that up. flytalk.py says the listener ignores timing.
               Changed before any run: this was 100 ms bins, which can't show 25 or 10 Hz at all. Pulses start at the same moment in every trial, which a real
               listener wouldn't get, so a pass is the easy case.
     DATA      the same decoder names the full message (35 and silence) at at least 2 bits per chirp, 0.5 bits over scrambled
   The decoder's settings are picked on development seed 9100, before 9101.
   A plain microphone and a demodulator would read all 36 messages (5.2 bits) with no brain at all. So DATA asks what the brain lets through, and can't show that
   the brain is the better way to send data.

3. Alert, on the bench, `python drone/chirp.py alert --seed 9411`. Codes passed with every pulse starting at the same moment, which a real listener doesn't get. Here each fly hears the pattern from its own random moment, with propeller noise on the ear neurons
   (NOISE volts), all ear channels, and has to say whether it's the alert, 10 Hz, picked before running, against the other four patterns and silence. Two runs of each condition with different resets: trained on one, scored on the other, both ways. The decoder is ours, on the descending neurons:
   each one's spike count plus how strongly they fire together at each rhythm, which doesn't depend on when the pattern began. Rules fixed before running, at 0.4 V, a pass only counts if it repeats on 9412:
     HEARS     at least 75% of alerts called, at most 10% of everything else called alert
     WIRING    (hits + correct rejections) / 2 at least 15 points over scrambled wiring
     TIMING    the same at least 15 points over the same decoder given only spike counts
   Reported, no rule: 0.2 and 0.8 V, and the rhythm of the microphone itself with no brain, which should do at least as well. That's the bar: the brain only earns its place in a real alert if it adds something a filter on the mic doesn't, such as acting on it through its own wiring.
   Result 2026-11-02, the same on both seeds: HEARS passed (91%, 3%; 100%, 4%), WIRING passed (94 against 50; 98 against 53), TIMING missed (+12, +13). Mic with no brain 100% at every level.
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
FLIES, WARM, STEPS, BIN = 16, 25, 50, 1     # BIN in brain steps: 20 ms, so the fastest pattern (25 Hz, one on, one off) shows
PATTERNS = {"steady": None, "25 Hz": (1, 1), "10 Hz": (2, 3), "5 Hz": (5, 5), "2 Hz": (12, 13)}     # brain steps on, off
SETS = {"JO-A": ["JO-A"], "JO-B": ["JO-B"], "JO-C": ["JO-C"], "JO-E": ["JO-E"], "A+B": ["JO-A", "JO-B"], "C+E": ["JO-C", "JO-E"], "all": ["JO-A", "JO-B", "JO-C", "JO-E"]}


def mics(bearing: float, distance: float) -> tuple[float, float]:
    """Volts on the left and right ear neurons from a speaker at this bearing (+ = left): loudness falls with distance."""
    level = LOUD / max(distance, 0.1)
    return level * (1 + np.sin(bearing)) / 2, level * (1 - np.sin(bearing)) / 2


def fly(a) -> dict:
    brain = FlyBrain(seed=a.seed, sensory_input=a.sensory_input)
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
    return {"mode": a.mode, "rewired": a.rewire, "seed": a.seed, "sensory_input": a.sensory_input, "noise": a.noise, "speed": a.speed, "yaw_gain": a.yaw_gain, "reach": results.count("reach"), "away": results.count("away"),
            "timeout": results.count("timeout"), "right_way": round(float(np.mean(ways)), 3) if ways else None, "stopped": round(float(np.mean([o["stopped"] for o in out])), 3), "trials": out}


def boot(a: np.ndarray, b: np.ndarray, reps: int = 20000) -> tuple[float, float, float]:
    rng = np.random.default_rng(0)
    x = a[rng.integers(0, len(a), (reps, len(a)))].mean(1) - b[rng.integers(0, len(b), (reps, len(b)))].mean(1)
    return float(a.mean() - b.mean()), float(np.percentile(x, 2.5)), float(np.percentile(x, 97.5))


def score(a) -> None:
    folder, seeds = OUT / a.folder, range(a.first_seed, a.first_seed + 4)
    runs = {m: [json.loads((folder / f"{m}{s}.json").read_text()) for s in seeds if (folder / f"{m}{s}.json").exists()] for m in ("sound", "silent", "mirror", "sound_rewire")}
    reach = {m: np.array([t["result"] == "reach" for r in rs for t in r["trials"]], float) for m, rs in runs.items()}
    way = {m: np.array([t["right_way"] for r in rs for t in r["trials"] if t["right_way"] is not None], float) for m, rs in runs.items()}
    for m in runs:
        print(f"{m:14} runs {len(runs[m])}  reach {reach[m].mean():.3f}  right way {way[m].mean():.3f}  stopped {np.mean([r['stopped'] for r in runs[m]]):.3f}")
    s, m_, w = boot(reach["sound"], reach["silent"]), boot(reach["sound"], reach["mirror"]), boot(way["sound"], way["sound_rewire"])
    print(f"REACHES {reach['sound'].mean():.3f}, over silent {s[0]:+.3f} ({s[1]:+.3f} to {s[2]:+.3f}): {'PASS' if reach['sound'].mean() >= 0.6 and s[0] >= 0.4 and s[1] > 0 else 'MISS'}")
    print(f"MIRROR  over mirror {m_[0]:+.3f} ({m_[1]:+.3f} to {m_[2]:+.3f}): {'PASS' if m_[0] >= 0.2 and m_[1] > 0 else 'MISS'}")
    print(f"WIRING  right way over scrambled {w[0]:+.3f} ({w[1]:+.3f} to {w[2]:+.3f}): {'PASS' if w[0] >= 0.2 and w[1] > 0 else 'MISS'}")
    print("sound reach per seed:", [r["reach"] / len(r["trials"]) for r in runs["sound"]])
    trials = [t for r in runs["sound"] for t in r["trials"]]
    for lo, hi in ((0, 30), (30, 90), (90, 150), (150, 181)):
        some = [t["result"] == "reach" for t in trials if lo <= abs(np.degrees(t["bearing"])) < hi]
        print(f"sound reach from {lo}-{hi} degrees off the nose: {np.mean(some) if some else float('nan'):.2f} of {len(some)}")


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
    place = np.full(brain.n, -1)
    place[dn] = np.arange(len(dn))
    counts, traces = [], []
    for i, (name, pattern) in enumerate(conditions()):
        cells = None
        if name != "silence":
            cells = np.concatenate([ear(brain, c, s) for c in SETS[name] for s in "LR"])
        brain.reset(seed + 1000 * i)
        for _ in range(WARM):
            brain.step(None, inject=[])
        whole = np.zeros((FLIES, STEPS // BIN, len(dn)), np.int8)
        trace = np.zeros((FLIES, STEPS, len(groups)), np.int16)
        for t in range(STEPS):
            inject = [(cells, 0.8)] if cells is not None and on_at(pattern, t) else []
            for b, f in enumerate(brain.step(None, inject=inject)):
                here = place[f]
                whole[b, t // BIN, here[here >= 0]] += 1
                lut[:] = False
                lut[f] = True
                trace[b, t] = [lut[g].sum() for g in groups]
        counts.append(whole)
        traces.append(trace)
        print(f"  {name} {pattern}: DN {whole.sum((1, 2)).mean():.0f} spikes", flush=True)
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
        res[f"pattern_counts_{label}"] = round(float((predict(shape(dn[1:].sum(2, keepdims=True)), y_pat) == y_pat).mean()), 3)
        pred = predict(shape(dn), y_all)
        res[f"message_{label}"] = round(float((pred == y_all).mean()), 3)
        res[f"bits_{label}"] = round(bits(y_all, pred), 3)
    res["rule_pattern"] = bool(res["pattern_real"] >= 0.4 and res["pattern_real"] - res["pattern_scrambled"] >= 0.15 and res["pattern_real"] - res["pattern_counts_real"] >= 0.15)
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
    np.savez_compressed(OUT / f"codes{a.seed}.npz", real_dn=real[0], real_trace=real[1], scr_dn=scr[0], scr_trace=scr[1])
    res = score_codes(real, scr)
    (OUT / f"codes{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: v for k, v in res.items() if k != "conditions"}, indent=1))


ALERT, ALERT_STEPS, ALERT_LOUD = "10 Hz", 75, (0.2, 0.4, 0.8)


def alert_play(brain, cells: np.ndarray, dn: np.ndarray, pattern: str | None, loud: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """One condition: DN counts (flies, DNs), DN population per step (flies, steps), and the mic's own signal (flies, steps)."""
    rng = np.random.default_rng(seed)
    brain.reset(seed)
    for _ in range(WARM):
        brain.step(None, inject=[])
    start = rng.integers(0, 50, FLIES)
    place = np.full(brain.n, -1)
    place[dn] = np.arange(len(dn))
    counts, trace, mic = np.zeros((FLIES, len(dn)), np.int16), np.zeros((FLIES, ALERT_STEPS), np.int16), np.zeros((FLIES, ALERT_STEPS), np.float32)
    for t in range(ALERT_STEPS):
        on = np.array([pattern is not None and on_at(pattern, t + int(s)) for s in start])
        volts = np.clip(loud * on + rng.normal(0, NOISE, FLIES), 0, CAP).astype(np.float32)
        mic[:, t] = volts
        brain.v[cells] += volts[None, :]
        for b, f in enumerate(brain.step(None, inject=[])):
            here = place[f]
            here = here[here >= 0]
            counts[b, here] += 1
            trace[b, t] = len(here)
    return counts, trace, mic


def rhythm(x: np.ndarray) -> np.ndarray:
    return np.abs(np.fft.rfft(x - x.mean(1, keepdims=True), axis=1))[:, 1:]


def fold_score(A: np.ndarray, B: np.ndarray, y: np.ndarray, lam: float = 100.0) -> np.ndarray:
    """Train on run A, class for every fly of run B, and the same swapped: (flies x 2,)."""
    out = []
    for tr, te in ((A, B), (B, A)):
        mu, sd = tr.mean(0), tr.std(0) + 1e-3
        P, Q = (tr - mu) / sd, (te - mu) / sd
        T = np.eye(y.max() + 1)[y]
        coef = np.linalg.solve(P @ P.T + lam * np.eye(len(P)), T - T.mean(0))
        out.append((Q @ P.T @ coef).argmax(1))
    return np.concatenate(out)


def alert_score(pred: np.ndarray, y: np.ndarray, want: int) -> dict:
    yy = np.r_[y, y]
    hit, wrong = float((pred[yy == want] == want).mean()), float((pred[yy != want] == want).mean())
    return {"hit": round(hit, 3), "false": round(wrong, 3), "balanced": round((hit + 1 - wrong) / 2, 3)}


def alert_run(brain, seed: int) -> dict:
    sc = brain.superclass.astype(str)
    dn = np.flatnonzero(np.isin(sc, ["descending_neuron", "descending_neuron_tbc"]))
    cells = np.concatenate([ear(brain, c, s) for c in SETS["all"] for s in "LR"])
    names = list(PATTERNS) + [None]
    want = names.index(ALERT)
    y = np.repeat(np.arange(len(names)), FLIES)
    out = {}
    for loud in ALERT_LOUD:
        runs = []
        for r in range(2):
            got = [alert_play(brain, cells, dn, p, loud, seed + 1000 * r + 100 * i + int(loud * 10)) for i, p in enumerate(names)]
            runs.append([np.concatenate([g[k] for g in got]).astype(np.float32) for k in range(3)])
            print(f"  {loud} V run {r}", flush=True)
        full = lambda q: np.c_[q[0], 20 * rhythm(q[1])]     # noqa: E731
        out[str(loud)] = {"brain": alert_score(fold_score(full(runs[0]), full(runs[1]), y), y, want), "counts_only": alert_score(fold_score(runs[0][0], runs[1][0], y), y, want),
                          "mic_no_brain": alert_score(fold_score(rhythm(runs[0][2]), rhythm(runs[1][2]), y, 1.0), y, want)}
        print(loud, out[str(loud)], flush=True)
    return out


def alert(a) -> None:
    brain = FlyBrain(batch=FLIES, seed=a.seed, sensory_input=False)
    print("real", flush=True)
    real = alert_run(brain, a.seed)
    print("scrambled", flush=True)
    rewire(brain, seed=a.seed + 3)
    scr = alert_run(brain, a.seed + 500)
    r, s = real["0.4"], scr["0.4"]
    res = {"seed": a.seed, "real": real, "scrambled": scr, "rules": {"HEARS": r["brain"]["hit"] >= 0.75 and r["brain"]["false"] <= 0.1, "WIRING": r["brain"]["balanced"] - s["brain"]["balanced"] >= 0.15, "TIMING": r["brain"]["balanced"] - r["counts_only"]["balanced"] >= 0.15}}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"alert{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res["rules"]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="what", required=True)
    al = sub.add_parser("alert")
    al.add_argument("--seed", type=int, default=9411)
    f = sub.add_parser("fly")
    f.add_argument("--mode", choices=("sound", "silent", "mirror"), default="sound")
    f.add_argument("--seed", type=int, default=8951)
    f.add_argument("--trials", type=int, default=15)
    f.add_argument("--rewire", action="store_true")
    f.add_argument("--noise", type=float, default=NOISE)
    f.add_argument("--speed", type=float, default=SPEED)
    f.add_argument("--yaw-gain", type=float, default=YAW_GAIN, help="development only")
    f.add_argument("--no-sensory-input", dest="sensory_input", action="store_false", help="the bench's brain: no synapses onto sensory neurons")
    s = sub.add_parser("score")
    s.add_argument("--folder", default="test")
    s.add_argument("--first-seed", type=int, default=9001)
    c = sub.add_parser("codes")
    c.add_argument("--seed", type=int, default=9101)
    a = ap.parse_args()
    if a.what == "fly":
        print(json.dumps(fly(a)))
    elif a.what == "score":
        score(a)
    elif a.what == "alert":
        alert(a)
    else:
        codes(a)


if __name__ == "__main__":
    main()
