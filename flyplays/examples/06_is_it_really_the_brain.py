"""Is it really the brain? Play the same games three ways and compare:

    brain     the fly as it is
    blind     the same fly, but it sees nothing (sense() returns no Things)
    swapped   it sees everything, but its left and right outputs are crossed

If the brain beats both, the wiring itself is doing the work. On Fruit Fall (10 games of 40 s, seeds 101-110)
we got: brain 6.4 fruit a game, blind 1.6, swapped 0.0. Run it yourself:

    python examples/06_is_it_really_the_brain.py
"""
import numpy as np

from flyplays import Fly, play
from flyplays.games.fruit import FruitFall


class Blind(FruitFall):
    def sense(self):
        return []


class Swapped(FruitFall):
    def act(self, d):
        d.left, d.right = d.right, d.left
        super().act(d)


fly = Fly()
seeds = range(101, 111)
for name, game in (("brain", FruitFall), ("blind", Blind), ("swapped", Swapped)):
    scores = [play(game(), fly, seed=s, seconds=40).score for s in seeds]
    print(f"{name:8} {np.mean(scores):5.2f} fruit a game   {scores}")
