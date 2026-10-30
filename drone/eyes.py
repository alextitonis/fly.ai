"""From pixels to things in view: the camera pilot's whole knowledge of the world.

Takes only the four onboard camera pictures (DroneSim.eyes) and never asks the simulator where anything is. Finds:
  - a beacon of a given colour -> bearing from where it is in the picture, angular size from how many pixels it covers
  - pale upright shapes (the pillars) -> bearing and angular width from the columns they fill
and hands them over as the same Thing the exact pilot gets, so everything after this (LC10a, LPLC2, LC4, DNa02...) is
unchanged. This is a hand-written front end, like flybrain.FeatureDetectors: no learning and no ground truth. A real
camera would see noise and bad light; the sensor noise below is a start, not proof.
"""
from __future__ import annotations

import numpy as np

from sim import Thing
from sim.world import LEADER_RADIUS, PILLAR_RADIUS

CAMERAS = {"left": np.pi / 2, "front": 0.0, "right": -np.pi / 2, "back": np.pi}   # where each one looks, + = left
BEACON_RADIUS = 0.035        # m: the beacon's real size
COLOUR_NEAR = 0.3            # how close to the wanted colour a pixel must be
PALE = 0.3                   # pillars: at least this bright...
GREY = 0.12                  # ...with almost no colour (the sky is as bright, but blue)
MIN_PILLAR_ROWS = 0.35       # a column counts as pillar if this share of it is pale
NOISE = 2.0                  # camera noise, out of 255
SEAM = np.radians(3)         # pieces this close are one thing
SIZE_SCALE = 1.8             # the colour test misses a beacon's dim rim: checked once against the simulator on a test flight


def blobs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Runs of True in a boolean row: (start, end exclusive)."""
    d = np.diff(np.r_[0, mask.astype(np.int8), 0])
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


class PixelEyes:
    def __init__(self, colour, width: int = 128, height: int = 96, seed: int = 0):
        self.colour = np.asarray(colour[:3], np.float32)
        self.w, self.h = width, height
        self.rng = np.random.default_rng(seed)
        # the bearing of each pixel column in its camera: a flat picture, so tan, not linear
        self.column = -np.arctan((np.arange(width) + 0.5 - width / 2) / (width / 2))   # + = left of the camera's centre
        self.rad_per_px = (np.pi / 2) / width

    def things(self, pictures: dict[str, np.ndarray]) -> list[Thing]:
        best, pillars = None, []
        for name, centre in CAMERAS.items():
            img = pictures[name].astype(np.float32)
            img += self.rng.normal(0, NOISE, img.shape)
            img = np.clip(img / 255, 0, 1)
            near = np.linalg.norm(img - self.colour, axis=2) < COLOUR_NEAR
            n = int(near.sum())
            if n and (best is None or n > best[0]):
                ys, xs = np.nonzero(near)
                bearing = centre + float(self.column[xs].mean())
                best = (n, bearing)
            bright, chroma = img.mean(2), img.max(2) - img.min(2)
            pale = (bright > PALE) & (chroma < GREY)
            filled = pale.mean(0) >= MIN_PILLAR_ROWS
            for a, b in blobs(filled):
                pillars.append((_wrap(centre + float(self.column[a:b].mean())), (b - a) * self.rad_per_px))
        # how far is a guess from its width, knowing how wide pillars are: the same prior a fly has about its world
        out = [Thing("pillar", b, PILLAR_RADIUS * 2 / max(w_, 1e-3), w_) for b, w_ in merged(pillars)]
        if best is not None:
            n, bearing = best
            size = 2 * np.sqrt(n / np.pi) * self.rad_per_px        # the beacon's angular diameter
            # the beacon is smaller than the drone it sits on: the drone's apparent size is what the brain is told
            out.append(Thing("leader", _wrap(bearing), BEACON_RADIUS * 2 / max(size, 1e-3), size * SIZE_SCALE * LEADER_RADIUS / BEACON_RADIUS))
        return out


SATURATED, LIT = 0.7, 0.3      # a colourful thing: this saturated (the sky is less) and this bright
MIN_PIXELS = 4                 # smaller is noise
HUE_BIN = 40.0                 # degrees: pieces within this are one thing


def hue_of(rgb: np.ndarray) -> np.ndarray:
    """Hue in degrees of (..., 3) values 0..1."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360


class ColourEyes(PixelEyes):
    """Finds colourful shapes without being told any colour: which one matters is for the brain to learn (imprint.py)."""

    def __init__(self, size_scale: float, **kw):
        super().__init__((0, 0, 0), **kw)
        self.size_scale = size_scale

    def shapes(self, pictures: dict[str, np.ndarray]) -> tuple[list[Thing], list[dict]]:
        """(pillars, colourful shapes [{hue, bearing, size, n}], the biggest piece of each colour)."""
        from scipy import ndimage
        pillars, found = [], []
        for name, centre in CAMERAS.items():
            img = np.clip((pictures[name].astype(np.float32) + self.rng.normal(0, NOISE, pictures[name].shape)) / 255, 0, 1)
            top, low = img.max(2), img.min(2)
            sat = (top - low) / np.maximum(top, 1e-3)
            labels, _ = ndimage.label((sat > SATURATED) & (top > LIT))
            for i, sl in enumerate(ndimage.find_objects(labels)):
                ys, xs = sl
                h, w_ = ys.stop - ys.start, xs.stop - xs.start
                mask = labels[sl] == i + 1
                count = int(mask.sum())
                # thin lines are the floor's grid, not things
                if count < MIN_PIXELS or max(h, w_) > 4 * min(h, w_) or count < 0.3 * h * w_:
                    continue
                hue = float(np.angle(np.exp(1j * np.radians(hue_of(img[sl][mask]))).mean(), deg=True) % 360)
                found.append({"hue": hue, "bearing": _wrap(centre + float(self.column[xs.start:xs.stop].mean())), "n": count})
            filled = (img.mean(2) > PALE) & (top - low < GREY)
            for a, b in blobs(filled.mean(0) >= MIN_PILLAR_ROWS):
                pillars.append((_wrap(centre + float(self.column[a:b].mean())), (b - a) * self.rad_per_px))
        best: dict = {}
        for f in found:
            key = round(f["hue"] / HUE_BIN)
            if key not in best or f["n"] > best[key]["n"]:
                best[key] = f
        for f in best.values():
            f["size"] = 2 * np.sqrt(f["n"] / np.pi) * self.rad_per_px * self.size_scale
        return [Thing("pillar", b, PILLAR_RADIUS * 2 / max(w_, 1e-3), w_) for b, w_ in merged(pillars)], list(best.values())


def merged(pillars: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """A pillar across two cameras' seam comes as two pieces: one pillar, as wide as both."""
    out: list[tuple[float, float]] = []
    for b, w_ in sorted(pillars):
        if out and b - w_ / 2 - (out[-1][0] + out[-1][1] / 2) < SEAM:
            total = out[-1][1] + w_
            out[-1] = ((out[-1][0] * out[-1][1] + b * w_) / total, total)
        else:
            out.append((b, w_))
    if len(out) > 1 and (out[0][0] - out[0][1] / 2 + 2 * np.pi) - (out[-1][0] + out[-1][1] / 2) < SEAM:   # across the +-180 seam
        b0, w0 = out.pop(0)
        b1, w1 = out.pop(-1)
        total = w0 + w1
        out.append((_wrap(((b0 + 2 * np.pi) * w0 + b1 * w1) / total), total))
    return out


def _wrap(a: float) -> float:
    return float((a + np.pi) % (2 * np.pi) - np.pi)
