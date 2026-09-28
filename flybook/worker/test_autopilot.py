"""Tests for autopilot.py without Supabase or the mine server: cd flybook/worker && python -m unittest test_autopilot"""
from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import autopilot as ap  # noqa: E402

UID, WALLET = "u1", "0x" + "ab" * 20


class FakeApi:
    """Just enough of api.py: canned rows, and a log of the calls autopilot makes."""

    class ApiError(Exception):
        pass

    POKE_STIMULI = ("threat", "mate")

    def __init__(self, full_patches: set[str] = frozenset()):
        self.calls: list[tuple] = []
        self.full = set(full_patches)

    def utc_midnight(self) -> str:
        return "2026-09-28T00:00:00Z"

    def count(self, path: str) -> int:
        return 0

    def rest(self, method: str, path: str, *a, **kw):
        if path.startswith("flies?select=id,name,color,patch_id,active&owner=eq."):
            return [{"id": "f1", "name": "Buzz", "color": "#000000", "patch_id": "kitchen", "active": True},
                    {"id": "f2", "name": "Zip", "color": "#ffffff", "patch_id": "garden", "active": True}]
        if path.startswith("posts?select=id,flies(owner)"):
            return [{"id": 1, "flies": {"owner": UID}}, {"id": 2, "flies": {"owner": "u2"}},
                    {"id": 3, "flies": {"owner": None}}, {"id": 4, "flies": {"owner": "u3"}}]
        if path.startswith("likes?select=post_id&user_id"):
            return [{"post_id": 4}]
        if path.startswith("flies?select=id&active=eq.true&owner=neq."):
            return [{"id": "o1"}]
        return []

    def poke(self, user, wallet, body):
        if body["patch_id"] in self.full:
            raise self.ApiError("this patch already has 3 pokes waiting")
        self.calls.append(("poke", body["patch_id"]))

    def set_like(self, user, wallet, post_id, liked, auto=False):
        self.calls.append(("like", post_id, auto))

    def challenge(self, user, wallet, body):
        self.calls.append(("duel", body["fly_id"], body["opponent_id"]))

    def breed(self, user, wallet, body):
        self.calls.append(("breed", body["name"], body["color"]))


class PlanTest(unittest.TestCase):
    def test_owners_merges_passes_and_skips_listed_and_off(self):
        passes = [
            {"pass": 1, "owner": WALLET.upper().replace("X", "x"), "settings": {"flybook": {"missions": True}}},
            {"pass": 2, "owner": WALLET, "settings": {"flybook": {"duels": True}}},
            {"pass": 3, "owner": "0x" + "cd" * 20, "listed": True, "settings": {"flybook": {"missions": True}}},
            {"pass": 4, "owner": "0x" + "ef" * 20, "settings": {"flybook": {}}},
            {"pass": 5, "owner": "not a wallet", "settings": {"flybook": {"missions": True}}},
        ]
        got = ap.owners(passes)
        self.assertEqual(list(got), [WALLET])
        self.assertTrue(got[WALLET].missions and got[WALLET].duels and not got[WALLET].breed)

    def test_plan_is_done_once_the_day_is(self):
        f = ap.Flags(missions=True, duels=True, breed=True)
        self.assertEqual(ap.plan(f, ap.Today()), ap.Plan(poke=True, likes=5, duel=True, breed=True))
        done = ap.Today(pokes=3, stirred=1, likes=5, duels=ap.DUELS_PER_DAY, breeds=1)
        self.assertTrue(ap.plan(f, done).empty())

    def test_keeps_poking_until_a_fly_reacts_up_to_the_cap(self):
        f = ap.Flags(missions=True)
        self.assertTrue(ap.plan(f, ap.Today(pokes=3, stirred=0)).poke)
        self.assertFalse(ap.plan(f, ap.Today(pokes=ap.POKES_MAX, stirred=0)).poke)

    def test_nothing_without_flags(self):
        self.assertTrue(ap.plan(ap.Flags(), ap.Today()).empty())

    def test_mix(self):
        self.assertEqual(ap.mix("#000000", "#ffffff"), "#7f7f7f")
        self.assertEqual(ap.mix(None, "#ffffff"), "#e0342c")


class AccountTest(unittest.TestCase):
    def acct(self, api, dry=False):
        return ap.Account(api, UID, WALLET, random.Random(1), dry)

    def test_likes_are_auto_and_skip_own_and_already_liked(self):
        api = FakeApi()
        self.acct(api).like(5)
        self.assertEqual(sorted(c[1] for c in api.calls), [2, 3])
        self.assertTrue(all(c[0] == "like" and c[2] is True for c in api.calls))

    def test_poke_tries_another_patch_when_one_is_full(self):
        api = FakeApi(full_patches={"kitchen"})
        self.acct(api).poke()
        self.assertEqual(api.calls, [("poke", "garden")])

    def test_duel_and_breed(self):
        api = FakeApi()
        a = self.acct(api)
        a.duel()
        a.breed()
        self.assertEqual(api.calls[0][0], "duel")
        self.assertEqual(api.calls[0][2], "o1")
        self.assertEqual(api.calls[1][0], "breed")
        self.assertIn(" x ", api.calls[1][1])
        self.assertLessEqual(len(api.calls[1][1]), 40)

    def test_dry_run_writes_nothing(self):
        api = FakeApi()
        self.acct(api, dry=True).run(ap.Plan(poke=True, likes=5, duel=True, breed=True))
        self.assertEqual(api.calls, [])


class FetchTest(unittest.TestCase):
    def test_no_key_or_server_down_skips(self):
        class Down:
            def get(self, *a, **kw):
                raise ConnectionError("down")
        old = ap.WORKER_KEY
        try:
            ap.WORKER_KEY = ""
            self.assertIsNone(ap.fetch_passes(Down()))
            ap.WORKER_KEY = "k"
            self.assertIsNone(ap.fetch_passes(Down()))
        finally:
            ap.WORKER_KEY = old


class MigrationTest(unittest.TestCase):
    """Autopilot likes count for the liker's own "Like 5 posts" and nowhere that counts likes received."""
    SQL = (Path(__file__).parent.parent / "supabase" / "migrations" / "20260928120000_flightpass_auto_likes.sql").read_text("utf-8")

    def test_every_received_like_count_leaves_auto_out(self):
        for obj in ("function public.my_missions()", "function public.season_points(", "view public.fly_board",
                    "view public.owner_board", "function public.challenge_board("):
            self.assertIn(f"create or replace {obj}", self.SQL)
        body = self.SQL.split("\nalter table", 1)[1]
        self.assertGreater(body.count("l.by_holder"), 0)
        self.assertEqual(body.count("l.by_holder"), body.count("l.by_holder and not l.auto"))

    def test_the_likers_own_mission_still_counts_them(self):
        for line in self.SQL.splitlines():
            if "'like5'" in line or line.strip().startswith("like_days as"):
                self.assertNotIn("auto", line)


if __name__ == "__main__":
    unittest.main()
