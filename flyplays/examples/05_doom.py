"""The fly plays Doom (Freedoom, the free Doom-engine game) through ViZDoom.

    pip install "flyplays[doom]"
    python examples/05_doom.py

Monsters are "creatures" on the side they're on (the fly sees ~330 degrees); the steering neurons turn the player,
and a burst on the escape neurons (a real fly's escape jump) pulls the trigger. Levels: center, corridor, map01, e1m1.
"""
from flyplays import Fly, play
from flyplays.games.doom import Doom

fly = Fly(dt=Doom.dt)
for seed in (1, 2, 3):
    print(play(Doom(level="center"), fly, seed=seed, seconds=60))
print(play(Doom(level="center"), fly, seed=1, seconds=20, clip="doom.mp4"))
