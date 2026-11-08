"""The fly's eye as a hex grid, and a Doom frame projected onto it.

Each photoreceptor (R1-6, R7, R8) gets its eye (L/R) and hex column (h1, h2) from the MaleCNS
optic-column table: directly when the table lists it, else through its strongest column-assigned
partner (the same rule flybrain/build.py uses for azimuth). Columns are laid out on a plane so the
left eye sees the left half of the screen and the right eye the right half, like the fly looking
straight at the monitor.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from scipy import sparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
CACHE = HERE / "cache" / "eye.npz"


def _columns_per_photoreceptor(data: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    from flybrain.build import optic_columns
    meta = np.load(data / "brain.npz")
    ids, visual = meta["ids"], meta["visual"]
    W = sparse.load_npz(data / "weights.npz").tocsr()
    cols = optic_columns(data / "raw" / "optic-columns.xlsx")
    known = np.array([i for i, b in enumerate(ids) if int(b) in cols], np.int32)
    to_known = abs(W[known][:, visual]).tocsc()
    side = np.full(len(visual), "?", "<U1")
    h1 = np.full(len(visual), -1, np.int32)
    h2 = np.full(len(visual), -1, np.int32)
    for k, neuron in enumerate(visual):
        loc = cols.get(int(ids[neuron]))
        if loc is None:
            a, b = to_known.indptr[k:k + 2]
            if b > a:
                loc = cols[int(ids[known[to_known.indices[a + np.argmax(to_known.data[a:b])]]])]
        if loc is not None:
            side[k], h1[k], h2[k] = loc
    return side, h1, h2


def load(data: Path | None = None) -> dict:
    """side, h1, h2, x, y per photoreceptor (x, y in 0..1 screen space; NaN = no column)."""
    if CACHE.exists():
        z = np.load(CACHE)
        return {k: z[k] for k in z.files}
    from flybrain.data import DATA
    side, h1, h2 = _columns_per_photoreceptor(Path(data or DATA))
    ok = h1 >= 0
    # hex lattice -> plane: h1 and h2 are the two hex axes, 60 degrees apart
    u = h1 - h2
    v = (h1 + h2) * np.sqrt(3) / 2 * (1 / np.sqrt(3))
    x = np.full(len(h1), np.nan, np.float32)
    y = np.full(len(h1), np.nan, np.float32)
    for s, lo, hi in (("L", 0.0, 0.5), ("R", 0.5, 1.0)):
        m = ok & (side == s)
        uu, vv = u[m].astype(np.float32), v[m].astype(np.float32)
        if s == "L":
            uu = -uu          # mirror so both eyes' fronts meet in the middle of the screen
        x[m] = lo + (uu - uu.min()) / max(np.ptp(uu), 1) * (hi - lo)
        y[m] = (vv - vv.min()) / max(np.ptp(vv), 1)
    out = {"side": side, "h1": h1, "h2": h2, "x": x, "y": y}
    CACHE.parent.mkdir(exist_ok=True)
    np.savez(CACHE, **out)
    return out


FLAT = HERE / "cache" / "flat.npz"


def flat_field(brain) -> np.ndarray:
    """Each photoreceptor's firing rate (spikes per step) under a plain mid-grey screen. The fly's own wiring
    makes some columns (the eye's rim) fire more than others for the same light; the clip divides this out,
    like a camera's flat-field correction. Cached per brain step size."""
    key = f"dt{brain.dt:.5f}"
    if FLAT.exists():
        z = np.load(FLAT)
        if key in z.files:
            return z[key]
    from flybrain import FlyBrain
    b = FlyBrain(device=brain.device, batch=1, dt=brain.dt)
    b.reset(0)
    lookup = np.full(b.n, -1, np.int64)
    lookup[b.visual] = np.arange(len(b.visual))
    drive = np.full(len(b.visual), 0.4, np.float32)
    counts = np.zeros(len(b.visual))
    for i in range(int(4 / b.dt)):
        k = lookup[b.step(eye_drive=drive)]
        if i * b.dt > 0.5:
            counts[k[k >= 0]] += 1
    rate = counts / (int(4 / b.dt) - int(0.5 / b.dt))
    old = {k: v for k, v in np.load(FLAT).items()} if FLAT.exists() else {}
    FLAT.parent.mkdir(exist_ok=True)
    np.savez(FLAT, **old, **{key: rate})
    return rate


LAMINA = HERE / "cache" / "lamina2.npz"


def lamina_xyz(side, h1, h2) -> np.ndarray:
    """3D point (brain voxel coordinates) of each eye column in the lamina, the first layer behind the eye.
    Only 294 of the 1,764 column L1 neurons have a position in the data; every other column takes the
    distance-weighted mean of the 6 nearest of those (in hex coordinates), so no point lands outside the
    measured sheet."""
    from scipy.spatial import cKDTree
    if not LAMINA.exists():
        from flybrain.build import optic_columns
        from flybrain.data import DATA
        meta = np.load(DATA / "brain.npz")
        p, ids, ct = meta["positions"], meta["ids"], meta["cell_type"]
        index = {int(b): i for i, b in enumerate(ids)}
        table = optic_columns(DATA / "raw" / "optic-columns.xlsx")
        out = {}
        for s in "LR":
            rows = [(index[b], c[1], c[2]) for b, c in table.items()
                    if b in index and c[0] == s and ct[index[b]] == "L1"
                    and np.isfinite(p[index[b]]).all() and np.abs(p[index[b]]).sum() > 0]
            out[f"{s}_hex"] = np.array([[r[1], r[2]] for r in rows], float)
            out[f"{s}_xyz"] = np.array([p[i] for i, _, _ in rows], float)
        LAMINA.parent.mkdir(exist_ok=True)
        np.savez(LAMINA, **out)
    z = np.load(LAMINA)
    side = np.asarray(side)
    res = np.zeros((len(side), 3))
    for s in "LR":
        m = side == s
        if not m.any():
            continue
        d, i = cKDTree(z[f"{s}_hex"]).query(np.c_[np.asarray(h1)[m], np.asarray(h2)[m]], k=6)
        w = 1 / (d + 0.5)
        res[m] = (z[f"{s}_xyz"][i] * w[..., None]).sum(1) / w.sum(1, keepdims=True)
    return res
