"""Any web game, with no code for the game itself: the fly sees only the pixels.

    pip install "flyplays[web]" && flyplays install-browser
    python examples/04_any_web_game.py

Same thing from the command line:

    flyplays web https://nebezb.com/floppybird/ --keys left=Space:tap --player 0.3,0.45 --facing right \
                 --size 480,720 --seconds 20 --clip web.mp4

What the fly sees: anything that moves is a "creature" (it looms as it comes closer); with target_color, things
of that colour are "targets" to go to. Tell it where the player is (fractions of the screen) and which way it
faces: "up" for top-down games, "right" for side-scrollers. Map the fly's three actions to the game's keys.

It takes a screenshot every brain step, so it plays slower than real time - the clip still plays at real speed.
Only use games you're allowed to automate, and never games that post to public leaderboards.
"""
from flyplays import play
from flyplays.games.web import PixelGame

game = PixelGame(
    "https://nebezb.com/floppybird/",              # Floppy Bird, Nebez Briefkani's open-source Flappy remake
    keys={"left": "Space:tap"},                    # side view: "turn left" = up = flap
    player=(0.3, 0.45), facing="right", viewport=(480, 720),
)
print(play(game, seed=1, seconds=20, clip="web.mp4"))
