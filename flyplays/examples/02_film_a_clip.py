"""Film the fly playing: a 9:16 video (1080x1920, 50 fps) with the game on top and the fly's neurons
underneath - the eye neurons, the decision neurons and a live strip of spikes. Ready for TikTok / Shorts.

    python examples/02_film_a_clip.py

Play a few seeds and keep the best one: every seed is a different game.
"""
from flyplays import Fly, play
from flyplays.games.fruit import FruitFall

fly = Fly()                                   # load the brain once, reuse it for every game
best = None
for seed in range(1, 6):
    r = play(FruitFall(), fly, seed=seed, seconds=25)
    print(r)
    if best is None or r.score > best.score:
        best = r

# a seed replays the same game, so film the best one
clip = play(FruitFall(), fly, seed=best.seed, seconds=25, clip=f"fruit-seed{best.seed}.mp4")
print("filmed:", clip.clip)
