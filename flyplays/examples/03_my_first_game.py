"""Your own game in ~50 lines: Sugar Rush. Sugar cubes appear around the fly; it has to walk to them.

    python examples/03_my_first_game.py            # plays 3 games

Copied to a file named sugar.py, the command line plays it too:

    flyplays play sugar:SugarRush --clip sugar.mp4

A game only has to: start, move time on (tick), say what the fly sees (sense), and turn the fly's decision
into moves (act). frame() is only needed for clips. See GUIDE.md for the walk-through.
"""
import math

import numpy as np

from flyplays import Decision, Fly, Game, State, play

W, H = 480, 480


class SugarRush(Game):
    name = "sugar"
    title = "A REAL FLY BRAIN HUNTS FOR SUGAR"
    score_name = "sugar"

    def start(self, seed):
        self.rng = np.random.default_rng(seed)
        self.x, self.y, self.heading = W / 2, H / 2, 0.0      # heading: radians, 0 = up the screen
        self.score, self.time_left = 0, 30.0
        self.sugar = self._new_sugar()

    def _new_sugar(self):
        return (float(self.rng.uniform(40, W - 40)), float(self.rng.uniform(40, H - 40)))

    def tick(self, dt):
        self.time_left -= dt
        self.x = float(np.clip(self.x + math.sin(self.heading) * 60 * dt, 10, W - 10))   # it always walks forward
        self.y = float(np.clip(self.y - math.cos(self.heading) * 60 * dt, 10, H - 10))
        if math.hypot(self.sugar[0] - self.x, self.sugar[1] - self.y) < 20:
            self.score += 1
            self.sugar = self._new_sugar()
        return State(alive=self.time_left > 0, score=self.score)

    def sense(self):
        # where the sugar is, seen from the fly: rotate into the fly's own frame (its heading = "ahead")
        dx, dy = self.sugar[0] - self.x, self.y - self.sugar[1]
        right = dx * math.cos(self.heading) - dy * math.sin(self.heading)
        ahead = dx * math.sin(self.heading) + dy * math.cos(self.heading)
        return [self.thing_at(right, ahead, 10, kind="target", key="sugar")]

    def act(self, d: Decision):
        # the steering neurons turn the fly: 2 degrees per step, the way they said
        self.heading += math.radians(2) * ((1 if d.right else 0) - (1 if d.left else 0))

    def frame(self):
        from PIL import Image, ImageDraw
        img = Image.new("RGB", (W, H), (245, 240, 225))
        d = ImageDraw.Draw(img)
        sx, sy = self.sugar
        d.rectangle([sx - 10, sy - 10, sx + 10, sy + 10], fill=(255, 255, 255), outline=(180, 170, 150), width=2)
        hx, hy = self.x + math.sin(self.heading) * 16, self.y - math.cos(self.heading) * 16
        d.ellipse([self.x - 10, self.y - 10, self.x + 10, self.y + 10], fill=(40, 40, 40))
        d.ellipse([hx - 6, hy - 6, hx + 6, hy + 6], fill=(200, 30, 30))
        return np.asarray(img)


if __name__ == "__main__":
    fly = Fly()
    for seed in (1, 2, 3):
        print(play(SugarRush(), fly, seed=seed, seconds=30))
