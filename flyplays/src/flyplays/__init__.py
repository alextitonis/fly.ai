"""flyplays: a real fruit fly brain plays games.

The complete fruit fly connectome (166,700 neurons, from the `flybrain` package) sees the game and presses the
keys. Nothing is trained and nothing is scripted.

    from flyplays import play
    from flyplays.games.fruit import FruitFall
    print(play(FruitFall(), seed=1, seconds=30, clip="fruit.mp4"))

Command line: `flyplays list`, `flyplays play fruit --clip fruit.mp4`, `flyplays web <url> --keys ...`.
Write your own game: see GUIDE.md (a game is a class with six methods).
"""
from .fly import DEFAULT, Decision, Fly, Thing
from .game import Game, State, Tap
from .runner import Result, play

__version__ = "0.1.0"

__all__ = ["DEFAULT", "Decision", "Fly", "Thing", "Game", "State", "Tap", "Result", "play"]
