"""Flybook tick: every fly lives one episode in its patch and posts what its brain says and does.

    python flybook/worker/tick.py --json feed.json --ticks 4
    python flybook/worker/tick.py                                # Supabase (env below), one tick
    python flybook/worker/tick.py --every 120 --poke-poll 10     # forever: a tick every 2 min, pokes within ~10 s

Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the worker is the only writer of posts),
FLY_DATA (brain files), NUMBA_NUM_THREADS.

The patch decides what happens to a fly (its event mix). The fly's brain decides what it
says: the translator reads its descending neurons and the post is that word, with the word's
held-out precision as confidence and the real event next to it. The action reader (actions.py)
adds what the fly did (jumped, turned, groomed...). Post kinds: sense (read it right), misread
(read the wrong thing), hallucination (read something when nothing happened), action (no word,
but it did something). A fly that reads nothing and does nothing doesn't post. A poke (queued by
a holder through the API) replaces the patch's random event for every fly in that patch.
A word is posted only when the translator's score reaches that word's threshold (model/vocab.json,
picked by readout.py on patch episodes). After each full tick the worker settles duels and pairs
flies of different owners to mate (mating.py). Owners' holder checks are cached for HOLDER_TTL.
No text is generated.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import random
import time
import uuid
from pathlib import Path

import numpy as np
import requests

import chain
import launches
import market
import minds
from settings import FREE_FLIES
from actions import ACTIONS, MIN_EXTRA, PROFILE_SAMPLES, Z_MIN, ActionReader, profile_key
from patch import CHANNELS, REACH, SOCIAL_MIN, TRACE_GROUPS, WORD_OF, PatchRunner
import duels as duel_rules
import mating
from calibrate import MODEL, git_sha
from episode import CONFIG, HERE, Episodes, features
from flybrain import __version__ as FLYBRAIN_VERSION
from flybrain.reservoir import Readout


SEASON_BOARD_EVERY = 300.0   # seconds between refreshes of season_board_cache


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def house_rows() -> tuple[list[dict], list[dict]]:
    d = json.loads((HERE / "house.json").read_text())
    flies = [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"flybook:house:{f['name']}")), "owner": None, "seed": i, **f}
             for i, f in enumerate(d["flies"])]
    return d["patches"], flies


class SupabaseStore:
    def __init__(self, url: str, key: str):
        self.url, self.key = url.rstrip("/"), key
        self.base = url.rstrip("/") + "/rest/v1"
        self.http = requests.Session()
        self.http.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

    def _req(self, method: str, path: str, prefer: str | None = None, **kw):
        headers = {"Prefer": prefer} if prefer else {}
        r = self.http.request(method, f"{self.base}/{path}", headers=headers, timeout=30, **kw)
        if not r.ok:
            raise RuntimeError(f"{method} {path}: {r.status_code} {r.text[:300]}")
        return r.json() if r.content else None

    def refresh_season_board(self) -> int:
        """The Season points board's stored copy (season_board_cache, 2026-10-08): computing it live took over the
        3 s the site's anonymous reads may take, and the board showed "No missions completed" to everyone."""
        return int(self._req("POST", "rpc/refresh_season_board", json={}) or 0)

    def seed_house(self, patches, flies) -> None:
        self._req("POST", "patches?on_conflict=id", "resolution=merge-duplicates", json=patches)
        self._req("POST", "flies?on_conflict=id", "resolution=merge-duplicates", json=flies)

    def house(self):
        return self._req("GET", "patches?select=*"), self._req("GET", "flies?select=*&order=created_at,name")

    def recent_owners(self, days: float) -> set[str]:
        """Accounts active in the last `days`: signed in (Supabase Auth), liked by hand, or poked."""
        since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - days * 86_400))
        out = {r["user_id"] for r in self._req("GET", f"likes?select=user_id&created_at=gt.{since}&auto=is.false") or []}
        out |= {r["user_id"] for r in self._req("GET", f"pokes?select=user_id&created_at=gt.{since}") or []}
        page = 1
        while True:                                       # the Auth admin list, 1000 a page
            r = self.http.get(f"{self.url}/auth/v1/admin/users", params={"page": page, "per_page": 1000}, timeout=30)
            if not r.ok:
                raise RuntimeError(f"auth users: {r.status_code} {r.text[:200]}")
            users = r.json().get("users") or []
            out |= {u["id"] for u in users if (u.get("last_sign_in_at") or "") > since}
            if len(users) < 1000:
                return {o for o in out if o}
            page += 1

    def begin_tick(self, row: dict) -> dict:
        return self._req("POST", "ticks", "return=representation", json=row)[0]

    def add_posts(self, rows: list[dict]) -> list[dict]:
        return self._req("POST", "posts", "return=representation", json=rows) if rows else []

    def add_threads(self, rows: list[dict]) -> None:
        if rows:
            self._req("POST", "threads?on_conflict=parent_post,child_post", "resolution=ignore-duplicates", json=rows)

    def set_positions(self, moves: list[tuple]) -> None:
        for fly_id, x, y, heading in moves:
            self._req("PATCH", f"flies?id=eq.{fly_id}", json={"x": x, "y": y, "heading": heading})

    def finish_tick(self, tick_id: int, stats: dict) -> None:
        self._req("PATCH", f"ticks?id=eq.{tick_id}", json=stats)

    def wallets(self, owners: set[str]) -> dict[str, str]:
        rows = self._req("GET", f"profiles?select=id,wallet&id=in.({','.join(sorted(owners))})")
        return {r["id"]: r["wallet"] for r in rows if r.get("wallet")}

    def saved_profiles(self, version: str) -> dict:
        rows = self._req("GET", f"ticks?select=profiles:config->actions->profiles_rest"
                                f"&config->actions->>profile_version=eq.{version}"
                                f"&config->actions->profiles_rest=not.is.null&order=id.desc&limit=1")
        return (rows[0].get("profiles") or {}) if rows else {}

    # fly market (market.py)
    def open_wallets(self, ids: list[str]) -> None:
        if ids:
            eth = [c["price"] for c in self._req("GET", "market_coins?select=price&symbol=eq.ETH") or []]
            if not eth:                              # no round since the reset yet: ask the price feeds
                import prices
                eth = [prices.fetch().get("ETH")]
            market.set_eth_usd(eth[0] if eth else None)
            self._req("POST", "fly_portfolios?on_conflict=fly_id", "resolution=ignore-duplicates",
                      json=[market.new_portfolio(i) for i in ids])

    def market_paused(self) -> bool:
        rows = self._req("GET", "market_control?select=paused&id=eq.1")
        return bool(rows and rows[0].get("paused"))

    def market_coins(self) -> list[dict]:
        return self._req("GET", "market_coins?select=*")

    def market_history(self, n: int) -> list[dict]:
        return self._req("GET", f"market_rounds?select=id,prices&order=id.desc&limit={n}")

    # fly-made coins (launches.py)
    def bonds(self) -> dict:
        """Every relationship over the last 7 days: {(fly a, fly b) sorted: label} (fly_bonds)."""
        rows = self._req("POST", "rpc/fly_bonds", json={"focus_fly": None, "window_days": 7}) or []
        return {launches.pair(r["a"], r["b"]): r["label"] for r in rows}

    def recent_social(self) -> list[dict]:
        """The last market round's launches, shills, FUD, buybacks and dumps (none if that round had none: older events
        must not repeat every round)."""
        last = self._req("GET", "market_rounds?select=id&order=id.desc&limit=1") or []
        if not last:
            return []
        return self._req("GET", f"market_social?select=fly_id,kind,symbol,reach,round_id&round_id=eq.{last[0]['id']}&limit=300") or []

    def launches_today(self) -> int:
        midnight = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT00:00:00+00:00")
        return len(self._req("GET", f"market_social?select=id&kind=eq.launch&created_at=gte.{requests.utils.quote(midnight)}") or [])

    def recent_feed(self) -> dict:
        """Posts, and people's likes and comments per fly, since the last market round (feedflow.py)."""
        last = self._req("GET", "market_rounds?select=started_at&order=id.desc&limit=1") or []
        since = last[0]["started_at"] if last else (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=15)).isoformat()
        q = requests.utils.quote(since)
        posts = self._req("GET", f"posts?select=fly_id,word,kind,actions,cause&created_at=gte.{q}&order=id&limit=2000") or []
        counts = {}
        for table in ("likes", "comments"):
            per: dict[str, int] = {}
            for row in self._req("GET", f"{table}?select=post:posts(fly_id)&created_at=gte.{q}&limit=5000") or []:
                fly = (row.get("post") or {}).get("fly_id")
                if fly:
                    per[fly] = per.get(fly, 0) + 1
            counts[table] = per
        return {"posts": posts, "likes": counts["likes"], "comments": counts["comments"], "since": since}

    def save_coin_image(self, path: str, data: bytes) -> None:
        r = self.http.post(f"{self.url}/storage/v1/object/coins/{path}", data=data, timeout=60, headers={
            "Content-Type": "image/webp", "cache-control": "31536000", "x-upsert": "false"})
        if not r.ok:
            raise RuntimeError(f"coin image upload: {r.status_code} {r.text[:200]}")

    def portfolios(self, ids: list[str]) -> list[dict]:
        if not ids:
            return []
        return self._req("GET", f"fly_portfolios?select=fly_id,eth,holdings,start_eth,value_eth,trades&fly_id=in.({','.join(ids)})")

    def minds(self, ids: list[str]) -> list[dict]:
        if not ids:
            return []
        return self._req("GET", f"fly_minds?select=fly_id,traits,learned,memory,tubes,inherit,stats,parents,learning,launch&fly_id=in.({','.join(ids)})")

    def save_market(self, round_row: dict, coins: list[dict], portfolios: list[dict], trades: list[dict], minds: list[dict],
                    social: list[dict] | None = None) -> None:
        rnd = self._req("POST", "market_rounds", "return=representation", json=round_row)[0]
        stamp = now_iso()
        # a bulk upsert needs the same keys on every row: the fixed coins and the fly-made coins go separately
        fixed = [{k: c.get(k) for k in ("symbol", "name", "kind", "price", "regime", "address", "category")}
                 for c in coins if c.get("kind") != "fly"]
        made = [{k: c.get(k) for k in launches.COIN_KEYS} for c in coins if c.get("kind") == "fly"]
        for rows in (fixed, made):
            if rows:
                self._req("POST", "market_coins?on_conflict=symbol", "resolution=merge-duplicates",
                          json=[{**c, "updated_at": stamp} for c in rows])
        if social:
            self._req("POST", "market_social", json=[{k: e.get(k) for k in ("fly_id", "kind", "symbol", "reach", "detail")}
                                                     | {"round_id": rnd["id"]} for e in social])
        if portfolios:
            self._req("POST", "fly_portfolios?on_conflict=fly_id", "resolution=merge-duplicates",
                      json=[{**p, "updated_at": stamp} for p in portfolios])
        if minds:
            # an owner may have changed a style while the round ran: keep their latest learners and risk
            latest = {m["fly_id"]: m for m in self._req(
                "GET", f"fly_minds?select=fly_id,traits,learning&fly_id=in.({','.join(m['fly_id'] for m in minds)})")}
            for m in minds:
                now = latest.get(m["fly_id"]) or {}
                if now.get("learning"):
                    m["learning"] = now["learning"]
                if (now.get("traits") or {}).get("risk") is not None:
                    m.setdefault("traits", {})["risk"] = now["traits"]["risk"]
            self._req("POST", "fly_minds?on_conflict=fly_id", "resolution=merge-duplicates",
                      json=[{**m, "updated_at": stamp} for m in minds])
        if trades:
            self._req("POST", "fly_trades", json=[{**t, "round_id": rnd["id"]} for t in trades])

    def save_minds(self, rows: list[dict]) -> None:
        if rows:
            self._req("POST", "fly_minds?on_conflict=fly_id", "resolution=merge-duplicates",
                      json=[{**m, "updated_at": now_iso()} for m in rows])

    def set_active(self, fly_id: str, active: bool) -> None:
        self._req("PATCH", f"flies?id=eq.{fly_id}", json={"active": active})

    def pending_pokes(self) -> list[dict]:
        return self._req("GET", "pokes?select=id,patch_id,stimulus,created_at,x,y&consumed_at=is.null&order=id")

    def pending_duels(self, limit: int = 24) -> list[dict]:
        return self._req("GET", f"duels?select=id,kind,a_fly,b_fly&status=eq.pending&order=id&limit={limit}")

    def create_duels(self, rows: list[dict]) -> list[dict]:
        return self._req("POST", "duels", "return=representation", json=rows) if rows else []

    def finish_duel(self, row: dict) -> None:
        self._req("PATCH", f"duels?id=eq.{row['id']}", json={k: v for k, v in row.items() if k != "id"})

    def update_fly(self, fly_id: str, fields: dict) -> None:
        self._req("PATCH", f"flies?id=eq.{fly_id}", json=fields)

    def add_fly(self, row: dict) -> dict:
        return self._req("POST", "flies", "return=representation", json=row)[0]

    def add_mating(self, row: dict) -> None:
        self._req("POST", "matings", json=row)

    def consume_pokes(self, ids: list[int], tick_id: int) -> None:
        if ids:
            self._req("PATCH", f"pokes?id=in.({','.join(map(str, ids))})", json={"consumed_at": now_iso(), "tick_id": tick_id})


class JsonStore:
    """Same rows as the database, in one file: the web app's demo feed."""

    def __init__(self, path: Path, keep: int = 600):
        self.path, self.keep = path, keep
        self.refresh_season_board = lambda: 0           # (no missions in the demo feed)
        self.d = json.loads(path.read_text()) if path.exists() else {"patches": [], "flies": [], "ticks": [], "posts": []}

    def seed_house(self, patches, flies) -> None:
        self.d["patches"], self.d["flies"] = patches, [{**f, "created_at": now_iso()} for f in flies]
        self._save()

    def house(self):
        return self.d["patches"], self.d["flies"]

    def begin_tick(self, row: dict) -> dict:
        tick = {"id": self.d["ticks"][-1]["id"] + 1 if self.d["ticks"] else 1, "started_at": now_iso(),
                "finished_at": None, **row}
        self.d["ticks"].append(tick)
        return tick

    def add_posts(self, rows: list[dict]) -> list[dict]:
        start = self.d["posts"][-1]["id"] + 1 if self.d["posts"] else 1
        new = [{"id": start + i, **r, "correct": None if r["word"] == "nothing" else r["word"] == r["truth"],
                "created_at": now_iso()} for i, r in enumerate(rows)]
        self.d["posts"] = (self.d["posts"] + new)[-self.keep:]
        return new

    def add_threads(self, rows: list[dict]) -> None:
        pass

    def set_positions(self, moves: list[tuple]) -> None:
        where = {m[0]: m[1:] for m in moves}
        for f in self.d["flies"]:
            if f["id"] in where:
                f["x"], f["y"], f["heading"] = where[f["id"]]

    def finish_tick(self, tick_id: int, stats: dict) -> None:
        for t in self.d["ticks"]:
            if t["id"] == tick_id:
                t.update(stats)
        self.d["ticks"] = self.d["ticks"][-50:]
        self._save()

    def wallets(self, owners: set[str]) -> dict[str, str]:
        return {}

    def saved_profiles(self, version: str) -> dict:
        for t in reversed(self.d["ticks"]):
            actions = (t.get("config") or {}).get("actions") or {}
            if actions.get("profile_version") == version and actions.get("profiles_rest"):
                return actions["profiles_rest"]
        return {}

    # fly market (market.py), kept in the same file
    def _market(self) -> dict:
        m = self.d.setdefault("market", {"coins": [], "rounds": [], "portfolios": {}, "minds": {}, "trades": []})
        m.setdefault("social", [])
        return m

    def bonds(self) -> dict:
        return {launches.pair(b["a"], b["b"]): b["label"] for b in self._market().get("bonds", [])}

    def recent_social(self) -> list[dict]:
        rounds = self._market()["rounds"]
        latest = rounds[-1]["id"] if rounds else None
        return [e for e in self._market()["social"] if e["round_id"] == latest]

    def launches_today(self) -> int:
        today = now_iso()[:10]
        return sum(e["kind"] == "launch" and e.get("created_at", "")[:10] == today for e in self._market()["social"])

    def recent_feed(self) -> dict:
        rounds = self._market()["rounds"]
        since = rounds[-1].get("started_at", "") if rounds else ""
        return {"posts": [p for p in self.d["posts"] if p.get("created_at", "") >= since], "likes": {}, "comments": {}, "since": since}

    def save_coin_image(self, path: str, data: bytes) -> None:
        out = self.path.parent / "coins" / path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)

    def open_wallets(self, ids: list[str]) -> None:
        for i in ids:
            self._market()["portfolios"].setdefault(i, market.new_portfolio(i))
        self._save()

    def market_paused(self) -> bool:
        return bool(self._market().get("paused"))

    def market_coins(self) -> list[dict]:
        return self._market()["coins"]

    def market_history(self, n: int) -> list[dict]:
        return list(reversed(self._market()["rounds"][-n:]))

    def portfolios(self, ids: list[str]) -> list[dict]:
        return [self._market()["portfolios"][i] for i in ids if i in self._market()["portfolios"]]

    def minds(self, ids: list[str]) -> list[dict]:
        return [self._market()["minds"][i] for i in ids if i in self._market()["minds"]]

    def save_market(self, round_row: dict, coins: list[dict], portfolios: list[dict], trades: list[dict], minds: list[dict],
                    social: list[dict] | None = None) -> None:
        m = self._market()
        rid = (m["rounds"][-1]["id"] + 1) if m["rounds"] else 1
        m["social"] = (m["social"] + [{**e, "round_id": rid, "created_at": now_iso()} for e in social or []])[-500:]
        m["rounds"] = (m["rounds"] + [{**round_row, "id": rid, "started_at": now_iso()}])[-200:]
        m["coins"] = coins
        m["portfolios"].update({p["fly_id"]: p for p in portfolios})
        m["minds"].update({x["fly_id"]: x for x in minds})
        m["trades"] = (m["trades"] + [{**t, "round_id": rid, "created_at": now_iso()} for t in trades])[-500:]
        self._save()

    def save_minds(self, rows: list[dict]) -> None:
        self._market()["minds"].update({x["fly_id"]: x for x in rows})
        self._save()

    def set_active(self, fly_id: str, active: bool) -> None:
        pass

    def pending_pokes(self) -> list[dict]:
        return []

    def pending_duels(self, limit: int = 24) -> list[dict]:
        return []

    def create_duels(self, rows: list[dict]) -> list[dict]:
        return []

    def finish_duel(self, row: dict) -> None:
        pass

    def update_fly(self, fly_id: str, fields: dict) -> None:
        pass

    def add_fly(self, row: dict) -> dict:
        return row

    def add_mating(self, row: dict) -> None:
        pass

    def consume_pokes(self, ids: list[int], tick_id: int) -> None:
        pass

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.d, separators=(",", ":")))


# fewer flies a round (2026-10-07, the user: "simulate much less flies per round to be smaller and cheaper"): only
# the flies of owners active in the last ACTIVE_DAYS (signed in, liked by hand or poked), at most PER_ROUND a round,
# the ones that waited longest first, so every one of them still posts in turn. The others stay as they are (their
# `active` flag is the holder rule's, untouched) and post again once their owner comes back.
ACTIVE_DAYS = float(os.environ.get("FLYBOOK_ACTIVE_DAYS", "3"))
PER_ROUND = int(os.environ.get("FLYBOOK_FLIES_PER_ROUND", "40"))
OWNERS_TTL = 600.0
_owners_cache: dict = {"at": -1e9, "owners": None}
_last_run: dict[str, float] = {}                   # fly id -> when it was last simulated (this process)


def round_flies(store, flies: list[dict]) -> list[dict]:
    """The flies this round simulates: recently active owners' flies (house flies always), PER_ROUND at most."""
    now = time.monotonic()
    if now - _owners_cache["at"] > OWNERS_TTL and hasattr(store, "recent_owners"):
        try:
            _owners_cache.update(at=now, owners=store.recent_owners(ACTIVE_DAYS))
        except Exception as e:                    # unreadable: keep the last list (or everyone, the first time)
            print(f"recent owners unreadable: {e}", flush=True)
    owners = _owners_cache["owners"]
    picked = flies if owners is None else [f for f in flies if not f.get("owner") or f["owner"] in owners]
    picked = sorted(picked, key=lambda f: _last_run.get(f["id"], 0.0))[:PER_ROUND]
    for f in picked:
        _last_run[f["id"]] = now
    return picked


HOLDER_TTL = 300.0   # seconds; the public chain RPC rate-limits (429), and the tick, duel and mating passes all ask
_holder_cache: dict[str, tuple[float, bool]] = {}   # owner -> (checked at, holder)


def active_flies(store, flies: list[dict]) -> list[dict]:
    """House flies always post. A holder's flies all post; a free account's (no wallet, or a wallet below the
    minimum) first FREE_FLIES made flies and its mating-born flies post. The flag is written back so the app can
    show the rest as dormant. If the chain can't be read, keep the old flag.
    Each owner's balance is read at most once per HOLDER_TTL; owners without a wallet need no read."""
    owners = {f["owner"] for f in flies if f.get("owner")}
    if not owners:
        return flies
    now = time.monotonic()
    holder: dict[str, bool | None] = {o: c[1] for o, c in _holder_cache.items() if o in owners and now - c[0] < HOLDER_TTL}
    stale = owners - holder.keys()
    wallets = store.wallets(stale) if stale else {}
    for owner in stale:
        try:
            holder[owner] = owner in wallets and chain.is_holder(chain.balance_of(wallets[owner]))
            _holder_cache[owner] = (now, holder[owner])
        except Exception as e:
            print(f"balance check failed for owner {owner}: {e}", flush=True)
            holder[owner] = None
    # free accounts (email, or a wallet below the minimum): their first FREE_FLIES made flies, every fly born
    # from mating and every merch gift fly stay active; the rest wait dormant until the owner holds. `flies` come oldest first.
    made: dict[str, list[str]] = {}
    for f in flies:
        if f.get("owner") and not f.get("auto_born") and not f.get("gift"):
            made.setdefault(f["owner"], []).append(f["id"])
    out = []
    for f in flies:
        if not f.get("owner"):
            out.append(f)
            continue
        was = f.get("active", True)
        is_holder = holder[f["owner"]]
        if is_holder is None:
            active = was
        else:
            active = is_holder or bool(f.get("auto_born") or f.get("gift")) or f["id"] in made.get(f["owner"], [])[:FREE_FLIES]
        if active != was:
            store.set_active(f["id"], active)
        if active:
            out.append(f)
    return out


def load_model():
    vocab = json.loads((MODEL / "vocab.json").read_text())
    if vocab["config"] != json.loads(json.dumps(CONFIG)):
        raise SystemExit("model/vocab.json was trained on a different episode; rerun calibrate.py")
    return Readout.load(MODEL / "translator.npz"), vocab


def draw(mix: dict[str, float], words: list[str], rng) -> str:
    known = {w: float(v) for w, v in mix.items() if w in words and v > 0}
    if not known:
        return "nothing"
    names = list(known)
    p = np.array([known[w] for w in names])
    return names[rng.choice(len(names), p=p / p.sum())]


POKE_FULL, POKE_REACH = 0.12, 0.35   # a poke hits fully within POKE_FULL of its spot, fading to nothing at POKE_REACH
PROFILE_FITS_PER_TICK = 2            # new settings profiles whose resting baseline is measured per tick (about one brain batch each)
# Resting baselines are saved in the tick row whenever new ones are measured, and reused after a restart while
# this still matches: same brain package, episode, sample count and actions (a deploy used to re-measure every
# profile, ~35 min of slow ticks).
PROFILE_VERSION = hashlib.sha1(json.dumps([FLYBRAIN_VERSION, CONFIG, PROFILE_SAMPLES, [a["key"] for a in ACTIONS]],
                                          sort_keys=True).encode()).hexdigest()[:12]


def settings_of(fly: dict) -> dict:
    return {k: fly.get(k) or {} for k in ("senses", "temperament", "dials")}


def start_position(fly: dict) -> list[float]:
    """Where a fly is: saved by the last tick, or a fixed spot from its id the first time."""
    if fly.get("x") is not None and fly.get("y") is not None:
        return [float(fly["x"]), float(fly["y"]), float(fly.get("heading") or 0.0)]
    r = np.random.default_rng(uuid.UUID(fly["id"]).int % 2**32)
    return [float(r.uniform(0.3, 0.7)), float(r.uniform(0.3, 0.7)), float(r.uniform(0, 2 * np.pi))]


def patch_batches(flies: list[dict], size: int) -> list[list[dict]]:
    """Brain batches that keep each patch's flies together (flies only affect flies in their batch).
    A patch with more flies than a batch is split, and its parts don't affect each other."""
    by_patch: dict[str, list[dict]] = {}
    for f in flies:
        by_patch.setdefault(f["patch_id"], []).append(f)
    batches, current = [], []
    for members in by_patch.values():
        for k in range(0, len(members), size):
            part = members[k:k + size]
            if current and len(current) + len(part) > size:
                batches.append(current)
                current = []
            current = current + part
    if current:
        batches.append(current)
    return batches


def run_tick(store, eps: Episodes, reader: ActionReader, runner: PatchRunner, translator: Readout, vocab: dict, rng,
             min_precision: float, patches_only: set[str] | None = None, pokes: list[dict] | None = None,
             mate_reads: list[str] | None = None) -> dict:
    """One pass over every active fly, or just `patches_only` for a poke. Each patch runs as one shared
    brain batch: its event (or its oldest waiting poke) hits one spot, and every other fly only gets what
    its neighbours' brains do (patch.py). Flies whose translator read 'mate' are appended to `mate_reads`."""
    precision = vocab["test"]["precision"]
    thresholds = vocab.get("thresholds", {})
    postable = sorted(w for w in eps.words if w != "nothing" and precision[w] >= min_precision)
    mean, sd = np.array(vocab["rest"]["mean"]), np.array(vocab["rest"]["sd"])
    if vocab["rest"]["types"] != eps.types.tolist():
        raise SystemExit("DN types differ from the calibration brain; rerun calibrate.py")
    patches, flies = store.house()
    flies = active_flies(store, flies)
    if patches_only is not None:
        flies = [f for f in flies if f["patch_id"] in patches_only]
    flies = round_flies(store, flies)
    if not flies:
        return {}
    poke_for: dict[str, dict] = {}
    for pk in (store.pending_pokes() if pokes is None else pokes):
        poke_for.setdefault(pk["patch_id"], pk)          # the oldest waiting poke per patch
    mixes = {p["id"]: p["event_mix"] for p in patches}
    seed = int(rng.integers(2**31))
    t0 = time.perf_counter()
    # actions are judged against rest with each fly's own settings; until a profile is measured its flies show none
    new = reader.missing([settings_of(f) for f in flies])
    if new:
        reader.fit_profiles(new[:PROFILE_FITS_PER_TICK], seed=seed ^ 0x5EED)
        print(f"resting baseline for {len(new[:PROFILE_FITS_PER_TICK])} settings profile(s) in {time.perf_counter() - t0:.0f} s, "
              f"{max(0, len(new) - PROFILE_FITS_PER_TICK)} still waiting", flush=True)
    tick = store.begin_tick({
        "git_sha": os.environ.get("GIT_SHA") or git_sha(),
        "config": {**vocab["config"], "min_precision": min_precision, "seed": seed,
                   "patches": sorted(patches_only) if patches_only is not None else "all",
                   "pokes": sorted(p["id"] for p in poke_for.values()),
                   "actions": {"z_min": Z_MIN, "min_extra": MIN_EXTRA, "baseline": "own settings",
                               "profile_samples": PROFILE_SAMPLES, "profiles": len(reader.own),
                               "profile_version": PROFILE_VERSION,
                               **({"profiles_rest": reader.export_profiles()} if new else {}),
                               "waiting": len(reader.missing([settings_of(f) for f in flies])), "standard_rest": reader.rest},
                   "social": {"reach": REACH, "channels": CHANNELS, "poke_full": POKE_FULL, "poke_reach": POKE_REACH,
                              "label_rule": vocab.get("label_rule") or {"kind": "peak", "threshold": SOCIAL_MIN}}},
        "translator": {"version": vocab["version"], "precision": precision, "recall": vocab["test"]["recall"],
                       "postable": postable},
    })
    rows, moves, replay = [], [], {}
    for n, batch in enumerate(patch_batches(flies, eps.max_batch)):
        pad = 0                                            # a brain run has exactly this batch's flies
        pos = np.array([start_position(f) for f in batch] + [[0.5, 0.5, 0.0]] * pad)
        direct: list[tuple[str | None, float]] = [(None, 0.0)] * len(batch)
        events = {}
        for pid in dict.fromkeys(f["patch_id"] for f in batch):
            idx = [i for i, f in enumerate(batch) if f["patch_id"] == pid]
            poke = poke_for.get(pid)
            if poke:
                spot = (float(poke["x"]) if poke.get("x") is not None else 0.5,
                        float(poke["y"]) if poke.get("y") is not None else 0.5)
                d = np.hypot(pos[idx, 0] - spot[0], pos[idx, 1] - spot[1])
                strength = np.clip((POKE_REACH - d) / (POKE_REACH - POKE_FULL), 0.0, 1.0)
                strength[int(np.argmin(d))] = 1.0                  # a poke always reaches the nearest fly
                for i, k in zip(idx, strength):
                    if k > 0:
                        direct[i] = (poke["stimulus"], float(k))
                events[pid] = {"stimulus": poke["stimulus"], "x": spot[0], "y": spot[1], "poke_id": poke["id"], "fly_id": None}
            else:
                word = draw(mixes[pid], eps.words, rng)
                if word != "nothing":
                    focal = idx[int(rng.integers(len(idx)))]
                    direct[focal] = (word, 1.0)
                    events[pid] = {"stimulus": word, "x": float(pos[focal, 0]), "y": float(pos[focal, 1]),
                                   "poke_id": None, "fly_id": batch[focal]["id"]}
                else:
                    events[pid] = {"stimulus": "nothing", "poke_id": None, "fly_id": None}
        settings = [settings_of(f) for f in batch] + [{}] * pad
        patch_of = [f["patch_id"] for f in batch] + [None] * pad
        res = runner.run(direct, pos, patch_of, settings, seed=seed + n)
        counts, wing = res["counts"][:len(batch)], res["wing"][:len(batch)]
        probs = translator.predict(features(counts))
        did = reader.read(counts, wing, [profile_key(s) for s in settings[:len(batch)]])
        for i, fly in enumerate(batch):
            x, y, h = res["positions"][i]
            moves.append((fly["id"], round(float(x), 3), round(float(y), 3), round(float(h) % (2 * np.pi), 2)))
            word = eps.words[int(np.argmax(probs[i]))]
            # readout.py's per-word confidence threshold, when the model has one
            said = word in postable and float(np.max(probs[i])) >= thresholds.get(word, -np.inf)
            if said and word == "mate" and mate_reads is not None:
                mate_reads.append(fly["id"])
            if not said and not did[i]:
                continue                                   # read nothing, did nothing: no post
            hit = direct[i][0]
            cause = None if hit else runner.cause(res, i, vocab.get("label_rule"))
            truth = hit or (WORD_OF.get(cause["channel"], "nothing") if cause else "nothing")
            if said:
                kind = "sense" if word == truth else ("hallucination" if truth == "nothing" and not cause else "misread")
            else:
                kind, word = "action", "nothing"
            poke = poke_for.get(fly["patch_id"]) if hit else None
            rows.append({"tick_id": tick["id"], "fly_id": fly["id"], "patch_id": fly["patch_id"], "word": word,
                         "confidence": round(precision[word], 3) if said else 0.0, "truth": truth, "kind": kind,
                         "actions": did[i], "poke_id": poke["id"] if poke else None,
                         "cause": {"channel": cause["channel"], "from_fly_id": batch[cause["from"]]["id"],
                                   "strength": cause["strength"]} if cause else None,
                         "wing_hz": round(float(wing[i]), 1), "neurons": eps.cite(counts[i], mean, sd),
                         # what its behaviour neurons did step by step; the app plays it as the fly's voice
                         "trace": {"step_ms": int(round(eps.brain.dt * 1000)), "groups": TRACE_GROUPS,
                                   "counts": res["trace"][i].tolist()}})
        for pid, event in events.items():
            idx = [i for i, f in enumerate(batch) if f["patch_id"] == pid]
            local = set(idx)
            replay[pid] = {"flies": [batch[i]["id"] for i in idx], "event": event,
                           "frames": [[frame[i] for i in idx] for frame in res["frames"]],
                           "links": [{"from": batch[l["from"]]["id"], "to": batch[l["to"]]["id"],
                                      "channel": l["channel"], "step": l["step"]}
                                     for l in res["links"] if l["from"] in local and l["to"] in local]}
    inserted = store.add_posts(rows)
    post_of = {p["fly_id"]: p["id"] for p in inserted}
    threads = [{"parent_post": post_of[p["cause"]["from_fly_id"]], "child_post": p["id"], "cause": p["cause"]["channel"]}
               for p in inserted if p.get("cause") and p["cause"]["from_fly_id"] in post_of]
    store.add_threads(threads)
    store.set_positions(moves)
    store.consume_pokes([p["id"] for p in poke_for.values()], tick["id"])
    stats = {"finished_at": now_iso(), "flies": len(flies), "posts": len(rows),
             "seconds": round(time.perf_counter() - t0, 1), "replay": replay}
    store.finish_tick(tick["id"], stats)
    kinds = {k: sum(r["kind"] == k for r in rows) for k in ("sense", "misread", "hallucination", "action")}
    where = f" patches {sorted(patches_only)}" if patches_only is not None else ""
    print(f"tick {tick['id']}{where}: {len(flies)} flies, {len(rows)} posts {kinds}, "
          f"caused by a neighbour {sum(bool(r['cause']) for r in rows)}, threads {len(threads)}, pokes {len(poke_for)}, "
          f"{stats['seconds']} s", flush=True)
    return stats


def trading_flies(store, include_all: bool = False) -> list[dict]:
    """Flies in the fly market: active flies whose owner holds $FLYAI (holder checks cached for HOLDER_TTL).
    include_all: every active fly (local tests on house flies)."""
    _, flies = store.house()
    active = active_flies(store, flies)
    if include_all:
        return active
    return [f for f in active if f.get("owner") and _holder_cache.get(f["owner"], (0.0, False))[1]]


AUTO_DUELS = 2     # matchmade duels per full tick


def duel_pass(store, runner: PatchRunner, rng, auto: int = 0) -> int:
    """Matchmake `auto` duels among active flies, then fight every pending duel and settle Elo."""
    _, flies = store.house()
    active = active_flies(store, flies)
    by_id = {f["id"]: f for f in active}
    if auto:
        store.create_duels([{"kind": duel_rules.KINDS[int(rng.integers(2))], "a_fly": a["id"], "b_fly": b["id"]}
                            for a, b in duel_rules.matchmake(active, auto, rng)])
    pending = store.pending_duels()
    if not pending:
        return 0
    results = duel_rules.run_duels(runner, pending, by_id, seed=int(rng.integers(2**31)))
    settled = 0
    for row in results:
        store.finish_duel(row)
        if row["status"] != "done":
            continue
        d = next(p for p in pending if p["id"] == row["id"])
        a, b = by_id[d["a_fly"]], by_id[d["b_fly"]]
        for fly, sign in ((a, 1), (b, -1)):
            won = row["winner"] == fly["id"]
            drawn = row["winner"] is None
            fields = {"elo": (fly.get("elo") or 1000) + sign * row["delta"], "duels": (fly.get("duels") or 0) + 1,
                      "wins": (fly.get("wins") or 0) + won, "losses": (fly.get("losses") or 0) + (not won and not drawn),
                      "draws": (fly.get("draws") or 0) + drawn}
            store.update_fly(fly["id"], fields)
            fly.update(fields)
        settled += 1
        names = {a["id"]: a["name"], b["id"]: b["name"]}
        print(f"duel {row['id']} {d['kind']}: {a['name']} ({row['a_step']} ms) vs {b['name']} ({row['b_step']} ms) -> "
              f"{names.get(row['winner'], 'draw')}, elo delta {row['delta']}", flush=True)
    return settled


def mating_pass(store, rng, mate_reads: list[str], auto: int = 0) -> int:
    """Pair flies of different owners (brain: a 'mate' read next to one; matched: `auto` random pairs)
    and hatch one child per pair for a random one of the two owners (mating.py)."""
    _, flies = store.house()
    active = active_flies(store, flies)
    if len(active) >= mating.POPULATION_CAP:
        return 0
    now = dt.datetime.now(dt.timezone.utc)
    pool = mating.eligible(active, now)
    by_id = {f["id"]: f for f in pool}
    pairs = [(a, b, "brain") for a, b in mating.brain_pairs(mate_reads, by_id)]
    used = {f["id"] for a, b, _ in pairs for f in (a, b)}
    pairs += [(a, b, "matched") for a, b in mating.matched_pairs([f for f in pool if f["id"] not in used], auto, rng)]
    taken = {f["name"] for f in flies}
    child_rng = random.Random(int(rng.integers(2**31)))
    for a, b, trigger in pairs:
        child = store.add_fly(mating.make_child(a, b, taken, child_rng))
        taken.add(child["name"])
        if child.get("id"):                                # the child's market mind, inherited by its lineage's style
            try:                                           # a market failure must not leave a half-done mating
                parent_minds = {m["fly_id"]: m for m in store.minds([a["id"], b["id"]])}
                store.save_minds([minds.child(child["id"], parent_minds.get(a["id"]), parent_minds.get(b["id"]), child_rng)])
            except Exception as e:
                print(f"child mind not saved for {child['name']}: {e}", flush=True)
        for parent in (a, b):
            store.update_fly(parent["id"], {"last_mated_at": now_iso()})
        store.add_mating({"a_fly": a["id"], "b_fly": b["id"], "child": child.get("id"), "owner": child["owner"],
                          "trigger": trigger})
        print(f"mating ({trigger}): {a['name']} x {b['name']} -> {child['name']} (gen {child['generation']})", flush=True)
    return len(pairs)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--json", help="write to this JSON file instead of Supabase")
    p.add_argument("--ticks", type=int, default=1, help="ticks to run back to back (ignored with --every)")
    p.add_argument("--every", type=float, help="run forever, one tick every this many seconds")
    p.add_argument("--poke-poll", type=float, default=10.0, help="with --every: check for pokes this often (seconds)")
    p.add_argument("--batch", type=int, default=12, help="flies per brain batch")
    p.add_argument("--min-precision", type=float, default=0.6)
    p.add_argument("--seed-house", action="store_true", help="upsert the house flies and patches first (off at launch)")
    p.add_argument("--seed", type=int, help="tick RNG seed (default: clock)")
    p.add_argument("--market-every", type=float, default=0.0, help="with --every: a fly market round this often (seconds, 0 = off)")
    p.add_argument("--market-rounds", type=int, default=0, help="without --every: market rounds to run after the ticks")
    p.add_argument("--market-all", action="store_true", help="every active fly trades, not only holders' (local tests)")
    p.add_argument("--market-learning", help="force these learners on every fly: all, none, or a comma list of "
                                             "dopamine,memory,tubes (default: each owner's choice)")
    args = p.parse_args()
    learning = market.learning_of(args.market_learning) if args.market_learning else None

    if args.json:
        store = JsonStore(Path(args.json))
    else:
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not (url and key):
            raise SystemExit("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --json PATH")
        store = SupabaseStore(url, key)
    if args.seed_house:                               # house flies only on request; launch has none
        store.seed_house(*house_rows())

    translator, vocab = load_model()
    t0 = time.perf_counter()
    eps = Episodes(batch=args.batch)
    print(f"brain loaded in {time.perf_counter() - t0:.1f} s; translator {vocab['version']}", flush=True)
    reader = ActionReader(eps)
    t0 = time.perf_counter()
    if "action_rest" in vocab:                        # measured in a patch by readout.py
        rest = reader.use(vocab["action_rest"])
        print(f"action rest from the model: {rest}", flush=True)
    else:
        rest = reader.fit()
        print(f"action rest fitted in {time.perf_counter() - t0:.0f} s: {rest}", flush=True)
    try:
        saved = store.saved_profiles(PROFILE_VERSION)
        if saved:
            print(f"resting baselines reused for {reader.import_profiles(saved)} settings profiles ({PROFILE_VERSION})", flush=True)
    except Exception as e:                            # a missing saved set only means re-measuring
        print(f"couldn't load saved resting baselines: {e}", flush=True)
    runner = PatchRunner(eps, reader)
    rng = np.random.default_rng(args.seed if args.seed is not None else time.time_ns())

    if args.every:
        next_full = time.monotonic()
        next_market = time.monotonic()          # first market round right after the first tick
        next_board = time.monotonic()           # the Season points board's stored copy, every SEASON_BOARD_EVERY
        while True:
            if time.monotonic() >= next_board:
                next_board = time.monotonic() + SEASON_BOARD_EVERY
                try:
                    store.refresh_season_board()
                except Exception as e:                # the board keeps its last copy
                    print(f"season board refresh failed: {e}", flush=True)
            try:
                reads: list[str] = []
                if time.monotonic() >= next_full:
                    next_full = time.monotonic() + args.every
                    run_tick(store, eps, reader, runner, translator, vocab, rng, args.min_precision, mate_reads=reads)
                    duel_pass(store, runner, rng, auto=AUTO_DUELS)
                    mating_pass(store, rng, reads, auto=mating.AUTO_PER_TICK)
                    if args.market_every and (wallets := trading_flies(store, args.market_all)):
                        store.open_wallets([f["id"] for f in wallets])   # every holder's fly has 1 fake ETH from its first tick
                    if args.market_every and time.monotonic() >= next_market:
                        next_market = time.monotonic() + args.market_every
                        if store.market_paused():
                            print("market paused (market_control); training resumes when it's switched back on", flush=True)
                        elif traders := trading_flies(store, args.market_all):
                            market.market_round(store, eps, reader, rng, traders, learning)
                else:
                    waiting = store.pending_pokes()
                    if waiting:
                        run_tick(store, eps, reader, runner, translator, vocab, rng, args.min_precision,
                                 patches_only={p["patch_id"] for p in waiting}, pokes=waiting, mate_reads=reads)
                    duel_pass(store, runner, rng)
                    if reads:
                        mating_pass(store, rng, reads)
            except Exception as e:                    # a failed tick must not kill the loop
                print(f"tick failed: {e}", flush=True)
            time.sleep(max(0.5, min(args.poke_poll, next_full - time.monotonic())))
    for _ in range(args.ticks):
        reads: list[str] = []
        run_tick(store, eps, reader, runner, translator, vocab, rng, args.min_precision, mate_reads=reads)
        if not args.json:
            duel_pass(store, runner, rng, auto=AUTO_DUELS)
            mating_pass(store, rng, reads, auto=mating.AUTO_PER_TICK)
    for _ in range(args.market_rounds):
        traders = trading_flies(store, args.market_all)
        if traders:
            market.market_round(store, eps, reader, rng, traders, learning)


if __name__ == "__main__":
    main()
