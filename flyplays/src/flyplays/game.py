"""What a game has to do so a fly can play it. See GUIDE.md for a walk-through.

A game is a class with six methods. flyplays calls them in this loop, once per brain step (20 ms by default):

    game.start(seed)
    while alive:
        state = game.tick(dt)          # move the game on by dt seconds
        things = game.sense()          # what is around the player, as Things
        decision = fly.step(things)    # one step of the real connectome
        game.act(decision)             # turn left / right / escape into keys
        frame = game.frame()           # (only when filming) the screen, an RGB numpy array
    game.close()

The game must not run on its own between calls: time only moves in tick(). That's how a fly brain that thinks
slower than real time still plays at the game's real speed, and why a seed replays the same game.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .fly import Decision, Thing


@dataclass
class State:
    alive: bool = True
    score: float = 0.0


class Game:
    """Base class. Override what you need; see games/fruit.py for a complete small example."""

    name = "game"
    title = "A REAL FLY BRAIN PLAYS"          # the banner on clips
    score_name = "score"
    settings: dict = {}                       # interface settings tuned for this game (see fly.DEFAULT)
    dt: float | None = None                   # brain step this game plays best at (None = the brain's 20 ms)
    labels = {"left": "LEFT", "right": "RIGHT", "escape": "ESCAPE"}   # what each action shows on clips

    def start(self, seed: int) -> None:
        raise NotImplementedError

    def tick(self, seconds: float) -> State:
        raise NotImplementedError

    def sense(self) -> list[Thing]:
        return []

    def act(self, decision: Decision) -> None:
        pass

    def frame(self) -> np.ndarray | None:
        return None

    def close(self) -> None:
        pass

    # ---- helpers for games -------------------------------------------------------------------------------

    @staticmethod
    def thing_at(dx: float, ahead: float, radius: float, kind: str = "creature", key=None) -> Thing:
        """A Thing from screen geometry: `dx` to the player's right, `ahead` in front of it, both in the same
        units as `radius`. For a game seen from above where the player faces up, ahead = player_y - y."""
        dist = max(1e-6, float(np.hypot(dx, ahead)))
        return Thing(bearing=float(np.arctan2(dx, ahead)), size=2 * float(np.arctan(radius / dist)),
                     kind=kind, key=key)


class Tap:
    """A key that is pressed once per decision, then rests for `refractory` seconds (a flap, a jump, a shot)."""

    def __init__(self, refractory: float = 0.25):
        self.refractory = refractory
        self.since = 1e9

    def __call__(self, want: bool, dt: float) -> bool:
        self.since += dt
        if want and self.since >= self.refractory:
            self.since = 0.0
            return True
        return False
