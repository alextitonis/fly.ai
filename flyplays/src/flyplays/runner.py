"""Play one game with one fly brain."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

from .fly import Fly
from .game import Game, State


@dataclass
class Result:
    game: str
    seed: int
    score: float
    seconds: float
    alive: bool
    actions: dict = field(default_factory=dict)
    wall: float = 0.0
    clip: str | None = None

    def __str__(self) -> str:
        acts = ", ".join(f"{k} {v}" for k, v in self.actions.items())
        end = "still going" if self.alive else "game over"
        return f"{self.game} seed {self.seed}: score {self.score:g} in {self.seconds:.1f} s ({end}; {acts})"


def play(game: Game, fly: Fly | None = None, seed: int = 1, seconds: float = 60.0, clip: str | Path | None = None,
         until: float | None = None, settings: dict | None = None, quiet: bool = True) -> Result:
    """Play `game` until it ends, `seconds` of game time pass, or the score reaches `until`.

    fly:      a Fly (made for you when left out, with the game's own interface settings)
    clip:     path of an .mp4 to film (9:16, the game on top and the fly's neurons underneath)
    settings: interface settings to override (see flyplays.fly.DEFAULT)
    """
    t0 = time.time()
    if fly is None:
        fly = Fly(settings={**game.settings, **(settings or {})}, dt=game.dt)
    else:
        fly.configure(**{**game.settings, **(settings or {})})
    fly.reset(seed)
    rec = None
    if clip:
        from .record import Recorder
        rec = Recorder(clip, game, fly)
    every = max(1, int(round(0.02 / fly.dt)))      # clips stay at 50 fps whatever the brain step
    counts = {"left": 0, "right": 0, "escape": 0}
    was = set()
    t, n, state, stop_at = 0.0, 0, State(), None
    game.start(seed)
    try:
        while t < seconds:
            state = game.tick(fly.dt)
            t += fly.dt
            n += 1
            if not state.alive:
                break
            d = fly.step(game.sense())
            game.act(d)
            now = d.actions
            for a in now - was:                     # count each new press, not every step it's held
                counts[a] += 1
            was = now
            if rec and n % every == 0:
                rec.add(t, state, d)
            if not quiet and n % int(round(1 / fly.dt)) == 0:
                print(f"  {t:5.1f}s  {game.score_name} {state.score:g}", flush=True)
            if until is not None and state.score >= until and stop_at is None:
                stop_at = t + 0.8                   # a moment after the goal, for the clip
            if stop_at is not None and t >= stop_at:
                break
        if rec and not state.alive:                 # a second of the ending
            for _ in range(50):
                game.tick(0.02)
                t += 0.02
                rec.add(t, state, None)
    finally:
        game.close()
        if rec:
            rec.close()
    return Result(game.name, seed, float(state.score), round(t, 2), bool(state.alive), counts,
                  round(time.time() - t0, 1), str(clip) if clip else None)
