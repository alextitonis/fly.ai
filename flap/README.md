# A real fly brain plays Flappy Bird

The fruit fly connectome (MaleCNS v1.0, 166,700 neurons, from `flybrain`) plays
[Floppy Bird](https://nebezb.com/floppybird/), Nebez Briefkani's open-source Flappy Bird remake, live on its own
site in headless Chrome. We don't change the game: the fly sees the screen and presses Space. Nothing is trained.

```bash
pip install playwright && playwright install chromium     # once
python flap/play.py run  --seeds 1-5                      # play, print pipes per game
python flap/play.py clip --seed 124                       # film one game -> flap/videos/seed124.mp4
python flap/play.py clips --seeds 1-40 --keep 3           # play 40, film the 3 best + the fastest death
python flap/sweep.py eval --seeds 101-130                 # brain vs the controls
```

Headless and muted; nothing opens on screen. A clip is 1080x1920 at 50 fps (one frame per 20 ms brain step, so it
plays at the game's real speed): the game on top, the fly's eyes, steering neurons, FLAP flashes and a strip of
spiking neurons below.

## How the fly plays (`fly.py`)

The same wiring as `pong/`:

- **Eyes (in):** the fly sits on the bird looking right at the pipes. The open space ahead (the gap in the next pipe,
  or the middle between ceiling and ground before a pipe shows up) goes into **LC10a**, the visual neurons a male fly
  uses to chase a target, in the eye it is on: the left eye covers the top of the screen, the right eye the bottom.
- **Wings (out):** **DNa02, DNg111, DNae002**, the descending neurons that answer LC10a on the same side and turn a
  real fly toward a target. "Turn left" = up: when the left-minus-right rate goes over 10 Hz, Space is pressed
  (at most one flap per 250 ms).
- Everything in between is the connectome, stepped every 20 ms. No rule says "flap when below the gap".

## How we drive the game (`game.py`)

- Playwright's fake clock (installed and **paused**) runs the game's own timers; the pipes slide by CSS, so every
  animation is paused and stepped by the same 20 ms. The game stands still while the brain thinks.
- `Math.random` is seeded, so a seed always gives the same pipes and the same game. The site's files are fetched once
  per process and served from memory after that; its analytics script is blocked.

## Does it really play?

Interface settings (eye spread, steering smoothing, flap threshold, time between flaps, head pitch) were swept on
seeds 1-6 (`results/grid.json`, `results/grid2.json`), then tested on 30 seeds the sweep never saw (`results/eval.json`).
The pipe gap is the game's normal 90 px.

| 30 unseen games | pipes (mean) | best | games with 1+ pipe |
|---|---|---|---|
| fly brain | **1.27** | **5** | **18 / 30** |
| same brain, up/down steering swapped | 0 | 0 | 0 / 30 |
| coin-flip flaps | 0 | 0 | 0 / 30 |
| never flaps | 0 | 0 | 0 / 30 |

It holds its height around the opening well. It mostly dies inside the pipe: falling toward the lower lip, the "up"
neurons take ~80 ms to win over "down", which is too late in a 90 px gap. Pitching the head down (aiming above the
middle) made it worse. The coin-flip control flaps a bit less often than the brain (1.2/s vs 1.8/s) because the
250 ms gap between flaps also applies to it.

## Other games

`game.py` is the only game-specific part: a URL, the key, and a small script that reads where things are on the
page. Any web game played with one or two keys can be swapped in the same way. Don't use games that post scores to a
public leaderboard.
