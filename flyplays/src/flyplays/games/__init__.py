"""Built-in games, by name. Your own game can be played by its import path: `flyplays play my_module:MyGame`."""
from __future__ import annotations

import importlib

GAMES = {
    "fruit": ("flyplays.games.fruit:FruitFall", "Fruit Fall: catch fruit, dodge the swatter (pure Python, no browser)"),
    "flappy": ("flyplays.games.flappy:Flappy", "Flappy Bird, on the open-source Floppy Bird site (needs [web])"),
    "doom": ("flyplays.games.doom:Doom", "Freedoom through ViZDoom; options: level=center|corridor|map01|e1m1 (needs [doom])"),
}


def load(name: str):
    """A game class from a built-in name or "package.module:ClassName"."""
    path = GAMES[name][0] if name in GAMES else name
    if ":" not in path:
        raise SystemExit(f"unknown game {name!r}: one of {', '.join(GAMES)}, or module:Class")
    mod, _, cls = path.partition(":")
    import os
    import sys
    if os.getcwd() not in sys.path:          # so `flyplays play my_game:MyGame` finds my_game.py in this folder
        sys.path.insert(0, os.getcwd())
    return getattr(importlib.import_module(mod), cls)
