"""The colony ghosts (the user 2026-09-24: flies that do well get offspring, flies down 10% are terminated, a DNA that
is remembered, "we would need also a max cap"). Run AFTER deploying the desk code that has desk/colony.py.

colony         breeds on skill: a fly whose 48-bar (12 h) return beats the basket by 2% (and that traded) gets a
               mutated child, at most one per window.
colony_trade   breeds per win: every bar a fly banks >= $0.50 of realised profit, it gets a child.
colony_frozen  the control: the same founders and pot, nobody dies or breeds. Evolution only counts if a colony
               beats this after costs.

Each: the first 12 main flies as founders ($100 each, their DNA and minds as they are now) + a $400 pool (the food),
FIXED - births are paid from the pool (or the parent's cash), deaths pay back into it. Death at -10% of a fly's
stake. Caps: 24 flies, no fly over 15% of the colony (the excess goes back to the pool), no family over half the
flies while another lives, 2 births a bar. Everything else (master executor, stops, sizing) as the main flies.
Paper only; births and deaths are desk_events kind "colony"; publish.ghost_summary shows each colony's population.

    python enable_colony.py [--yes]
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
base = {"on": True, "founders": 12, "founder_usd": 100.0, "reserve_usd": 400.0, "birth_usd": 50.0, "death_pct": 10.0,
        "max_pop": 24, "max_share": 0.15, "max_family_share": 0.5, "max_births_per_bar": 2}
new = [{"name": "colony", "settings": {"colony": {**base, "breed": "skill", "window_bars": 48, "breed_skill_pct": 2.0}}},
       {"name": "colony_trade", "settings": {"colony": {**base, "breed": "trade", "min_gain_usd": 0.5}}},
       {"name": "colony_frozen", "settings": {"colony": {**base, "select": False}}}]
doc["ghosts"] = [g for g in doc.get("ghosts") or [] if g.get("name") not in {n["name"] for n in new}] + new
print("ghosts:", [g["name"] for g in doc["ghosts"]])
for g in new:
    print(" ", g)
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
