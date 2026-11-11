"""Fruit Fall: a tiny game made for flies, in pure Python (no browser, no downloads besides the brain).

The fly sits at the bottom of the screen looking up. Fruit drops from the sky: catch it for a point.
Now and then a fly swatter comes down: if it lands on the fly, game over.

What the fly gets: every piece of fruit is a `target` (LC10a, the chase neurons) and the swatter is a `creature`
(it looms as it comes down: LPLC2, LC4). What it can do: steer left/right (the steering neurons) and, when its
escape neurons fire, jump sideways away from the side they fire on. That's all - whether it catches fruit or
dodges is up to the wiring.

This file is also the reference for writing your own game (see GUIDE.md).
"""
from __future__ import annotations

import numpy as np

from ..fly import Decision
from ..game import Game, State, Tap

W, H = 480, 640


class FruitFall(Game):
    name = "fruit"
    title = "A REAL FLY BRAIN PLAYS FRUIT FALL"
    score_name = "fruit"
    labels = {"left": "LEFT", "right": "RIGHT", "escape": "JUMP!"}
    settings = {"target": 1.0, "threshold": 4.0, "escape": 60.0}

    SPEED = 150.0       # px/s the fly walks while steering
    FALL = 120.0        # px/s fruit falls
    SWAT_EVERY = 6.0    # seconds between swatters (on average)

    def start(self, seed: int) -> None:
        self.rng = np.random.default_rng(seed)
        self.x, self.y = W / 2, H - 70
        self.fruit: list[list[float]] = []      # [x, y, key]
        self.swat = None                        # [x, y, speed] or None
        self.t, self.score, self.alive, self.next_key = 0.0, 0, True, 0
        self.next_fruit, self.next_swat = 0.5, self.rng.exponential(self.SWAT_EVERY) + 2.0
        self.hop = Tap(0.6)
        self.move, self.dt = 0.0, 0.02
        self.flash = 0.0

    def tick(self, dt: float) -> State:
        if not self.alive:
            return State(False, self.score)
        self.dt = dt
        self.t += dt
        self.x = float(np.clip(self.x + self.move * dt, 30, W - 30))
        self.next_fruit -= dt
        if self.next_fruit <= 0:
            self.fruit.append([float(self.rng.uniform(40, W - 40)), -20.0, self.next_key])
            self.next_key += 1
            self.next_fruit = float(self.rng.uniform(1.2, 2.4))
        for f in self.fruit:
            f[1] += self.FALL * dt
        kept = []
        for f in self.fruit:
            if abs(f[0] - self.x) < 34 and abs(f[1] - self.y) < 30:
                self.score += 1
                self.flash = 0.3
            elif f[1] < H + 20:
                kept.append(f)
        self.fruit = kept
        self.next_swat -= dt
        if self.swat is None and self.next_swat <= 0:
            self.swat = [float(np.clip(self.x + self.rng.normal(0, 60), 60, W - 60)), -80.0, 0.0]
        if self.swat is not None:
            self.swat[2] += 900.0 * dt                     # it speeds up as it comes down
            self.swat[1] += self.swat[2] * dt
            if self.swat[1] >= self.y - 20:
                if abs(self.swat[0] - self.x) < 60:
                    self.alive = False
                else:
                    self.swat = None
                    self.next_swat = float(self.rng.exponential(self.SWAT_EVERY) + 1.5)
        self.flash = max(0.0, self.flash - dt)
        return State(self.alive, self.score)

    def sense(self):
        things = [self.thing_at(f[0] - self.x, self.y - f[1], 14, "target", key=("f", f[2]))
                  for f in self.fruit if f[1] < self.y]
        if self.swat is not None:
            things.append(self.thing_at(self.swat[0] - self.x, self.y - self.swat[1], 60, "creature", key="swat"))
        return things

    def act(self, d: Decision) -> None:
        self.move = -self.SPEED if d.left else self.SPEED if d.right else 0.0
        if self.hop(d.escape, self.dt):                       # a real fly jumps away from the side that scared it
            self.x = float(np.clip(self.x + (90 if d.escape_side == "L" else -90), 30, W - 30))

    def frame(self) -> np.ndarray:
        from PIL import Image, ImageDraw
        img = Image.new("RGB", (W, H), (150, 205, 240))
        d = ImageDraw.Draw(img)
        d.rectangle([0, H - 40, W, H], fill=(90, 160, 80))
        for f in self.fruit:
            d.ellipse([f[0] - 14, f[1] - 14, f[0] + 14, f[1] + 14], fill=(230, 60, 60), outline=(120, 20, 20), width=2)
            d.line([f[0], f[1] - 14, f[0] + 4, f[1] - 22], fill=(60, 120, 40), width=3)
        if self.swat is not None:
            sx, sy = self.swat[0], self.swat[1]
            d.line([sx, sy - 160, sx, sy - 40], fill=(110, 80, 50), width=8)
            d.rounded_rectangle([sx - 60, sy - 40, sx + 60, sy + 10], 8, fill=(240, 200, 40), outline=(90, 70, 10), width=3)
            for gx in range(-48, 60, 16):
                d.line([sx + gx, sy - 36, sx + gx, sy + 6], fill=(200, 160, 20), width=2)
        x, y = self.x, self.y
        body = (40, 40, 40) if self.alive else (120, 120, 120)
        d.ellipse([x - 26, y - 22, x - 4, y + 4], fill=(220, 230, 255), outline=(120, 130, 160))   # wings
        d.ellipse([x + 4, y - 22, x + 26, y + 4], fill=(220, 230, 255), outline=(120, 130, 160))
        d.ellipse([x - 12, y - 18, x + 12, y + 22], fill=body)
        d.ellipse([x - 13, y - 26, x - 1, y - 14], fill=(200, 30, 30))                              # red eyes
        d.ellipse([x + 1, y - 26, x + 13, y - 14], fill=(200, 30, 30))
        if self.flash > 0:
            d.text((x + 20, y - 50), "+1", fill=(255, 255, 255))
        return np.asarray(img)
