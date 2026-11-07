"""How the fly plays Flappy Bird: what it sees and what makes it flap.

Everything between the two is the real connectome (MaleCNS v1.0, 166,700 neurons) from `flybrain`,
with nothing trained and nothing scripted. Same wiring as pong/ (see pong/lib/fly.ts):

- IN, the eye: the fly sits on the bird looking right, at the pipes coming at it. The open space ahead
  (the gap in the next pipe, or the middle between ceiling and ground before any pipe shows up) is the
  target. It goes into LC10a, the visual neurons a male fly uses to chase a target, in the eye it is on:
  looking right across the screen, the fly's left eye covers the top of the screen, its right eye the bottom.
- OUT, the wings: DNa02, DNg111 and DNae002, the descending neurons that answer LC10a on the same side
  (in a real fly they turn it toward the target). "Turn left" = up = flap: when the fly's left-minus-right
  steering rate goes over a threshold, we press Space.
- Optional escape route: pipes growing in the field of view drive LPLC2/LC4 (looming), and a spike in
  DNp01, the giant-fiber escape-jump neuron, also flaps.

Nothing here says "flap when you're under the gap": if it gets through, that is the fly's wiring turning
toward an opening.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

SEE = ["LC10a"]
STEER = ["DNa02", "DNg111", "DNae002"]
LOOM = ["LPLC2", "LC4"]
ESCAPE = ["DNp01"]

# Interface settings (the only knobs; the brain is untouched). Picked by sweep.py.
DEFAULT = {
    "volts": 1.0,       # LC10a drive per brain step while the target is in view
    "spread": 0.35,     # radians off dead ahead at which one eye gets all of it
    "rate_tau": 0.05,   # s, smoothing of the steering spikes
    "threshold": 10.0,  # Hz of left-minus-right steering that makes a flap
    "refractory": 0.25, # s, shortest time between two flaps (a wingbeat burst)
    "escape": 0.0,      # looming volts per unit of angular growth; 0 = escape route off
    "pitch": 0.0,       # px: the fly's head is pitched down this much, so "dead ahead" sits above the gap middle
}


@dataclass
class View:
    """What is on screen this step, in page pixels (from the game's own layout)."""
    bird_x: float
    bird_y: float
    gap_y: float          # middle of the open space ahead
    gap_dx: float         # how far ahead that opening is
    gap_h: float          # height of the opening
    alive: bool
    score: int


@dataclass
class Fly:
    brain: object
    p: dict = field(default_factory=lambda: dict(DEFAULT))
    mode: str = "brain"   # brain | swapped | random | still

    def __post_init__(self):
        b = self.brain
        self.see = {s: b.cells(SEE, s) for s in "LR"}
        self.steer = {s: b.cells(STEER, s) for s in "LR"}
        self.loom = {s: b.cells(LOOM, s) for s in "LR"}
        self.escape_cells = b.cells(ESCAPE)
        self.dt = b.dt
        self.L = self.R = 0.0
        self.since_flap = 1e9
        self.prev_angle = None
        self.rng = np.random.default_rng(0)
        self.random_rate = 2.0   # flaps/s for the random control (set to the brain's own rate)
        # for the overlay
        self.eye = (0.0, 0.0)
        self.spikes = {}
        self.fired = np.empty(0, np.int64)
        self.why = ""

    def eyes(self, v: View) -> tuple[float, float]:
        """LC10a volts for the left (= screen up) and right (= screen down) eye."""
        bearing = math.atan2(v.bird_y - (v.gap_y - self.p["pitch"]), max(v.gap_dx, 60.0))   # + = target above = fly's left
        left = min(1.0, max(0.0, 0.5 + bearing / self.p["spread"]))
        return self.p["volts"] * left, self.p["volts"] * (1 - left)

    def step(self, v: View) -> bool:
        """One brain step (dt). Returns True to flap."""
        p = self.p
        eL, eR = self.eyes(v)
        self.eye = (eL, eR)
        inject = [(self.see["L"], eL), (self.see["R"], eR)]
        if p["escape"] > 0:
            # the next pipe's half-height-free edges as an angle; growth = it's coming at us
            angle = (v.gap_h + 200.0) / max(v.gap_dx, 20.0)
            growth = 0.0 if self.prev_angle is None else max(0.0, angle - self.prev_angle)
            self.prev_angle = angle
            if growth > 0:
                amt = min(0.8, growth * p["escape"])
                inject += [(self.loom["L"], amt), (self.loom["R"], amt)]
        fired = self.brain.step(inject=inject)
        # several flies (brain batch > 1) see the same screen with their own noise; they vote by
        # averaging their steering spikes. The overlay shows fly 0.
        flies = fired if isinstance(fired, list) else [fired]
        self.fired = flies[0]
        sl = sum(int(np.isin(f, self.steer["L"]).sum()) for f in flies) / len(flies)
        sr = sum(int(np.isin(f, self.steer["R"]).sum()) for f in flies) / len(flies)
        esc = sum(bool(np.isin(f, self.escape_cells).any()) for f in flies) * 2 > len(flies)
        if self.mode == "swapped":
            sl, sr = sr, sl
        self.spikes = {"steerL": sl, "steerR": sr, "escape": esc}
        a = math.exp(-self.dt / p["rate_tau"])
        self.L = a * self.L + (1 - a) * sl / self.dt
        self.R = a * self.R + (1 - a) * sr / self.dt
        self.since_flap += self.dt
        if self.since_flap < p["refractory"]:
            return False
        flap, self.why = False, ""
        if self.mode == "random":
            flap = self.rng.random() < self.random_rate * self.dt
            self.why = "coin flip" if flap else ""
        elif self.mode == "still":
            flap = False
        elif self.L - self.R > p["threshold"]:
            flap, self.why = True, "steer"
        elif p["escape"] > 0 and esc:
            flap, self.why = True, "escape"
        if flap:
            self.since_flap = 0.0
        return flap
