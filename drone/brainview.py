"""The brain as it flies: every neuron of the connectome at its real position, lit when it spikes.

Seen from above with the head at the top (the brain, then the nerve cord below it), the fly's left on the left, the
same way the chase camera sees the drone. The few neurons the drone listens to are drawn large and named.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

BG = np.array([6, 8, 9], np.float32)
DIM = np.array([38, 58, 54], np.float32)     # every neuron, unlit
SPIKE = np.array([120, 130, 135], np.float32)  # any other neuron spiking


class BrainView:
    def __init__(self, brain, highlights: dict, width: int = 640, height: int = 720, font=None):
        """highlights: name -> (neuron indices, (r, g, b), big): drawn in that colour when they spike; big ones are
        few neurons (descending) drawn as named discs."""
        self.w, self.h, self.font = width, height, font
        p = brain.positions
        ok = ~np.isnan(p).any(1)
        x, z = p[:, 0], p[:, 2]
        span_x, span_z = np.ptp(x[ok]), np.ptp(z[ok])
        scale = min((width - 40) / span_x, (height - 120) / span_z)
        ox = (width - span_x * scale) / 2
        oz = 70 + (height - 120 - span_z * scale) / 2
        px = np.full(brain.n, -1, np.int32)
        pz = np.full(brain.n, -1, np.int32)
        px[ok] = (ox + (np.nanmax(x) - x[ok]) * scale).astype(np.int32)   # x grows to the fly's left
        pz[ok] = (oz + (z[ok] - np.nanmin(z)) * scale).astype(np.int32)
        self.px, self.pz, self.ok = px, pz, ok
        dens = np.zeros((height, width), np.float32)
        np.add.at(dens, (pz[ok], px[ok]), 1)
        dens = np.clip(np.log1p(dens) / 3.0, 0, 1)[..., None]
        self.background = BG + dens * (DIM - BG)
        self.level = np.zeros(brain.n, np.float32)
        self.color = np.tile(SPIKE, (brain.n, 1))
        self.big = []
        for name, (idx, col, big) in highlights.items():
            idx = np.asarray(idx)
            self.color[idx] = col
            if big:
                self.big.append((name, idx[ok[idx]], np.array(col, np.float32)))
        self.legend = [(name, col) for name, (_, col, _) in highlights.items()]

    def observe(self, fired) -> None:
        """Neurons that spiked on one brain step (one fly's indices)."""
        self.level[fired] = 1.0

    def render(self, title: str = "FLY BRAIN  ·  live spikes") -> np.ndarray:
        img = self.background.copy()
        on = np.flatnonzero((self.level > 0.04) & self.ok)
        if len(on):
            col = self.color[on] * self.level[on, None]
            for dy in (0, 1):
                for dx in (0, 1):
                    y = np.clip(self.pz[on] + dy, 0, self.h - 1)
                    x = np.clip(self.px[on] + dx, 0, self.w - 1)
                    np.maximum.at(img, (y, x), col)
        im = Image.fromarray(img.astype(np.uint8))
        d = ImageDraw.Draw(im, "RGBA")
        for name, idx, col in self.big:                 # the neurons the drone reads: a ring always, a disc when firing
            for i in idx:
                x, y, a = int(self.px[i]), int(self.pz[i]), float(self.level[i])
                r = 6 + 6 * a
                d.ellipse([x - r, y - r, x + r, y + r], outline=tuple(int(c) for c in col) + (160,), width=2)
                if a > 0.04:
                    d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=tuple(int(c) for c in col) + (int(255 * a),))
        if self.font:
            d.text((20, 18), title, font=self.font(24), fill=(140, 255, 210))
            d.text((20, 48), "left", font=self.font(16), fill=(150, 150, 150))
            d.text((self.w - 52, 48), "right", font=self.font(16), fill=(150, 150, 150))
            y = self.h - 22 * len(self.legend) - 12
            for name, col in self.legend:
                d.ellipse([20, y + 4, 32, y + 16], fill=tuple(col))
                d.text((40, y), name, font=self.font(16), fill=(210, 210, 210))
                y += 22
        self.level *= 0.55
        return np.asarray(im)
