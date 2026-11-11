"""The shortest way in: a real fruit fly brain plays Fruit Fall for 30 seconds.

    pip install flyplays
    python examples/01_quickstart.py

The first run downloads the brain (~260 MB, once). No browser, no GPU needed.
"""
from flyplays import play
from flyplays.games.fruit import FruitFall

result = play(FruitFall(), seed=1, seconds=30)
print(result)            # fruit seed 1: score 9 in 30.0 s (still going; left ..., right ..., escape ...)
