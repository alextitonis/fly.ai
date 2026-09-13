"""What the fly "sees".

Two routes into the brain:
* Eyes: a 1-D panorama projected onto the 6,006 photoreceptors. Each has an
  azimuth (-1 = far left, +1 = far right) estimated from the MaleCNS
  optic-column tables. Kept for completeness: in a spiking model this signal
  fades at the lamina (see sweep.py).
* FeatureDetectors: drive the fly's own visual projection neuron types
  directly, on the side where things are. This is the route that works.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

BACKGROUND = 0.9


@dataclass
class Blob:
    center: float      # azimuth, -1..1
    half_width: float  # azimuth units
    darkness: float    # 0 = invisible, 1 = black


def render(azimuth: np.ndarray, blobs: list[Blob]) -> np.ndarray:
    lum = np.full(len(azimuth), BACKGROUND, np.float32)
    for b in blobs:
        inside = np.abs(azimuth - b.center) <= b.half_width
        lum[inside] = np.minimum(lum[inside], BACKGROUND * (1 - b.darkness))
    return lum


class Eyes:
    def __init__(self, azimuth: np.ndarray):
        self.azimuth = azimuth
        self.previous: np.ndarray | None = None

    def drive(self, blobs: list[Blob]) -> np.ndarray:
        lum = render(self.azimuth, blobs)
        change = np.zeros_like(lum) if self.previous is None else np.abs(lum - self.previous)
        self.previous = lum
        return np.clip(0.45 * lum + 1.6 * change, 0, 1)


# Encoder parameters (the hand-set defaults). Each can also be an array with one value per
# fly for a batched brain, so several encoders run side by side (sshfighter/replay.py).
ENCODER = {
    "loom_gain": 10.0,    # angular growth per game frame -> LPLC2 voltage
    "loom_size": 0.0,     # angular size -> LPLC2 voltage (looming neurons also respond to size)
    "chase_base": 0.6,    # LC10a voltage whenever the opponent is visible...
    "chase_gain": 0.2,    # ...plus this much per unit of angular size
    "threat_max": 0.8,    # LC4 voltage when the opponent attacks at close range
    "shot_gain": 10.0,    # projectile angular growth -> LPLC1 voltage
    "cap": 0.8,           # most voltage any channel adds per step
}

# Which identified neuron types each channel drives. The picks are ours, guided by
# the literature and checked by stimulating each type (all four reach descending
# neurons): LPLC2 = looming, LC4 = fast looming and escape (strongly drives
# DNp01/02/04), LPLC1 = small approaching objects, LC10a = the target a male chases.
CHANNELS = {"loom": ["LPLC2"], "threat": ["LC4"], "shot": ["LPLC1"], "chase": ["LC10a"]}


class FeatureDetectors:
    """Shortcut past the lamina, which a spiking model can't relay (its neurons
    are graded in real flies). As in Eon's embodied fly, this visual front end
    is a model; everything downstream of these neurons is the connectome.
    """

    def __init__(self, brain, **encoder):
        unknown = set(encoder) - set(ENCODER)
        if unknown:
            raise ValueError(f"unknown encoder parameters: {sorted(unknown)}")
        self.p = {k: np.asarray(encoder.get(k, v), np.float32) for k, v in ENCODER.items()}
        self.cells = {ch: {s: brain.cells(types, s) for s in "LR"} for ch, types in CHANNELS.items()}
        self.previous: dict = {}
        self.last = {f"{ch}{s}": 0.0 for ch in CHANNELS for s in "LR"}   # for display: mean over flies

    @property
    def loom(self):
        return self.cells["loom"]

    @property
    def chase(self):
        return self.cells["chase"]

    def inject(self, opp=None, shots=(), threat: float = 0.0) -> list:
        """opp: (dx, size) of the opponent, or None; shots: hostile projectiles as
        (stable key, dx, size); threat: 0..1, how hard the opponent is attacking
        right now. dx is in screen units from the fly. Call once per game frame.
        Amounts are numbers, or one per fly when encoder parameters are arrays."""
        p = self.p
        drive = {key: np.float32(0.0) for key in self.last}
        seen = {}

        def angle_and_growth(key, dx, size):
            angle = size / max(abs(dx), 8.0)
            seen[key] = angle
            return angle, max(0.0, angle - self.previous.get(key, angle))

        if opp is not None:
            dx, size = opp
            s = "L" if dx < 0 else "R"
            angle, growth = angle_and_growth("opp", dx, size)
            drive[f"loom{s}"] = np.clip(growth * p["loom_gain"] + angle * p["loom_size"], 0, p["cap"])
            drive[f"chase{s}"] = np.clip(p["chase_base"] + p["chase_gain"] * angle, 0, p["cap"])
            drive[f"threat{s}"] = p["threat_max"] * np.float32(np.clip(threat, 0, 1))
        for key, dx, size in shots:
            s = "L" if dx < 0 else "R"
            _, growth = angle_and_growth(key, dx, size)
            drive[f"shot{s}"] = np.maximum(drive[f"shot{s}"], np.clip(growth * p["shot_gain"], 0, p["cap"]))
        self.previous = seen
        self.last = {key: float(np.mean(amount)) for key, amount in drive.items()}
        return [(self.cells[key[:-1]][key[-1]], amount) for key, amount in drive.items() if np.any(amount > 0)]


def blob_for(dx: float, size: float, darkness: float) -> Blob:
    """An object `dx` world units to the side (screen coordinates) of the fly."""
    distance = max(abs(dx), 8.0)
    return Blob(center=float(np.clip(dx / 110.0, -1, 1)),
                half_width=float(np.clip(size / distance * 0.5, 0.03, 0.7)),
                darkness=darkness)
