"""Web games in headless Chrome, with the game's time in our hands.

Needs `pip install "flyplays[web]"` and once `flyplays install-browser` (downloads Chromium for Playwright).

How time is frozen: Playwright's fake clock replaces Date, setTimeout/setInterval, requestAnimationFrame and
performance.now, and it only moves when we tell it to; CSS animations are paused and stepped by hand by the
same amount. So the game stands still while the fly thinks, and moves exactly `dt` per brain step. Games that
keep time some other way (Web Audio clocks, workers, server-side ticks) won't freeze and aren't a fit.

Math.random is seeded, so a seed gives the same game every time. Nothing opens on screen and sound is muted.
Please only point this at games you're allowed to automate, and never at games with public leaderboards.
"""
from __future__ import annotations

import io
from urllib.parse import urlparse

import numpy as np

from ..fly import Decision
from ..game import Game, State, Tap

CHROME_ARGS = ["--mute-audio", "--autoplay-policy=user-gesture-required"]

SEED_JS = """
(() => {
  let a = %d >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();
"""

ANIM_JS = """
(dt) => {
  for (const a of document.getAnimations()) {
    if (!a.__fly) { a.__fly = 1; a.currentTime = 0; }
    a.pause();
    a.currentTime = (a.currentTime || 0) + dt;
  }
}
"""

_PW = None        # one Playwright + Chrome per process, shared by every web game
_BROWSER = None


def browser():
    global _PW, _BROWSER
    if _BROWSER is None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as e:
            raise SystemExit('web games need Playwright: pip install "flyplays[web]" && flyplays install-browser') from e
        _PW = sync_playwright().start()
        _BROWSER = _PW.chromium.launch(args=CHROME_ARGS)
    return _BROWSER


class WebGame(Game):
    """A game on a web page. Subclasses set `url` and `viewport`, then read the page in `read()` (return a dict)
    and say what the fly sees in `sense()`. Keys: `self.page.keyboard`."""

    url = ""
    viewport = {"width": 640, "height": 480}
    clip_box = None                 # (x, y, w, h) of the game in the page, for clips; None = the whole viewport
    same_site_only = True           # block requests to other sites (analytics, ads)
    _cache: dict = {}

    _warm: set = set()

    def start(self, seed: int) -> None:
        if self.url not in self._warm:
            # one throwaway load first, so every real game comes from the same cached files (a first load off
            # the network can play differently; after it, a seed always replays the same game)
            self._warm.add(self.url)
            self._open(seed)
            self.close()
        self._open(seed)
        self.state = self.ready(seed)

    def _open(self, seed: int) -> None:
        self.ctx = browser().new_context(viewport=self.viewport)
        self.ctx.route("**/*", self._route)
        self.page = self.ctx.new_page()
        self.page.add_init_script(SEED_JS % seed)
        self.page.clock.install(time=0)
        self.page.clock.pause_at(1)          # the fake clock only stands still once paused
        self.page.goto(self.url, wait_until="networkidle")
        self.page.evaluate(ANIM_JS, 0)

    def ready(self, seed: int) -> dict:
        """Called once the page has loaded: start the game (press a key, click a button...)."""
        return self.read()

    def _route(self, route):
        url = route.request.url
        if self.same_site_only and urlparse(url).netloc not in ("", urlparse(self.url).netloc):
            route.abort()
            return
        if url not in self._cache:
            r = route.fetch()
            self._cache[url] = (r.status, r.headers, r.body())
        status, headers, body = self._cache[url]
        route.fulfill(status=status, headers=headers, body=body)

    def advance(self, seconds: float) -> None:
        ms = int(round(seconds * 1000))
        if ms:
            self.page.clock.run_for(ms)
            self.page.evaluate(ANIM_JS, ms)

    def read(self) -> dict:
        return {}

    def tick(self, seconds: float) -> State:
        self.advance(seconds)
        self.state = self.read()
        return State(bool(self.state.get("alive", True)), float(self.state.get("score", 0)))

    def screenshot(self) -> np.ndarray:
        from PIL import Image
        kw = {}
        if self.clip_box:
            x, y, w, h = self.clip_box
            kw["clip"] = {"x": x, "y": y, "width": w, "height": h}
        return np.asarray(Image.open(io.BytesIO(self.page.screenshot(**kw))).convert("RGB"))

    def frame(self) -> np.ndarray:
        return self.screenshot()

    def close(self) -> None:
        try:
            self.ctx.unroute_all(behavior="ignoreErrors")
            self.ctx.close()
        except Exception:
            pass


class Keys:
    """Turns a Decision into key presses: "hold" keys stay down while the action is on, "tap" keys are pressed
    once and then rest. Example: Keys(page, {"left": "ArrowLeft", "right": "ArrowRight", "escape": "Space:tap"})"""

    def __init__(self, page, mapping: dict, refractory: float = 0.25):
        self.page = page
        self.map = {}
        for action, spec in mapping.items():
            key, _, how = str(spec).partition(":")
            self.map[action] = (key, how or ("tap" if action == "escape" else "hold"))
        self.taps = {a: Tap(refractory) for a in self.map}
        self.down: set[str] = set()

    def __call__(self, d: Decision, dt: float) -> None:
        for action, (key, how) in self.map.items():
            want = getattr(d, action)
            if how == "tap":
                if self.taps[action](want, dt):
                    self.page.keyboard.press(key)
            elif want and key not in self.down:
                self.page.keyboard.down(key)
                self.down.add(key)
            elif not want and key in self.down:
                self.page.keyboard.up(key)
                self.down.discard(key)


class PixelGame(WebGame):
    """Any web game, seen only through its pixels: the fly needs no knowledge of the page.

    What the fly sees, from the screen alone:
    - anything that MOVES (frame-to-frame change, grouped into blobs) is a `creature`: it looms if it grows
      or comes closer;
    - with `target_color` set, things of that colour are `target`s to go to.
    Where the player is (`player`, as fractions of the screen) and which way it faces (`facing`: "up" for
    top-down games, "right" for side-scrollers) say what is "ahead", "left" and "right".

        PixelGame("https://example.com/game", keys={"left": "ArrowLeft", "right": "ArrowRight", "escape": "Space"},
                  player=(0.5, 0.85), facing="up", target_color="#ff3030")
    """

    name = "web"
    score_name = "seconds"

    def __init__(self, url: str, keys: dict, player=(0.5, 0.5), facing: str = "up", target_color: str | None = None,
                 start_keys: tuple = ("Space",), viewport=None, refractory: float = 0.25, grid: int = 4):
        self.url = url
        self.title = f"A REAL FLY BRAIN PLAYS {urlparse(url).netloc.upper()}"
        self.keymap = keys
        self.player = player
        self.facing = facing
        self.target = None if not target_color else np.array([int(target_color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)])
        self.start_keys = start_keys
        self.refractory = refractory
        self.grid = grid
        if viewport:
            self.viewport = {"width": viewport[0], "height": viewport[1]}

    def ready(self, seed: int) -> dict:
        self.page.mouse.click(self.viewport["width"] / 2, self.viewport["height"] / 2)   # focus the game
        for k in self.start_keys:
            self.page.keyboard.press(k)
        self.keys = Keys(self.page, self.keymap, self.refractory)
        self.prev = None
        self.t = 0.0
        self.dt = 0.02
        self.img = self.screenshot()
        return {"alive": True, "score": 0}

    def tick(self, seconds: float) -> State:
        self.advance(seconds)
        self.dt = seconds
        self.t += seconds
        self.img = self.screenshot()
        return State(True, round(self.t, 1))     # a generic page can't say when you lose: score = time survived

    def _blobs(self, mask: np.ndarray, kind: str):
        from scipy import ndimage
        lab, n = ndimage.label(mask)
        if not n:
            return []
        g = self.grid
        H, W = mask.shape
        px, py = self.player[0] * W, self.player[1] * H
        out = []
        for i, sl in enumerate(ndimage.find_objects(lab)):
            ys, xs = sl
            h, w = ys.stop - ys.start, xs.stop - xs.start
            if h * w < 2:
                continue
            cx, cy = (xs.start + xs.stop) / 2, (ys.start + ys.stop) / 2
            if self.facing == "right":                 # side view: ahead = right of the player, up = the fly's left
                dx, ahead = cy - py, cx - px
            else:                                      # top-down: ahead = up the screen
                dx, ahead = cx - px, py - cy
            if abs(np.arctan2(dx, ahead)) > np.radians(165):
                continue                               # the blind spot straight behind
            # a stable key: the nearest blob of the same kind in the last frame (coarse grid cell)
            out.append(self.thing_at(dx * g, ahead * g, max(h, w) * g / 2, kind, key=(kind, int(cx) // 6, int(cy) // 6)))
        return sorted(out, key=lambda t: -t.size)[:8]

    def sense(self):
        g = self.grid
        small = self.img[: self.img.shape[0] // g * g, : self.img.shape[1] // g * g].astype(np.float32)
        small = small.reshape(small.shape[0] // g, g, small.shape[1] // g, g, 3).mean((1, 3))
        things = []
        if self.prev is not None:
            moving = np.abs(small - self.prev).mean(2) > 18
            things += self._blobs(moving, "creature")
        if self.target is not None:
            things += self._blobs(np.abs(small - self.target).sum(2) < 60, "target")
        self.prev = small
        return things

    def act(self, d: Decision) -> None:
        self.keys(d, self.dt)
