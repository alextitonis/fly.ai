"""Fast checks: python -m pytest tests (needs the brain files; downloads them once)."""
import numpy as np

from flyplays import Decision, Fly, Thing, play
from flyplays.game import Game, Tap
from flyplays.games import load
from flyplays.games.fruit import FruitFall


def test_thing_at_bearings():
    t = Game.thing_at(10, 100, 5)
    assert t.bearing > 0 and abs(t.size - 2 * np.arctan(5 / np.hypot(10, 100))) < 1e-9
    assert Game.thing_at(-10, 100, 5).bearing < 0
    assert abs(Game.thing_at(0, 100, 5).bearing) < 1e-12


def test_inputs_go_to_the_side_they_are_on():
    fly = Fly(device="cpu")
    fly.inputs([Thing(bearing=-1.0, kind="target")])
    assert fly.drive["chaseL"] > 0 and fly.drive["chaseR"] == 0
    fly.inputs([Thing(bearing=1.0, kind="target")])
    assert fly.drive["chaseR"] > 0 and fly.drive["chaseL"] == 0
    fly.inputs([Thing(bearing=0.5, size=0.1, key=1)])
    fly.inputs([Thing(bearing=0.5, size=0.3, key=1)])           # it grew: looming on the right
    assert fly.drive["loomR"] > 0 and fly.drive["loomL"] == 0


def test_decision_actions():
    d = Decision(left=True, escape=True, steer_hz=(20, 5), escape_hz=(10, 100))
    assert d.actions == {"left", "escape"} and d.turn_hz == -15 and d.escape_side == "R"


def test_tap_rests():
    tap = Tap(0.1)
    assert tap(True, 0.02) and not tap(True, 0.02)
    for _ in range(5):
        tap(False, 0.02)
    assert tap(True, 0.02)


def test_fruit_plays_and_replays():
    fly = Fly(device="cpu")
    a = play(FruitFall(), fly, seed=7, seconds=4)
    b = play(FruitFall(), fly, seed=7, seconds=4)
    assert a.seconds > 3.9 and a.score == b.score and a.actions == b.actions


def test_load_builtin_and_path():
    assert load("fruit") is FruitFall
    assert load("flyplays.games.fruit:FruitFall") is FruitFall


def test_clip(tmp_path):
    out = tmp_path / "c.mp4"
    r = play(FruitFall(), Fly(device="cpu"), seed=1, seconds=1, clip=out)
    assert out.exists() and out.stat().st_size > 10_000 and r.clip
