"""FlightPass autopilot for Flybook: a pass's owner gets their daily missions, duels and hatchings done for them.

    python flybook/worker/autopilot.py --once --dry-run   # what it would do now, nothing written
    python flybook/worker/autopilot.py --loop             # forever, a pass every --every seconds (default 300)

FlightPass (flytrade/autopilot/SPEC.md, 2026-09-28) is one NFT per holder wallet; the mine server holds its settings.
Each pass asks GET {MINE_URL}/api/flightpass/autopilot?game=flybook (header Authorization: Bearer FLIGHTPASS_WORKER_KEY) for the unlisted passes
with Flybook on, finds the owner's Flybook account by its wallet (profiles.wallet, set by a Web3 sign-in), and does
what the owner would click, through the same functions as the API (api.py), so every limit and check still applies:

  missions  pokes up to 3 a day (more, up to 6, until one of the flies reacts: the "stir" mission), one per pass
            (the API allows one every 2 minutes), and likes on other people's recent posts up to 5 a day
  duels     up to DUELS_PER_DAY challenges a day, one of the owner's active flies against a random active fly
  breed     one hatching a day while the owner is under their fly cap: two of their flies, or one with a house fly

It only replaces clicks: targets are picked at random, and what the flies post, how they react, who wins a duel and
what a child inherits stay the brains' and the existing rules'. Autopilot likes are stored with likes.auto, so they
don't count toward anyone's "10 likes from holders" mission (20260928120000_flightpass_auto_likes.sql). Progress is
read back from the database every pass, so running it twice a day or after a restart does nothing extra. If the mine
server can't be reached, the pass is skipped.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (as api.py), MINE_URL (https://flyai-mine.fly.dev),
FLIGHTPASS_WORKER_KEY.
"""
from __future__ import annotations

import argparse
import os
import random
import time
from dataclasses import dataclass
from urllib.parse import quote

import requests

MINE_URL = os.environ.get("MINE_URL", "https://flyai-mine.fly.dev").rstrip("/")
WORKER_KEY = os.environ.get("FLIGHTPASS_WORKER_KEY", "")
POKES_DAY = 3          # the "Poke a patch 3 times" mission
POKES_MAX = 6          # keep poking (one per pass) until a fly reacts, but no more than this a day
LIKES_DAY = 5          # the "Like 5 posts" mission
DUELS_PER_DAY = 3
BREEDS_PER_DAY = 1
LIKE_WINDOW = 2 * 86400  # like posts from the last two days


@dataclass
class Flags:
    missions: bool = False
    duels: bool = False
    breed: bool = False


@dataclass
class Today:
    pokes: int = 0
    stirred: int = 0     # posts that reacted to today's pokes
    likes: int = 0
    duels: int = 0
    breeds: int = 0


@dataclass
class Plan:
    poke: bool = False
    likes: int = 0
    duel: bool = False
    breed: bool = False

    def empty(self) -> bool:
        return not (self.poke or self.likes or self.duel or self.breed)


def owners(passes: list[dict]) -> dict[str, Flags]:
    """Owner wallet -> what autopilot does for them. A wallet with several passes gets each game any of them has on;
    listed passes are skipped (the server leaves them out too)."""
    out: dict[str, Flags] = {}
    for p in passes:
        wallet = str(p.get("owner") or "").lower()
        if not wallet.startswith("0x") or len(wallet) != 42 or p.get("listed"):
            continue
        # the mine server sends the Flybook settings themselves ({missions, duels, breed}); accept them nested too
        s = p.get("settings") or {}
        s = s.get("flybook") or {} if "flybook" in s else s
        f = out.setdefault(wallet, Flags())
        f.missions |= bool(s.get("missions"))
        f.duels |= bool(s.get("duels"))
        f.breed |= bool(s.get("breed"))
    return {w: f for w, f in out.items() if f.missions or f.duels or f.breed}


def plan(flags: Flags, today: Today) -> Plan:
    """What to do on this pass, from what's already done today."""
    poke = flags.missions and (today.pokes < POKES_DAY or (today.stirred == 0 and today.pokes < POKES_MAX))
    return Plan(poke=poke,
                likes=max(0, LIKES_DAY - today.likes) if flags.missions else 0,
                duel=flags.duels and today.duels < DUELS_PER_DAY,
                breed=flags.breed and today.breeds < BREEDS_PER_DAY)


def fetch_passes(http: requests.Session) -> list[dict] | None:
    """The mine server's list, or None when it can't be read (the pass is skipped)."""
    if not WORKER_KEY:
        print("autopilot: FLIGHTPASS_WORKER_KEY is not set; skipping", flush=True)
        return None
    try:
        r = http.get(f"{MINE_URL}/api/flightpass/autopilot", params={"game": "flybook"},
                     headers={"Authorization": f"Bearer {WORKER_KEY}"}, timeout=60)   # the mine server can be slow under the mining fleet
        r.raise_for_status()
        body = r.json()
    except Exception as e:
        print(f"autopilot: couldn't read the passes from the mine server ({type(e).__name__}: {e}); skipping", flush=True)
        return None
    passes = body.get("passes") if isinstance(body, dict) else body
    return passes if isinstance(passes, list) else []


def mix(a: str, b: str) -> str:
    """The child's colour: halfway between its parents'."""
    try:
        ca, cb = int(a[1:], 16), int(b[1:], 16)
    except (TypeError, ValueError):
        return "#e0342c"
    return "#" + "".join(f"{(((ca >> s) & 255) + ((cb >> s) & 255)) // 2:02x}" for s in (16, 8, 0))


class Account:
    """One owner's Flybook account, driven through api.py's own functions."""

    def __init__(self, api, uid: str, wallet: str, rng: random.Random, dry: bool):
        self.api, self.uid, self.wallet, self.rng, self.dry = api, uid, wallet, rng, dry
        self.user = {"id": uid}

    def today(self) -> Today:
        rest, since = self.api.rest, quote(self.api.utc_midnight())
        pokes = rest("GET", f"pokes?select=id&user_id=eq.{self.uid}&created_at=gte.{since}")
        ids = ",".join(str(p["id"]) for p in pokes)
        stirred = len(rest("GET", f"posts?select=id&poke_id=in.({ids})&limit=1")) if ids else 0
        return Today(pokes=len(pokes), stirred=stirred,
                     likes=self.api.count(f"likes?select=post_id&user_id=eq.{self.uid}&created_at=gte.{since}"),
                     duels=self.api.count(f"duels?select=id&requested_by=eq.{self.uid}&created_at=gte.{since}"),
                     breeds=self.api.count(f"flies?select=id&owner=eq.{self.uid}&parents=not.is.null&auto_born=eq.false"
                                           f"&created_at=gte.{since}"))

    def my_flies(self) -> list[dict]:
        return self.api.rest("GET", f"flies?select=id,name,color,patch_id,active&owner=eq.{self.uid}&order=created_at")

    def act(self, what: str, fn, *args) -> bool:
        if self.dry:
            print(f"  would {what}", flush=True)
            return True
        try:
            fn(*args)
            print(f"  {what}", flush=True)
            return True
        except self.api.ApiError as e:
            print(f"  couldn't {what}: {e}", flush=True)
            return False

    def poke(self) -> None:
        """A random stimulus in a patch where the owner has an active fly (any patch if none), so it can react."""
        mine = sorted({f["patch_id"] for f in self.my_flies() if f.get("active")})
        patches = mine or [p["id"] for p in self.api.rest("GET", "patches?select=id")]
        self.rng.shuffle(patches)
        for patch in patches[:3]:   # a patch may already have its 3 pokes waiting: try another
            if self.act(f"poke {patch}", self.api.poke, self.user, self.wallet,
                        {"patch_id": patch, "stimulus": self.rng.choice(self.api.POKE_STIMULI)}):
                return

    def like(self, n: int) -> None:
        since = quote(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - LIKE_WINDOW)))
        posts = self.api.rest("GET", f"posts?select=id,flies(owner)&created_at=gte.{since}&order=created_at.desc&limit=200")
        posts = [p["id"] for p in posts if (p.get("flies") or {}).get("owner") != self.uid]
        if not posts:
            return
        liked = {r["post_id"] for r in self.api.rest(
            "GET", f"likes?select=post_id&user_id=eq.{self.uid}&post_id=in.({','.join(map(str, posts))})")}
        todo = [p for p in posts if p not in liked]
        for post_id in self.rng.sample(todo, min(n, len(todo))):
            self.act(f"like post {post_id}", self.api.set_like, self.user, self.wallet, post_id, True, True)

    def duel(self) -> None:
        mine = [f for f in self.my_flies() if f.get("active")]
        if not mine:
            return
        others = [f["id"] for f in self.api.rest("GET", f"flies?select=id&active=eq.true&owner=neq.{self.uid}&limit=500")]
        others += [f["id"] for f in self.api.rest("GET", "flies?select=id&active=eq.true&owner=is.null&limit=200")]
        if not others:
            return
        fly, opponent = self.rng.choice(mine), self.rng.choice(others)
        self.act(f"challenge {opponent} with {fly['id']}", self.api.challenge, self.user, self.wallet,
                 {"fly_id": fly["id"], "opponent_id": opponent})

    def breed(self) -> None:
        """Two of the owner's flies, or one of theirs with a house fly. At the fly cap the API refuses: fine."""
        mine = self.my_flies()
        if not mine:
            return
        if len(mine) >= 2:
            a, b = self.rng.sample(mine, 2)
        else:
            house = self.api.rest("GET", "flies?select=id,name,color,patch_id&owner=is.null&limit=200")
            if not house:
                return
            a, b = mine[0], self.rng.choice(house)
        name = f"{a['name'][:18].strip()} x {b['name'][:18].strip()}"
        self.act(f"hatch {name}", self.api.breed, self.user, self.wallet,
                 {"parent_a": a["id"], "parent_b": b["id"], "name": name, "color": mix(a.get("color"), b.get("color")),
                  "patch_id": a["patch_id"]})

    def run(self, p: Plan) -> None:
        if p.poke:
            self.poke()
        if p.likes:
            self.like(p.likes)
        if p.duel:
            self.duel()
        if p.breed:
            self.breed()


def once(dry: bool, rng: random.Random, http: requests.Session) -> int:
    """One pass over every owner. Returns how many owners had something to do."""
    passes = fetch_passes(http)
    if passes is None:
        return 0
    import api   # needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, like the API process
    busy = 0
    for wallet, flags in owners(passes).items():
        try:
            rows = api.rest("GET", f"profiles?select=id&wallet=eq.{wallet}")
            if not rows:
                continue   # no Flybook account signed in with this wallet
            acct = Account(api, rows[0]["id"], wallet, rng, dry)
            p = plan(flags, acct.today())
            if p.empty():
                continue
            busy += 1
            print(f"autopilot {wallet[:6]}…{wallet[-4:]}: {p}", flush=True)
            acct.run(p)
        except Exception as e:   # one account's trouble must not stop the others
            print(f"autopilot {wallet[:6]}…{wallet[-4:]} failed: {type(e).__name__}: {e}", flush=True)
    return busy


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--once", action="store_true", help="one pass, then exit")
    ap.add_argument("--loop", action="store_true", help="forever, one pass every --every seconds")
    ap.add_argument("--every", type=float, default=300.0, help="seconds between passes (pokes are one per pass)")
    ap.add_argument("--dry-run", action="store_true", help="read and print what it would do; write nothing")
    args = ap.parse_args()
    rng, http = random.Random(), requests.Session()
    if not args.loop:
        once(args.dry_run, rng, http)
        return
    while True:
        started = time.monotonic()
        try:
            once(args.dry_run, rng, http)
        except Exception as e:
            print(f"autopilot pass failed: {type(e).__name__}: {e}", flush=True)
        time.sleep(max(10.0, args.every - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
