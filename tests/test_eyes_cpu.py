"""pytest tests/test_eyes_cpu.py -- flybrain.eyes (Eyes.drive, blob_for, FeatureDetectors) on CPU."""
import numpy as np
import pytest

from conftest import DNP01, LC4
from flybrain import Blob, Eyes, FeatureDetectors, blob_for
from flybrain.eyes import BACKGROUND

AZ = np.linspace(-1, 1, 41).astype(np.float32)


def test_static_scene_only_drives_by_luminance():
    eyes = Eyes(AZ)
    first = eyes.drive([Blob(center=-0.5, half_width=0.1, darkness=1.0)])
    again = eyes.drive([Blob(center=-0.5, half_width=0.1, darkness=1.0)])
    assert np.array_equal(first, again)                     # nothing changed: no motion term
    inside = np.abs(AZ + 0.5) <= 0.1
    assert np.allclose(again[inside], 0.0)                  # black blob: no light
    assert np.allclose(again[~inside], 0.45 * BACKGROUND)


def test_motion_drives_only_where_the_scene_changed():
    eyes = Eyes(AZ)
    eyes.drive([Blob(center=-0.5, half_width=0.1, darkness=1.0)])
    moved = eyes.drive([Blob(center=0.5, half_width=0.1, darkness=1.0)])
    old, new = np.abs(AZ + 0.5) <= 0.1, np.abs(AZ - 0.5) <= 0.1
    rest = ~(old | new)
    assert (moved[old] > 0.9).all()                         # it got brighter there: strong transient
    assert (moved[new] > 0.9).all()                         # and darker here
    assert np.allclose(moved[rest], 0.45 * BACKGROUND)
    assert moved.min() >= 0.0 and moved.max() <= 1.0


def test_faint_blob_is_weaker_than_dark_blob():
    lum = {}
    for d in (0.2, 1.0):
        eyes = Eyes(AZ)
        eyes.drive([])
        lum[d] = eyes.drive([Blob(0.0, 0.1, d)])[20]
    assert lum[1.0] > lum[0.2] > 0.45 * BACKGROUND


def test_blob_for_side_size_and_clipping():
    left, right = blob_for(-50, 20, 1.0), blob_for(50, 20, 1.0)
    assert left.center < 0 < right.center and left.center == -right.center
    near, far = blob_for(20, 20, 1.0), blob_for(100, 20, 1.0)
    assert near.half_width > far.half_width                 # closer looks bigger
    assert blob_for(1000, 20, 1.0).center == 1.0            # off-screen clips to the edge
    assert blob_for(0, 1, 1.0).half_width >= 0.03
    assert blob_for(1, 1000, 1.0).half_width <= 0.7


def test_feature_detectors_drive_the_side_the_opponent_is_on(make_brain):
    brain = make_brain(noise=False)
    fd = FeatureDetectors(brain)
    assert set(fd.cells["threat"]["L"]) == set(LC4["L"])
    inject = fd.inject(opp=(-30.0, 20.0), threat=1.0)
    driven = {int(i) for idx, _ in inject for i in idx}
    assert set(LC4["L"]) <= driven and not set(LC4["R"]) & driven
    fired = [set(brain.step(inject=fd.inject(opp=(-30.0, 20.0), threat=1.0)).tolist()) for _ in range(4)]
    assert any(DNP01["L"] in f for f in fired) and not any(DNP01["R"] in f for f in fired)


def test_feature_detectors_reject_unknown_parameters(make_brain):
    with pytest.raises(ValueError):
        FeatureDetectors(make_brain(), loom_gainz=1.0)
