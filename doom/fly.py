"""How the fly plays Doom: what it sees and what it does.

Everything between in and out is the real connectome (MaleCNS v1.0, 166,700 neurons) from `flybrain`,
nothing trained, nothing scripted.

IN
- The whole screen goes onto the fly's 6,006 photoreceptors (R1-6, R7, R8), each at its real hex column in its
  eye (eye.py): the left eye sees the left half of the screen, the right eye the right half. Brightness plus
  change, the same encoding as flybrain.eyes. This is the "Doom running in a fly brain" part you can see in the
  clip. (In a spiking model this signal fades at the lamina, see flybrain/eyes.py, so it is not what steers.)
- Monsters, from Doom's object list, go to the fly's identified visual neurons on the side they are on, as
  in flybrain.eyes.FeatureDetectors. A fly sees nearly all the way round (about 330 degrees), so monsters off the
  side of Doom's 90-degree screen count too, except in the small blind spot straight behind: LC10a (a target to chase) while one is in view, LPLC2 (looming) when it grows,
  LC4 (fast looming) when it is big, LPLC1 for incoming fireballs.

OUT
- Turning: DNa02, DNg111, DNae002 (the steering neurons LC10a drives on its own side). Left minus right rate
  turns the player.
- Trigger: the escape neurons DNp01 (the giant fiber), DNp02, DNp04, DNp11. In a real fly they launch the
  escape jump. Here a burst on them pulls the trigger. Every shot is the fly trying to jump away.
- On levels where you can walk, the same escape burst also backs the player away from that side.

The probe in README.md shows the wiring: LC10a only moves the steering DNs (same side), LPLC2/LC4 only the
escape DNs (same side); forward (DNg100), backward (MDN) and DNg11 don't answer any of it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

SEE = {"chase": ["LC10a"], "loom": ["LPLC2"], "threat": ["LC4"], "shot": ["LPLC1"]}
STEER = ["DNa02", "DNg111", "DNae002"]
ESCAPE = ["DNp01", "DNp02", "DNp04", "DNp11"]

DEFAULT = {
    "chase": 0.6,       # LC10a volts while a monster is in view on that side
    "chase_gain": 0.8,  # ...plus this per radian of its size
    "loom_gain": 25.0,  # LPLC2 volts per radian of growth per tic
    "threat": 0.25,     # radians: a monster this tall (close) drives LC4...
    "threat_max": 0.8,  # ...up to this
    "shot_gain": 25.0,  # LPLC1 volts per radian of fireball growth per tic
    "cap": 0.8,         # most volts any channel adds per step
    "spread": 0.35,     # radians off dead ahead at which one eye gets all of a monster
    "rate_tau": 0.08,   # s, smoothing of the output rates
    "turn": 0.35,       # degrees per tic per Hz of left-minus-right steering
    "fire": 90.0,       # Hz of escape-neuron rate (either side) that pulls the trigger
    "back": 6.0,        # units per tic backed away while the escape neurons are over `fire` (walk levels)
    "walk": 0.0,        # units per tic of constant walking (0 = stands still unless it panics)
    "eye": 1.0,         # photoreceptor drive scale
}


@dataclass
class Fly:
    brain: object
    eye: dict                # from eye.load()
    p: dict = field(default_factory=lambda: dict(DEFAULT))
    mode: str = "brain"      # brain | swapped (left/right outputs crossed) | blind (no monster input)

    def __post_init__(self):
        b = self.brain
        self.see = {ch: {s: b.cells(t, s) for s in "LR"} for ch, t in SEE.items()}
        self.steer = {s: b.cells(STEER, s) for s in "LR"}
        self.escape = {s: b.cells(ESCAPE, s) for s in "LR"}
        self.dt = b.dt
        self.L = self.R = self.EL = self.ER = 0.0
        self.prev_size: dict[int, float] = {}
        self.prev_lum = None
        self.drive_in = {f"{ch}{s}": 0.0 for ch in SEE for s in "LR"}
        self.fired = np.empty(0, np.int64)
        self.fired_tic: list = []
        eye = self.eye
        ok = np.isfinite(eye["x"])
        self.px = np.where(ok, eye["x"], 0.5)
        self.py = np.where(ok, eye["y"], 0.5)
        self.has_col = ok
    # ---- in -------------------------------------------------------------------------------------------
    def photoreceptors(self, frame: np.ndarray) -> np.ndarray:
        """0..1 drive per photoreceptor from the frame (Doom HUD excluded). Each photoreceptor sees the
        brightness of the small patch its column looks at (about 4x4 Doom pixels), contrast-equalised per frame,
        as a real eye adapts to the scene."""
        H = int(frame.shape[0] * 200 / 240)              # the status bar is the bottom 40 of 240 rows
        g = frame[:H].astype(np.float32).mean(2)
        g = g[: H // 4 * 4].reshape(H // 4, 4, -1, 4).mean((1, 3))     # 4x4 patches
        ranks = np.empty(g.size, np.float32)
        ranks[np.argsort(g, axis=None, kind="stable")] = np.linspace(0, 1, g.size, dtype=np.float32)
        eq = 0.6 * ranks.reshape(g.shape) + 0.4 * (g - g.min()) / max(np.ptp(g), 1.0)
        xi = np.clip((self.px * (g.shape[1] - 1)).round().astype(int), 0, g.shape[1] - 1)
        yi = np.clip(((1 - self.py) * (g.shape[0] - 1)).round().astype(int), 0, g.shape[0] - 1)
        lum = eq[yi, xi].astype(np.float32)
        lum[~self.has_col] = 0.0
        change = np.zeros_like(lum) if self.prev_lum is None else np.abs(lum - self.prev_lum)
        self.prev_lum = lum
        return np.clip(self.p["eye"] * (0.8 * lum + 1.6 * change), 0, 1)

    def features(self, things) -> list:
        p = self.p
        d = {k: 0.0 for k in self.drive_in}
        seen = {}
        for t in things:
            left = min(1.0, max(0.0, 0.5 - t.bearing / p["spread"]))   # share going to the left eye
            growth = max(0.0, t.size - self.prev_size.get(t.key, t.size))
            seen[t.key] = t.size
            for s, share in (("L", left), ("R", 1 - left)):
                if share <= 0:
                    continue
                if t.shot:
                    d[f"shot{s}"] = max(d[f"shot{s}"], share * growth * p["shot_gain"])
                    continue
                d[f"chase{s}"] = max(d[f"chase{s}"], share * (p["chase"] + p["chase_gain"] * t.size))
                d[f"loom{s}"] = max(d[f"loom{s}"], share * growth * p["loom_gain"])
                d[f"threat{s}"] = max(d[f"threat{s}"], share * p["threat_max"] * min(1.0, t.size / p["threat"]) ** 3)
        self.prev_size = seen
        d = {k: min(p["cap"], v) for k, v in d.items()}
        self.drive_in = d
        return [(self.see[k[:-1]][k[-1]], v) for k, v in d.items() if v > 0]

    # ---- one brain step -------------------------------------------------------------------------------
    def step(self, frame, things) -> None:
        inject = [] if self.mode == "blind" else self.features(things)
        fired = self.brain.step(eye_drive=self.photoreceptors(frame), inject=inject)
        flies = fired if isinstance(fired, list) else [fired]
        self.fired = flies[0]
        self.fired_tic.append(flies[0])          # every step since the last Doom tic, for the clip
        n = len(flies)

        def count(idx):   # spikes this step in the group, averaged over the voting flies
            return sum(int(np.isin(f, idx).sum()) for f in flies) / n

        sl, sr = count(self.steer["L"]), count(self.steer["R"])
        el, er = count(self.escape["L"]), count(self.escape["R"])
        if self.mode == "swapped":
            sl, sr, el, er = sr, sl, er, el
        a = math.exp(-self.dt / self.p["rate_tau"])
        self.L = a * self.L + (1 - a) * sl / self.dt
        self.R = a * self.R + (1 - a) * sr / self.dt
        self.EL = a * self.EL + (1 - a) * el / self.dt
        self.ER = a * self.ER + (1 - a) * er / self.dt

    # ---- out (once per Doom tic) ----------------------------------------------------------------------
    def act(self) -> dict:
        p = self.p
        panic = max(self.EL, self.ER) > p["fire"]
        away = 0.0
        if panic:
            away = 1.0 if self.EL > self.ER else -1.0          # threat on the left -> strafe right
        return {
            "turn_deg": p["turn"] * (self.R - self.L),
            "walk": p["walk"] - (p["back"] if panic else 0.0),
            "strafe": away * p["back"] if panic else 0.0,
            "attack": panic,
        }
