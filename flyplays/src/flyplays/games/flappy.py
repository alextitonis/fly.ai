"""Flappy Bird: the fly plays Floppy Bird (https://nebezb.com/floppybird/, Nebez Briefkani's open-source remake)
on its own site, in headless Chrome. The game isn't changed. Needs `pip install "flyplays[web]"`.

The fly rides the bird, looking right at the pipes. The opening ahead (the gap in the next pipe) is a `target`:
looking right across the screen, the fly's left eye covers the top of the screen and its right eye the bottom,
so a gap above drives LC10a on the left. "Turn left" = up = flap: when the left steering neurons out-fire the
right ones by `threshold` Hz, we press Space. Nothing says "flap when you're under the gap".

Best results: 8 flies voting on a GPU (`--flies 8 --dt 0.01`). One fly on a CPU usually gets a pipe or two.
"""
from __future__ import annotations

import math

from ..fly import Decision, Thing
from ..game import Tap
from .web import WebGame

READ_JS = """
() => {
  const r = (el) => el.getBoundingClientRect();
  const bird = r(document.getElementById('player'));
  const fly = r(document.getElementById('flyarea'));
  const bx = bird.left + bird.width / 2, by = bird.top + bird.height / 2;
  let gap = null;
  for (const p of document.querySelectorAll('.pipe')) {
    const u = r(p.querySelector('.pipe_upper')), l = r(p.querySelector('.pipe_lower'));
    if (u.right < bird.left || u.left > fly.right) continue;
    if (!gap || u.left < gap.x) gap = { x: u.left, top: u.bottom, bottom: l.top };
  }
  const ceil = r(document.getElementById('ceiling')).bottom, land = r(document.getElementById('land')).top;
  const top = gap ? gap.top : ceil, bottom = gap ? gap.bottom : land;
  return { bx, by, gy: (top + bottom) / 2, gdx: gap ? gap.x - bird.right : 200,
           alive: window.currentstate !== 2, score: window.score || 0 };
}
"""


class Flappy(WebGame):
    name = "flappy"
    title = "A REAL FLY BRAIN PLAYS FLAPPY BIRD"
    score_name = "pipes"
    labels = {"left": "FLAP!", "right": "", "escape": ""}
    url = "https://nebezb.com/floppybird/"
    viewport = {"width": 480, "height": 720}
    clip_box = (0, 0, 480, 640)
    dt = 0.01                  # 10 ms brain steps steer in time better than 20 ms
    settings = {"target": 1.0, "spread": 0.35, "rate_tau": 0.05, "threshold": 6.0, "escape": 1e9}

    def __init__(self, easy: bool = False, gap: int = 0):
        self.easy, self.gap = easy, gap
        if easy:
            self.url += "?easy"

    def ready(self, seed: int) -> dict:
        self.page.clock.run_for(1500)                  # the splash settles
        if self.gap:                                   # the game's own pipe gap (90 px normal, 200 in ?easy)
            self.page.evaluate("g => { pipeheight = g; }", self.gap)
        self.page.keyboard.press("Space")              # start (the game gives one jump at start)
        self.flap = Tap(0.25)
        self.dt = 0.02
        return self.read()

    def read(self) -> dict:
        return self.page.evaluate(READ_JS)

    def tick(self, seconds: float):
        self.dt = seconds
        return super().tick(seconds)

    def sense(self):
        s = self.state
        up = math.atan2(s["by"] - s["gy"], max(s["gdx"], 60.0))   # + = the opening is above = the fly's left
        return [Thing(bearing=-up, size=0.1, kind="target", key="gap")]

    def act(self, d: Decision) -> None:
        if self.flap(d.left, self.dt):
            self.page.keyboard.press("Space")
