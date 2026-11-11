"""The fly: what goes into the brain and what comes out.

Everything between IN and OUT is the real fruit fly connectome (MaleCNS v1.0, 166,700 neurons) from
`flybrain`, run as a spiking network. Nothing is trained and nothing is scripted: the only knobs are how
strongly the game's objects drive the eye neurons and how many spikes count as a key press.

IN - a game describes what is around the player as `Thing`s (where it is, how big it looks). Each one drives
the fly's own identified visual neurons on the side it is on (a fly sees almost all the way round):

    target    LC10a          the neurons a male fly uses to chase a target
    creature  LC10a          chase it while it's in view...
              LPLC2          ...looming neurons when it grows (it's coming at you)
              LC4            ...fast-looming neurons when it's big (close)
    shot      LPLC1          small objects coming at you

OUT - two groups of descending neurons (brain -> body), read as firing rates:

    steering  DNa02, DNg111, DNae002   left minus right turns the fly (LC10a drives them on its own side)
    escape    DNp01 (the giant fiber), DNp02, DNp04, DNp11   the escape jump (LPLC2/LC4 drive them)

A `Decision` says which of left / right / escape is over its threshold this step; the game turns that into keys.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

SEE = {"chase": ["LC10a"], "loom": ["LPLC2"], "threat": ["LC4"], "shot": ["LPLC1"]}
STEER = ["DNa02", "DNg111", "DNae002"]
ESCAPE = ["DNp01", "DNp02", "DNp04", "DNp11"]

# Interface settings: how the game reaches the eye neurons and how spikes become keys. The brain itself is
# never changed. A game can ship its own values (Game.settings) and you can override any of them.
DEFAULT = {
    "target": 1.0,      # LC10a volts for a `target` dead ahead (split between the eyes by bearing)
    "chase": 0.6,       # LC10a volts while a `creature` is in view...
    "chase_gain": 0.8,  # ...plus this much per radian of its size
    "loom_gain": 25.0,  # LPLC2 volts per radian a `creature` grew since the last step
    "threat": 0.25,     # radians: a `creature` this big (close) drives LC4 fully...
    "threat_max": 0.8,  # ...with this many volts
    "shot_gain": 25.0,  # LPLC1 volts per radian a `shot` grew since the last step
    "cap": 0.8,         # most volts any input adds per step (a `target` may go up to `target`)
    "spread": 0.35,     # radians off dead ahead at which one eye gets all of a thing
    "rate_tau": 0.05,   # seconds: smoothing of the output firing rates
    "threshold": 6.0,   # Hz of left-minus-right steering that counts as "left" (or right-minus-left: "right")
    "escape": 90.0,     # Hz on the escape neurons (either side) that counts as "escape"
}


@dataclass
class Thing:
    """Something the fly can see, relative to the player.

    bearing: radians from straight ahead, + = to the right, - = to the left. A fly sees about +-165 degrees.
    size:    how big it looks, in radians (for an object of radius r at distance d: 2 * atan(r / d)).
    kind:    "target" (something to go to), "creature" (something that can come at you) or "shot".
    key:     a stable id across steps (any hashable), so the fly can tell it is growing (looming).
    """
    bearing: float
    size: float = 0.1
    kind: str = "creature"
    key: object = None


@dataclass
class Decision:
    """What the fly's descending neurons said this step."""
    left: bool = False
    right: bool = False
    escape: bool = False
    steer_hz: tuple = (0.0, 0.0)    # smoothed steering rates, left and right
    escape_hz: tuple = (0.0, 0.0)   # smoothed escape rates, left and right

    @property
    def turn_hz(self) -> float:
        """Right-minus-left steering rate: + turns right. For games with analog turning."""
        return self.steer_hz[1] - self.steer_hz[0]

    @property
    def escape_side(self) -> str:
        """The side whose escape neurons fire more ("L"/"R"): a real fly jumps away from that side."""
        return "L" if self.escape_hz[0] >= self.escape_hz[1] else "R"

    @property
    def actions(self) -> set[str]:
        return {a for a in ("left", "right", "escape") if getattr(self, a)}


@dataclass
class Fly:
    """A fly brain that plays. `brain` is a flybrain.FlyBrain (made for you when left out).

        fly = Fly()                       # CPU or GPU, picked for you
        fly = Fly(flies=8, device="cuda") # 8 flies see the same screen and vote
        d = fly.step([Thing(bearing=-0.2, size=0.1, kind="target")])
    """
    brain: object = None
    settings: dict = field(default_factory=dict)
    flies: int = 1
    device: str = "auto"
    dt: float | None = None

    def __post_init__(self):
        if self.brain is None:
            from flybrain import FlyBrain
            kw = {"device": self.device, "batch": self.flies}
            if self.dt:
                kw["dt"] = self.dt
            self.brain = FlyBrain(**kw)
        unknown = set(self.settings) - set(DEFAULT)
        if unknown:
            raise ValueError(f"unknown settings {sorted(unknown)}; known: {', '.join(DEFAULT)}")
        self.p = {**DEFAULT, **self.settings}
        b = self.brain
        self.see = {ch: {s: b.cells(t, s) for s in "LR"} for ch, t in SEE.items()}
        self.steer = {s: b.cells(STEER, s) for s in "LR"}
        self.escape_cells = {s: b.cells(ESCAPE, s) for s in "LR"}
        self.dt = float(b.dt)
        self.reset()

    def reset(self, seed: int | None = None, settle: float = 0.5) -> None:
        """Fresh voltages, then `settle` seconds with nothing to see so the network is calm at the start."""
        self.brain.reset(seed)
        for _ in range(int(round(settle / self.dt))):
            self.brain.step()
        self.L = self.R = self.EL = self.ER = 0.0
        self.prev_size: dict = {}
        self.drive = {f"{ch}{s}": 0.0 for ch in SEE for s in "LR"}
        self.fired = np.empty(0, np.int64)
        self.last = Decision()

    def configure(self, **settings) -> None:
        unknown = set(settings) - set(DEFAULT)
        if unknown:
            raise ValueError(f"unknown settings {sorted(unknown)}; known: {', '.join(DEFAULT)}")
        self.p.update(settings)

    def inputs(self, things) -> list:
        """The volts each eye-neuron group gets from what's in view (and remembers sizes for looming)."""
        p = self.p
        d = {k: 0.0 for k in self.drive}
        seen = {}
        for i, t in enumerate(things):
            key = t.key if t.key is not None else ("_", i)
            left = min(1.0, max(0.0, 0.5 - t.bearing / p["spread"]))      # share going to the left eye
            growth = max(0.0, t.size - self.prev_size.get(key, t.size))
            seen[key] = t.size
            for s, share in (("L", left), ("R", 1.0 - left)):
                if share <= 0:
                    continue
                if t.kind == "target":
                    d[f"chase{s}"] = max(d[f"chase{s}"], share * p["target"])
                elif t.kind == "shot":
                    d[f"shot{s}"] = max(d[f"shot{s}"], min(p["cap"], share * growth * p["shot_gain"]))
                else:
                    d[f"chase{s}"] = max(d[f"chase{s}"], min(p["cap"], share * (p["chase"] + p["chase_gain"] * t.size)))
                    d[f"loom{s}"] = max(d[f"loom{s}"], min(p["cap"], share * growth * p["loom_gain"]))
                    d[f"threat{s}"] = max(d[f"threat{s}"],
                                          min(p["cap"], share * p["threat_max"] * min(1.0, t.size / p["threat"]) ** 3))
        self.prev_size = seen
        self.drive = d
        return [(self.see[k[:-1]][k[-1]], v) for k, v in d.items() if v > 0]

    def step(self, things=()) -> Decision:
        """One brain step (dt seconds of fly time) with these things in view."""
        p = self.p
        fired = self.brain.step(inject=self.inputs(things))
        flies = fired if isinstance(fired, list) else [fired]   # several flies vote by averaging their spikes
        self.fired = flies[0]

        def count(cells):
            return sum(int(np.isin(f, cells).sum()) for f in flies) / len(flies)

        a = math.exp(-self.dt / p["rate_tau"])
        rate = lambda old, n: a * old + (1 - a) * n / self.dt     # noqa: E731
        self.L, self.R = rate(self.L, count(self.steer["L"])), rate(self.R, count(self.steer["R"]))
        self.EL = rate(self.EL, count(self.escape_cells["L"]))
        self.ER = rate(self.ER, count(self.escape_cells["R"]))
        diff = self.L - self.R
        self.last = Decision(left=diff > p["threshold"], right=-diff > p["threshold"],
                             escape=max(self.EL, self.ER) > p["escape"],
                             steer_hz=(self.L, self.R), escape_hz=(self.EL, self.ER))
        return self.last
