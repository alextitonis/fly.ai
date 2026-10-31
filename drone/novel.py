"""Does the fly notice a colour it wasn't trained on? Kenyon-cell patterns, with event hooks on the answer.

    python drone/novel.py --seed 7101             # bench, real wiring then scrambled, drone/runs/novel/<seed>.json
    python drone/novel.py --seed 7101 --flies 8

What it's asking: choose.py only knows good and bad. An untrained colour reads as about 0, or as whichever trained colour it
overlaps. Here the fly also keeps a second set of weights at the Kenyon-cell output that every trained look strengthens, with
no reward or punishment involved: how familiar this pattern is. Mushroom-body output neurons that fall silent with repetition
do this job in real flies. These weights are ours, kept outside the connectome, like learning.py; the connectome's part is
which Kenyon cells a colour reaches. Each visual neuron's colour preference is our model as well.

Train on one rewarded colour, or a rewarded and a punished one, then look at 12 hues. Familiar is the highest overlap with any
stored look. A colour counts as new under NEW_BELOW.

NEW_BELOW is fixed from a screen on seeds 7001-7002 (development), before this test ran. The flight has its own cutoff: see fly().

Rules fixed before running, on fresh seeds, per look per fly:
  CATCHES    hues at least 60 degrees from every trained colour fire new_colour at least 90% of the time
  QUIET      the trained colours themselves fire new_colour at most 10% of the time
  SAYS_WHICH of the looks at a trained colour, at least 90% name it right (trained_colour for rewarded, avoid_colour for punished)
  WIRING     CATCHES minus QUIET's rate is at least 20 points better than on scrambled wiring
Reported, no rule: the rate at each hue distance, which shows how close a colour can be and still count as new.
The eyes only find saturated colours (eyes.py), so this only speaks for those.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from events import Events  # noqa: E402
from flybrain import FlyBrain  # noqa: E402
from flytalk import rewire  # noqa: E402
from imprint import A, B, ROUNDS, Colours  # noqa: E402

OUT = HERE / "runs" / "novel"
HUES = tuple(float((A + d) % 360) for d in range(0, 360, 30))
LOOKS = 3
NEW_BELOW = 0.8                 # from `--screen`: trained hues' 5th percentile 0.85-0.88, 60 degrees off 95th percentile 0.67-0.74
NEW_FLIGHT = 0.55               # in flight, from dev seeds 7201-7202: trained colours 0.81-0.91, the other 0.27-0.39
SURE = 0.05                     # a learned value this far from 0 names it good or bad
VALUE_LR = 0.25


class Memory:
    """What each fly knows about Kenyon-cell patterns: the normalised looks it was trained on, with what followed each."""

    def __init__(self, flies: int, n_kc: int):
        self.seen = np.zeros((flies, n_kc), np.float32)
        self.good = np.zeros((flies, n_kc), np.float32)
        self.stored: list[list[np.ndarray]] = [[] for _ in range(flies)]

    @staticmethod
    def unit(counts: np.ndarray) -> np.ndarray:
        return counts / np.maximum(np.linalg.norm(counts, axis=1, keepdims=True), 1e-9)

    def teach(self, counts: np.ndarray, dopamine: float) -> None:
        u = self.unit(counts)
        self.good += VALUE_LR * dopamine * u
        for f in range(len(u)):
            if u[f].any():
                self.stored[f].append(u[f])

    def read(self, counts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """(familiar 0..1, value) per fly. Familiar is the highest overlap with any stored look."""
        u = self.unit(counts)
        familiar = np.array([max((float(u[f] @ s) for s in self.stored[f]), default=0.0) for f in range(len(u))])
        return familiar, np.tanh((self.good * u).sum(1))


def word(familiar: float, value: float) -> str:
    if familiar < NEW_BELOW:
        return "new_colour"
    return "trained_colour" if value > SURE else "avoid_colour" if value < -SURE else "new_colour"


def hue_gap(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def bench(c: Colours, rewards: dict[float, float], seed: int) -> dict:
    """Train, then look at every hue. Rows of (hue, fly, look, familiar, value)."""
    mem = Memory(c.brain.batch, len(c.kc))
    order = np.random.default_rng(seed).permutation(list(rewards) * ROUNDS)
    for i, hue in enumerate(order):
        mem.teach(c.look(float(hue), seed + 1 + i), rewards[float(hue)])
    rows = []
    for j, hue in enumerate(HUES):
        for k in range(LOOKS):
            fam, val = mem.read(c.look(hue, seed + 5000 + 10 * j + k))
            rows += [(hue, f, k, float(fam[f]), float(val[f])) for f in range(len(fam))]
    return {"rows": rows, "trained": list(rewards), "rewards": {str(k): v for k, v in rewards.items()}}


def score(result: dict) -> dict:
    trained = result["trained"]
    rewards = {float(k): v for k, v in result["rewards"].items()}
    by_gap: dict[int, list[int]] = {}
    quiet, right, seen = [], [], []
    for hue, _, _, fam, val in result["rows"]:
        gap = min(hue_gap(hue, t) for t in trained)
        w = word(fam, val)
        by_gap.setdefault(int(gap), []).append(w == "new_colour")
        if gap == 0:
            quiet.append(w == "new_colour")
            nearest = min(trained, key=lambda t: hue_gap(hue, t))
            right.append(w == ("trained_colour" if rewards[nearest] > 0 else "avoid_colour"))
        elif gap >= 60:
            seen.append(w == "new_colour")
    return {"catches": round(float(np.mean(seen)), 3), "false_new": round(float(np.mean(quiet)), 3), "says_which": round(float(np.mean(right)), 3),
            "new_by_gap": {k: round(float(np.mean(v)), 2) for k, v in sorted(by_gap.items())}}


def both(c: Colours, seed: int) -> dict:
    return {"one colour": score(bench(c, {A: 1.0}, seed)), "two colours": score(bench(c, {A: 1.0, B: -1.0}, seed + 100000))}


def screen(c: Colours, seed: int) -> None:
    """Development only: where familiar sits for trained and for far-off hues, to place NEW_BELOW."""
    for name, rewards in (("one", {A: 1.0}), ("two", {A: 1.0, B: -1.0})):
        res = bench(c, rewards, seed)
        rows = np.array([(min(hue_gap(r[0], t) for t in rewards), r[3]) for r in res["rows"]])
        print(name, {int(g): [round(float(q), 2) for q in np.quantile(rows[rows[:, 0] == g, 1], (0.05, 0.5, 0.95))] for g in np.unique(rows[:, 0])}, flush=True)


def fly(a) -> dict:
    """The real loop: camera pictures, the blink, no brain reset between looks, and events from every finished look.

    Trained on one leader only, so the other is a colour it has never met. Each colour's familiarity is a running value over its looks.
    A look with no Kenyon-cell spikes sends no event, and neither does one where another shape took over. Cutoff from dev seeds
    7201-7202 (--new-below).
    Rules fixed before running, seeds 7301-7304, each trained on A and on B, 60 s:
      CATCHES  looks at the colour it never met fire new_colour at least 90% of the time
      QUIET    looks at the trained colour fire new_colour at most 10% of the time
    """
    from choose import BLINK_STEPS, LOOK_STEPS, STICK, Chooser, TURN_GAIN  # flight imports stay out of the bench
    from eyes import ColourEyes, hue_of
    from follow import FollowPilot, FollowSenses
    import pilot as pilot_module
    from sim import DroneSim, Thing
    from sim.world import BEACONS
    from choose import DRONE_SIZE
    from imprint import KC_OFFSET

    brain = FlyBrain(device="cpu", batch=1, seed=a.seed, sensory_input=False)
    c = Colours(brain)
    c.quiet = np.r_[c.all_kc, np.flatnonzero(brain.cell_type.astype(str) == "APL")]
    offset = [(c.all_kc, KC_OFFSET)]
    for _ in range(60):
        brain.step(inject=offset)
    pilot_module.TURN_GAIN = TURN_GAIN
    hues = {k: float(hue_of(np.asarray(BEACONS[n][:3], np.float32))) for k, n in (("A", "leader"), ("B", "decoy"))}
    mem = Memory(1, len(c.kc))
    for _ in range(ROUNDS):                     # settled brain and blink, as in flight: same looks as choose.teach
        counts = np.zeros((1, len(c.kc)), np.float32)
        for _ in range(BLINK_STEPS):
            brain.v[c.quiet] = -1.0
            brain.step()
        for _ in range(LOOK_STEPS):
            brain.v[c.cells] += c.drive(hues[a.train])[:, None]
            h = c.where[brain.step(inject=offset)]
            counts[0, h[h >= 0]] += 1
        mem.teach(counts, 1.0)
    bus, rows = Events(), []
    now, silent = {"t": 0.0}, {"n": 0}

    class Watcher(Chooser):
        fam: dict = {}
        val: dict = {}
        looking = None

        def before(self, shapes: list[dict]) -> None:
            if self.blink == 0 and self.steps:        # mid-look: stay on the same colour while it's in view, however the list reorders
                same = [s for s in shapes if self.key(s["hue"]) == self.looking]
                if same:
                    self.current = same[0]
                    self.c.brain.v[self.c.cells] += self.c.drive(self.current["hue"])[:, None]
                    return
                self.steps, self.counts, self.blink = 0, np.zeros_like(self.counts), BLINK_STEPS
            super().before(shapes)

        def after(self, fired) -> None:
            if self.current is None:
                return
            k = self.key(self.current["hue"])
            if self.steps and k != self.looking:      # another shape took over mid-look: that look is mixed, start again
                self.steps, self.counts = 0, np.zeros_like(self.counts)
                self.blink = BLINK_STEPS
                return
            self.looking = k
            h = self.c.where[fired]
            self.counts[h[h >= 0]] += 1
            self.steps += 1
            if self.steps < LOOK_STEPS:
                return
            spiked = self.counts.any()                # no Kenyon cell spiked: the fly saw nothing to judge, so no event
            if spiked:
                fam, val = mem.read(self.counts[None])
                self.fam[k] = self.fam.get(k, float(fam[0])) + STICK * (float(fam[0]) - self.fam.get(k, float(fam[0])))
                self.val[k] = self.val.get(k, float(val[0])) + STICK * (float(val[0]) - self.val.get(k, float(val[0])))
                f, v = self.fam[k], self.val[k]
                w = "new_colour" if f < a.new_below else "trained_colour" if v > SURE else "avoid_colour" if v < -SURE else "new_colour"
                self.value[k] = v * 0.5
                bus.emit(w, t=now["t"], hue=self.current["hue"], bearing=self.current["bearing"], value=v, familiar=f)
                trained = hue_gap(self.current["hue"], hues[a.train]) < hue_gap(self.current["hue"], hues["B" if a.train == "A" else "A"])
                rows.append((trained, w, f))
            else:
                silent["n"] += 1
            self.steps, self.counts = 0, np.zeros_like(self.counts)
            self.i += 1
            self.blink = BLINK_STEPS

    senses, pilot = FollowSenses(brain), FollowPilot(brain)
    for _ in range(100):
        pilot.observe(brain.step(inject=offset))
    sim = DroneSim(seed=a.seed, n_fruit=0, gusts=False, leader=True, decoy=True)
    eyes, chooser = ColourEyes(DRONE_SIZE, seed=a.seed), Watcher(c)
    ticks = round(brain.dt / sim.dt)
    pillars, shapes, n, crashes = [], [], 0, 0
    while sim.t < a.seconds:
        now["t"] = sim.t
        if n % 2 == 0:
            pillars, shapes = eyes.shapes(sim.eyes())
        n += 1
        chooser.before(shapes)
        choice = chooser.pick(shapes)
        things = list(pillars)
        if choice is not None:
            things.append(Thing("leader", choice["bearing"], 1.0, choice["size"]))
        fired = brain.step(None, senses.inject(things, match_pillars=True) + offset)
        pilot.observe(fired)
        chooser.after(fired)
        cmd = pilot.command(sim.t, sim.pos[2])
        for _ in range(ticks):
            sim.step(**cmd)
        if sim.crashed:
            crashes += 1
            bus.emit("crash", t=sim.t)
            t = sim.data.time
            sim.reset()
            sim.data.time = t
            senses.leader_size, senses.pillars = None, []
    sim.close()
    known = [r for r in rows if r[0]]
    other = [r for r in rows if not r[0]]
    share = lambda x: round(float(np.mean([r[1] == "new_colour" for r in x])), 3) if x else None  # noqa: E731
    quant = lambda x: [round(float(q), 2) for q in np.quantile([r[2] for r in x], (0.05, 0.5, 0.95))] if x else None  # noqa: E731
    return {"train": a.train, "seed": a.seed, "looks_trained": len(known), "looks_other": len(other), "other_says_new": share(other), "trained_says_new": share(known),
            "familiar_trained": quant(known), "familiar_other": quant(other), "silent_looks": silent["n"], "crashes": crashes, "events": dict(bus.counts)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=7101)
    ap.add_argument("--flies", type=int, default=8)
    ap.add_argument("--screen", action="store_true", help="development seeds only")
    ap.add_argument("--fly", action="store_true", help="in flight, one seed")
    ap.add_argument("--train", choices=("A", "B"), default="A")
    ap.add_argument("--seconds", type=float, default=60.0)
    ap.add_argument("--new-below", type=float, default=NEW_FLIGHT, help="in flight")
    a = ap.parse_args()
    if a.fly:
        print(json.dumps(fly(a)))
        return
    brain = FlyBrain(batch=a.flies, sensory_input=False)
    c = Colours(brain)
    if a.screen:
        screen(c, a.seed)
        return
    res = {"real": both(c, a.seed)}
    print("real", json.dumps(res["real"]), flush=True)
    rewire(brain, seed=a.seed + 3)
    res["scrambled"] = both(c, a.seed + 200000)
    print("scrambled", json.dumps(res["scrambled"]), flush=True)
    res["rules"] = {}
    for k, r in res["real"].items():
        s = res["scrambled"][k]
        res["rules"][k] = {"CATCHES": r["catches"] >= 0.9, "QUIET": r["false_new"] <= 0.1, "SAYS_WHICH": r["says_which"] >= 0.9,
                           "WIRING": (r["catches"] - r["false_new"]) - (s["catches"] - s["false_new"]) >= 0.2}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{a.seed}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res["rules"], indent=1))


if __name__ == "__main__":
    main()
