"""The main flies learn in their mushroom bodies too (2026-10-01, the user: "the plastic ones for mushroom body should
persist and be used too as that").

    main flags     + "plastic"  (dopamine-gated KC->MBON learning, research/plasticity.py)
    plastic_seed   "ghost:plastic": each main fly starts from the same fly's weights the "plastic" ghost has learned,
                   not from zero (Desk.brain_memory), then learns on its own
    ghost          "noplastic" = the main settings without "plastic": the control, now that the "plastic" ghost has
                   the same flags as main

Code first (brain memory saved across restarts): bash flytrade/desk/deploy.sh, wait one hour (the ghost's weights are
saved every 4 bars), THEN this.
    python enable_plastic_main.py          # show the change
    python enable_plastic_main.py --yes    # write it
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "flytrade" / "desk"))
import status  # noqa: E402  (reads flybook/.env)
import requests  # noqa: E402

doc = status.get("desk_config?id=eq.1&select=settings")[0]["settings"]
flags = list(doc.get("flags") or [])
if "plastic" in flags:
    sys.exit("already applied (main flags have plastic)")
saved = (status.get("desk_state?key=eq.brain_memory&select=value") or [{}])[0].get("value") or {}
learned = ((saved.get("ghost:plastic") or {}).get("plastic") or {})
print(f"the plastic ghost has saved weights for {len(learned)} flies" if learned else
      "WARNING: no saved weights for the plastic ghost yet (deploy first, wait an hour): main would start from zero")
ghosts = doc.get("ghosts") or []
control = {"name": "noplastic", "settings": {"flags": flags}}
doc["flags"] = flags + ["plastic"]
doc["plastic_seed"] = "ghost:plastic"
if not any(g["name"] == "noplastic" for g in ghosts):
    doc["ghosts"] = ghosts + [control]
print(f"main flags: {flags} -> {doc['flags']}; plastic_seed ghost:plastic; control ghost noplastic = {control['settings']}")
if "--yes" not in sys.argv:
    sys.exit("(dry run: add --yes to write)")
key = status.env("SUPABASE_SERVICE_ROLE_KEY")
r = requests.patch(status.env("SUPABASE_URL").rstrip("/") + "/rest/v1/desk_config?id=eq.1",
                   headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"settings": doc, "updated_at": datetime.now(timezone.utc).isoformat()}, timeout=30)
r.raise_for_status()
print("written")
