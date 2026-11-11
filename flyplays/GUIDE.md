# Adding a new game

This guide takes you from nothing to a fly brain playing your game, and filmed. There are three ways in,
from least work to most control:

| way | you write | the fly sees | good for |
|---|---|---|---|
| **1. Any web game by URL** | nothing (one command) | moving pixels, plus an optional target colour | trying a game in a minute |
| **2. Your own Python game** | one class, 6 methods | exactly what you tell it | new games, experiments |
| **3. A web game, properly** | a class plus a few lines of JavaScript | real positions read from the page | the best play on a web game |

Whatever the way, the fly is the same. Things in the game drive its visual neurons, and its descending neurons
press the keys. Nothing is trained.

---

## The 3 ideas

**1. Time only moves when flyplays says so.** Every brain step (20 ms of fly time by default), flyplays calls
`tick(dt)` and the game moves on by exactly `dt`. Between calls the game must stand still. The fly's thinking
takes as long as it takes, the game still plays at its own speed, and **a seed always replays the same game**.

**2. The fly sees `Thing`s, not pixels.** Each step, `sense()` returns what's around the player:

```python
Thing(bearing=-0.3, size=0.12, kind="target", key="sugar")
```

- `bearing`: radians from straight ahead, positive to the right and negative to the left. The fly sees about
  ±165°; only straight behind is blind.
- `size`: how big it looks, in radians. For something of radius `r` at distance `d`, that's `2*atan(r/d)`.
  The helper `self.thing_at(dx, ahead, radius, kind, key)` computes both from screen coordinates.
- `kind`: `"target"` is something to go to. `"creature"` is something that can come at you. `"shot"` is a
  projectile.
- `key`: any stable id for the same object across steps. The fly needs it to notice something **growing**
  (looming).

**3. The fly answers with a `Decision`.** It has three yes/no actions, from its own neurons:

- `d.left` and `d.right` come from the steering neurons (left minus right over `threshold` Hz).
- `d.escape` comes from the escape neurons (over `escape` Hz).

You also get `d.turn_hz` (right minus left, for analog turning) and `d.escape_side` (`"L"` or `"R"`, whichever
side scared it). You decide what each action does in your game.

### What does "ahead" mean in my game?

| game view | the fly faces | "left" means | bearing of an object at screen (x, y) |
|---|---|---|---|
| top-down (the player moves around) | the player's heading | turn left | rotate (x−px, py−y) into the heading |
| top-down, fixed (it moves left/right) | up the screen | move left | `thing_at(x - px, py - y, r)` |
| side-scroller | right, into the level | **up** (its left eye looks at the top of the screen) | `thing_at(y - py, x - px, r)` (below the player = its right) |
| first person | into the screen | turn left | the angle off the view centre |

For a side-scroller, "turn left" equals "up". That's how the fly plays Flappy: a gap above drives its left eye,
and its left steering neurons flap.

---

## Way 1: any web game by URL

```bash
pip install "flyplays[web]"
flyplays install-browser
flyplays web https://example.com/game \
    --keys left=ArrowLeft,right=ArrowRight,escape=Space \
    --player 0.5,0.85 --facing up --seconds 30 --clip try.mp4
```

| option | meaning |
|---|---|
| `--keys` | which key each action presses. `escape` taps by default and `left`/`right` are held; add `:tap` or `:hold` to change that (`left=Space:tap`) |
| `--player x,y` | where the player is, as fractions of the screen (0,0 is the top left) |
| `--facing` | `up` for top-down games, `right` for side-scrollers |
| `--target-color` | the colour of things to go to (coins, food), e.g. `#ffd700` |
| `--start-keys` | keys pressed once to start the game (default `Space`) |
| `--size w,h` | the browser window |

Anything that moves on screen is a `creature`, and things in the target colour are `target`s. The page can't tell
flyplays when you lose, so the score is the seconds played. It's slower than the other ways because it takes a
screenshot every step; the clip still plays at real speed.

Some games don't fit: ones that keep time with Web Audio, workers or a server won't freeze between steps.

## Way 2: your own Python game

The complete example is [`examples/03_my_first_game.py`](examples/03_my_first_game.py). Here it is step by step.

```python
import math
import numpy as np
from flyplays import Decision, Game, State, play

class SugarRush(Game):
    name = "sugar"                                  # shown in results
    title = "A REAL FLY BRAIN HUNTS FOR SUGAR"      # the banner on clips
    score_name = "sugar"

    def start(self, seed):                          # 1. set up a fresh game; use the seed for all randomness
        self.rng = np.random.default_rng(seed)
        self.x, self.y, self.heading = 240, 240, 0.0
        self.score, self.time_left = 0, 30.0
        self.sugar = (100.0, 100.0)

    def tick(self, dt):                             # 2. move the game on by exactly dt seconds
        self.time_left -= dt
        self.x += math.sin(self.heading) * 60 * dt
        self.y -= math.cos(self.heading) * 60 * dt
        if math.hypot(self.sugar[0] - self.x, self.sugar[1] - self.y) < 20:
            self.score += 1
            self.sugar = (float(self.rng.uniform(40, 440)), float(self.rng.uniform(40, 440)))
        return State(alive=self.time_left > 0, score=self.score)

    def sense(self):                                # 3. what the fly sees, from where it stands
        dx, dy = self.sugar[0] - self.x, self.y - self.sugar[1]
        right = dx * math.cos(self.heading) - dy * math.sin(self.heading)
        ahead = dx * math.sin(self.heading) + dy * math.cos(self.heading)
        return [self.thing_at(right, ahead, 10, kind="target", key="sugar")]

    def act(self, d: Decision):                     # 4. the fly's decision -> your controls
        self.heading += math.radians(2) * (d.right - d.left)

    def frame(self):                                # 5. (for clips) the screen, an RGB numpy array
        ...

print(play(SugarRush(), seconds=30))
```

Run it from the command line by saving it as `sugar.py` and running `flyplays play sugar:SugarRush --clip sugar.mp4`
from the same folder.

**Tips**

- Put **all** randomness on `self.rng` from the seed. Then a good game can be replayed and filmed.
- Keep `act()` dumb. It maps actions to controls and nothing else. Don't add "if the sugar is left, go left":
  that's your rule, not the fly's, and it makes the result meaningless.
- `Tap(refractory)` from `flyplays` gives you one press, then a rest (a flap, a jump, a shot).
- `frame()` can return any size. Clips scale it to fit.

## Way 3: a web game, properly

Subclass `WebGame` and read real positions from the page with a little JavaScript. The fly then sees the exact
objects instead of guessing from pixels. That's how the built-in Flappy works; see
[`src/flyplays/games/flappy.py`](src/flyplays/games/flappy.py).

```python
from flyplays.games.web import WebGame, Keys

class MyWebGame(WebGame):
    url = "https://example.com/game/"
    viewport = {"width": 800, "height": 600}

    def ready(self, seed):                    # the page has loaded: start the game
        self.page.keyboard.press("Space")
        self.keys = Keys(self.page, {"left": "ArrowLeft", "right": "ArrowRight", "escape": "Space"})
        return self.read()

    def read(self):                           # called every step: pull what you need out of the page
        return self.page.evaluate("""() => ({
            alive: !window.gameOver, score: window.score,
            px: player.x, py: player.y,
            enemies: enemies.map(e => ({x: e.x, y: e.y, r: e.r, id: e.id}))
        })""")

    def sense(self):
        s = self.state                        # what read() returned this step
        return [self.thing_at(e["x"] - s["px"], s["py"] - e["y"], e["r"], "creature", e["id"])
                for e in s["enemies"]]

    def act(self, d):
        self.keys(d, 0.02)
```

flyplays freezes the page's time for you. Date, timers, `requestAnimationFrame` and CSS animations only move
when the game ticks. `Math.random` is seeded, and requests to other sites (analytics, ads) are blocked.

---

## Tuning (honestly)

The interface has a few knobs. The brain itself has none. These live in `flyplays.fly.DEFAULT`; set them per
game with `settings = {...}` on your class, or per run with `--set threshold=8`.

| setting | what it does |
|---|---|
| `target` | how hard a `target` drives LC10a |
| `chase`, `chase_gain`, `loom_gain`, `threat`, `threat_max` | how a `creature` drives LC10a, LPLC2 and LC4 |
| `shot_gain` | how a `shot` drives LPLC1 |
| `spread` | how far off-centre one eye gets all of a thing |
| `threshold` | steering Hz (left minus right) that counts as a press |
| `escape` | escape-neuron Hz that counts as `escape` |
| `rate_tau` | smoothing of the output rates |

Also try `--flies 8`, where 8 flies with their own noise vote, and `--dt 0.01` for faster brain steps.

**Check it's the brain.** Run your game three ways, like
[`examples/06_is_it_really_the_brain.py`](examples/06_is_it_really_the_brain.py):

- as is;
- blind: `sense()` returns `[]`;
- swapped: left and right crossed in `act()`.

If the fly doesn't beat blind, your mapping isn't reaching it. Check the bearing signs first.

## Sharing your game

Add it to `src/flyplays/games/`, register it in `games/__init__.py`, and open a pull request with:

- a clip;
- the brain vs blind vs swapped numbers.
