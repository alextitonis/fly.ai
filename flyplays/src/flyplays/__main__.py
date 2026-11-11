"""flyplays command line.

    flyplays list
    flyplays play fruit [--seed 3] [--seconds 60] [--clip fruit.mp4]
    flyplays play flappy --flies 8 --dt 0.01 --clip flappy.mp4
    flyplays play doom --opt level=e1m1
    flyplays play my_game:MyGame                      # your own game class
    flyplays web https://example.com/game --keys left=ArrowLeft,right=ArrowRight,escape=Space \\
                 --player 0.5,0.85 --facing up [--target-color "#ff3030"] [--clip web.mp4]
    flyplays install-browser                          # once, for web games
"""
from __future__ import annotations

import argparse
import subprocess
import sys


def seeds(text: str) -> list[int]:
    out = []
    for part in str(text).split(","):
        a, _, b = part.partition("-")
        out += list(range(int(a), int(b or a) + 1))
    return out


def pairs(items, cast=float) -> dict:
    out = {}
    for kv in items or []:
        for one in kv.split(","):
            k, _, v = one.partition("=")
            out[k.strip()] = cast(v) if cast else v
    return out


def value(v: str):
    for f in (int, float):
        try:
            return f(v)
        except ValueError:
            pass
    return {"true": True, "false": False}.get(v.lower(), v)


def common(ap):
    ap.add_argument("--seed", default="1", help="a seed, or a range like 1-10")
    ap.add_argument("--seconds", type=float, default=60.0, help="stop after this much game time")
    ap.add_argument("--until", type=float, help="stop shortly after reaching this score")
    ap.add_argument("--clip", help="film to this .mp4 (9:16); with several seeds, {seed} is replaced")
    ap.add_argument("--flies", type=int, default=1, help="flies voting (a brain batch; best on a GPU)")
    ap.add_argument("--device", default="auto", help="auto | cpu | cuda")
    ap.add_argument("--dt", type=float, help="brain step in seconds (default 0.02)")
    ap.add_argument("--set", nargs="*", help="interface settings, e.g. threshold=8 escape=60 (see flyplays.fly.DEFAULT)")


def run(game_factory, a, game_dt=None) -> None:
    from .fly import Fly
    from .runner import play
    fly = Fly(flies=a.flies, device=a.device, dt=a.dt or game_dt)
    for sd in seeds(a.seed):
        clip = a.clip.replace("{seed}", str(sd)) if a.clip else None
        r = play(game_factory(), fly, seed=sd, seconds=a.seconds, clip=clip, until=a.until, settings=pairs(a.set))
        print(r, f"-> {r.clip}" if r.clip else "", flush=True)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="flyplays", description="A real fruit fly brain plays games.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="the built-in games")
    p = sub.add_parser("play", help="play a built-in game or your own (module:Class)")
    p.add_argument("game")
    p.add_argument("--opt", nargs="*", help="game options, e.g. level=e1m1 easy=true")
    common(p)
    w = sub.add_parser("web", help="play any web game, seen through its pixels")
    w.add_argument("url")
    w.add_argument("--keys", required=True, help="action=key pairs: left=ArrowLeft,right=ArrowRight,escape=Space "
                                                 "(add :tap or :hold; escape taps, left/right hold by default)")
    w.add_argument("--player", default="0.5,0.5", help="where the player is, as x,y fractions of the screen")
    w.add_argument("--facing", default="up", choices=["up", "right"], help="up = top-down, right = side-scroller")
    w.add_argument("--target-color", help="colour of things to go to, e.g. #ff3030")
    w.add_argument("--start-keys", default="Space", help="keys pressed once to start the game (comma-separated)")
    w.add_argument("--size", default="640,480", help="browser window, width,height")
    common(w)
    sub.add_parser("install-browser", help="download Chromium for web games (once)")
    a = ap.parse_args(argv)

    if a.cmd == "list":
        from .games import GAMES
        for name, (_, about) in GAMES.items():
            print(f"  {name:8} {about}")
        print("  web      any web game by URL: flyplays web <url> --keys ...")
    elif a.cmd == "install-browser":
        sys.exit(subprocess.call([sys.executable, "-m", "playwright", "install", "chromium"]))
    elif a.cmd == "play":
        from .games import load
        cls = load(a.game)
        opts = {k: value(v) for k, v in pairs(a.opt, cast=None).items()}
        run(lambda: cls(**opts), a, getattr(cls, "dt", None))
    elif a.cmd == "web":
        from .games.web import PixelGame
        px, py = (float(x) for x in a.player.split(","))
        size = tuple(int(x) for x in a.size.split(","))
        keys = pairs([a.keys], cast=None)
        run(lambda: PixelGame(a.url, keys, (px, py), a.facing, a.target_color,
                              tuple(k for k in a.start_keys.split(",") if k), size), a)


if __name__ == "__main__":
    main()
