"""Drive the hosted Floppy Bird page (nebezb.com/floppybird, open source by Nebez Briefkani) in headless Chrome.

We don't change the game. Time is ours: Playwright's fake clock runs the game's own timers, and the CSS
animations (the pipes slide by CSS) are paused and stepped by the same amount, so the game stands still
while the brain thinks and every run plays at the game's real speed in the video.

Math.random is seeded so a seed gives the same pipes every time. The site's analytics script is blocked
(our runs aren't visitors). Sound is muted.
"""
from __future__ import annotations

import io

import numpy as np

URL = "https://nebezb.com/floppybird/"
VIEW = {"width": 480, "height": 720}
CROP = (0, 0, 480, 640)   # game area in the screenshot (drops the credits at the bottom)

SEED_JS = """
(() => {
  let a = %d >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();
"""

# Advance every CSS animation/transition by dt ms, then read where things are.
STEP_JS = """
(dt) => {
  for (const a of document.getAnimations()) {
    if (!a.__fly) { a.__fly = 1; a.currentTime = 0; }
    a.pause();
    a.currentTime = (a.currentTime || 0) + dt;
  }
  const r = (el) => el.getBoundingClientRect();
  const bird = r(document.getElementById('player'));
  const fly = r(document.getElementById('flyarea'));
  const bx = bird.left + bird.width / 2, by = bird.top + bird.height / 2;
  let gap = null;
  for (const p of document.querySelectorAll('.pipe')) {
    const u = r(p.querySelector('.pipe_upper')), l = r(p.querySelector('.pipe_lower'));
    if (u.right < bird.left) continue;          // already behind us
    if (u.left > fly.right) continue;           // not on screen yet
    if (!gap || u.left < gap.x) gap = { x: u.left, top: u.bottom, bottom: l.top };
  }
  const ceil = r(document.getElementById('ceiling')).bottom, land = r(document.getElementById('land')).top;
  const top = gap ? gap.top : ceil, bottom = gap ? gap.bottom : land;
  return { bx, by, gy: (top + bottom) / 2, gdx: gap ? gap.x - bird.right : 200, gh: bottom - top,
           state: window.currentstate, score: window.score || 0 };
}
"""


class Game:
    def __init__(self, browser, seed: int, easy: bool = False):
        self.ctx = browser.new_context(viewport=VIEW)
        self.ctx.route("**/*", self._route)
        self.page = self.ctx.new_page()
        self.page.add_init_script(SEED_JS % seed)
        self.page.clock.install(time=0)
        self.page.clock.pause_at(1)            # the fake clock only stands still once paused
        self.page.goto(URL + ("?easy" if easy else ""), wait_until="networkidle")
        self.page.clock.run_for(1500)          # splash settles
        self.step(0)
        self.page.keyboard.press("Space")      # start (the game gives one jump at start)

    _cache: dict = {}   # url -> (status, headers, body): the game is fetched from the site once per process

    @classmethod
    def _route(cls, route):
        url = route.request.url
        if "nebezb.com" not in url:
            route.abort()                      # analytics and anything off-site
            return
        if url not in cls._cache:
            r = route.fetch()
            cls._cache[url] = (r.status, r.headers, r.body())
        status, headers, body = cls._cache[url]
        route.fulfill(status=status, headers=headers, body=body)

    def step(self, ms: float) -> dict:
        if ms:
            self.page.clock.run_for(int(round(ms)))
        return self.page.evaluate(STEP_JS, ms)

    def flap(self):
        self.page.keyboard.press("Space")

    def frame(self) -> np.ndarray:
        from PIL import Image
        png = self.page.screenshot(clip={"x": CROP[0], "y": CROP[1], "width": CROP[2] - CROP[0],
                                         "height": CROP[3] - CROP[1]})
        return np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))

    def close(self):
        self.ctx.unroute_all(behavior="ignoreErrors")
        self.ctx.close()
