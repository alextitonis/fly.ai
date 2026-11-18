"""Antennal grooming on the real MaleCNS brain (issue #47, notebooks/antennal_grooming.ipynb).

Main finding checked here: injecting voltage into the left JO-C* / JO-E* Johnston's organ neurons drives aBN1
(MaleCNS type SAD093) on the same side well above its paired no-stimulus rate, and leaves the right aBN1 at baseline.

Needs the brain data ($FLY_DATA or flybrain's default folder); skipped when it isn't downloaded. About a minute on CPU.
"""
import os

import numpy as np
import pytest

from flybrain.data import DATA, has_data

BATCH, WARM, STEPS = 8, 10, 50


def _brain():
    data = os.environ.get("FLY_DATA") or DATA
    if not has_data(data):
        pytest.skip("MaleCNS brain data not downloaded (run `flybrain download`)")
    from flybrain import FlyBrain
    return FlyBrain(data=data, batch=BATCH, device="cpu")


def _rates(brain, idx, amount, seed):
    brain.reset(seed)
    for _ in range(WARM):
        brain.step()
    counts = np.zeros((brain.n, BATCH), np.int32)
    inject = [(idx, amount)] if idx is not None else []
    for _ in range(STEPS):
        for k, f in enumerate(brain.step(inject=inject)):
            counts[f, k] += 1
    return counts / (STEPS * brain.dt)


def test_jo_ce_drives_ipsilateral_abn1():
    brain = _brain()
    ct = brain.cell_type.astype(str)
    jo_ce = sorted(t for t in set(ct) if t.startswith("JO-C") or t.startswith("JO-E"))
    stim = brain.cells(jo_ce, side="L")
    abn1_l = brain.cells(["SAD093"], side="L")
    abn1_r = brain.cells(["SAD093"], side="R")
    assert len(stim) > 100 and len(abn1_l) == 1 and len(abn1_r) == 1

    base = _rates(brain, None, 0.0, seed=0)
    hit = _rates(brain, stim, 1.0, seed=0)
    d_l = (hit[abn1_l] - base[abn1_l]).mean()
    d_r = (hit[abn1_r] - base[abn1_r]).mean()
    assert d_l > 5.0, f"left aBN1 rose only {d_l:.2f} Hz"
    assert abs(d_r) < 2.0, f"right aBN1 changed {d_r:.2f} Hz"
