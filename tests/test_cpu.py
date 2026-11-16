"""CPU test suite with a small fixture brain (issue #40).

`flybrain` has one test file, `tests/test_csr_identity.py`, which needs an
NVIDIA GPU and is skipped otherwise. Nothing tests the package on a plain
CPU. These tests run on CPU, without the ~260 MB brain download, using a
small synthetic fixture brain: 14 neurons, hand-built `brain.npz` /
`weights.npz` in a temporary directory, passed to `FlyBrain(data=...)`.

    python -m pytest tests/test_cpu.py

Passes on a clean CPU-only install in under 2 minutes (most of the time is
the one-off numba compile of the sparse propagator). No GPU, no download,
no network.

Fixture wiring (rows are postsynaptic, columns presynaptic; every weight 1.0):

    0 LC4 L ──┐
    1 LC4 R ──┼──> 6 DNp01 L / 7 DNp01 R
    2 LPLC2 L ┤
    3 LPLC2 R ┤
    4 LC10a L ┘ (also -> 6; 5 LC10a R -> 7)
    0 LC4 L ──> 8 ORN L   (synapse *onto* a sensory neuron: removed when
    8 ORN L ──> 10 KC L ──> 12 MBON L     sensory_input=False)
    9 ORN R ──> 11 KC R ──> 13 MBON R

Photoreceptor slots for the `Eyes` tests reuse indices 0/1 with azimuths
-0.5/+0.5; that is only so `Eyes.drive` / `FlyBrain.step(eye_drive=...)`
wiring can be exercised without the 6,006 real photoreceptors.
"""

import numpy as np
import pytest
from scipy import sparse

from flybrain import FlyBrain
from flybrain.data import has_data
from flybrain.eyes import Eyes, FeatureDetectors, blob_for
from flybrain.reservoir import (
    Readout,
    Trace,
    auc,
    bases_for,
    fit_logistic,
    fit_ridge,
    folds,
    project,
    run,
)

N = 14
CELL_TYPE = np.array(["LC4", "LC4", "LPLC2", "LPLC2", "LC10a", "LC10a",
                      "DNp01", "DNp01", "ORN", "ORN", "KC", "KC", "MBON", "MBON"])
SIDE = np.array(["L", "R"] * 7)
SUPERCLASS = np.array(["visual_projection"] * 6 + ["descending_neuron"] * 2
                      + ["sensory_neuron"] * 2 + ["kenyon_cell"] * 2
                      + ["mushroom_body_output"] * 2)
# (postsynaptic row, presynaptic column), all weights 1.0.
EDGES = [(6, 0), (7, 1), (6, 2), (7, 3), (6, 4), (7, 5),
         (10, 8), (11, 9), (12, 10), (13, 11), (8, 0)]


def make_small_brain(tmp_path, **kwargs):
    """A 14-neuron FlyBrain from synthetic files in `tmp_path`.

    Goes through the real `FlyBrain.__init__` (file loading, CSR
    canonicalisation, sensory masking), but never downloads: the files are
    already in the folder, so `ensure_data` returns immediately.
    """
    tmp_path = tmp_path
    np.savez(tmp_path / "brain.npz",
             visual=np.array([0, 1]), azimuth=np.array([-0.5, 0.5]),
             cell_type=CELL_TYPE, side=SIDE, superclass=SUPERCLASS,
             positions=np.zeros((N, 3), np.float32),
             group_descending=np.array([6, 7]))
    rows, cols = zip(*EDGES)
    w = sparse.csr_matrix(
        (np.ones(len(EDGES), np.float32), (rows, cols)), shape=(N, N))
    sparse.save_npz(tmp_path / "weights.npz", w)
    kwargs.setdefault("device", "cpu")
    kwargs.setdefault("seed", 64)
    return FlyBrain(data=tmp_path, **kwargs)


@pytest.fixture
def brain(tmp_path):
    return make_small_brain(tmp_path)


# ---- FlyBrain ---------------------------------------------------------------

def test_flybrain_loads_from_fixture_without_download(tmp_path):
    assert not (tmp_path / "brain.npz").exists()
    b = make_small_brain(tmp_path)
    assert has_data(tmp_path)
    assert b.n == N
    assert b.device == "cpu"
    assert b.batch == 1
    assert list(b.groups) == ["descending"]
    assert np.array_equal(b.groups["descending"], [6, 7])


def test_cells_selects_by_type_side_and_superclass(brain):
    assert np.array_equal(brain.cells(["LC4"]), [0, 1])
    assert np.array_equal(brain.cells(["LC4"], side="L"), [0])
    assert np.array_equal(brain.cells(["LC4"], side="R"), [1])
    assert np.array_equal(brain.cells(["descending_neuron"]), [6, 7])
    assert np.array_equal(brain.cells(["KC", "MBON"]), [10, 11, 12, 13])
    assert len(brain.cells(["no-such-type"])) == 0


def test_invalid_device_raises(tmp_path):
    with pytest.raises(ValueError, match="device must be"):
        make_small_brain(tmp_path, device="tpu")


def test_stimulated_neuron_fires(brain):
    brain.stimulate(np.array([0]), 2.0)
    fired = brain.step()
    assert 0 in fired


def test_signal_propagates_to_downstream_neurons(brain):
    brain.stimulate(np.array([0]), 2.0)
    assert np.array_equal(brain.step(), [0])       # the stimulated neuron
    fired = brain.step()                           # one synapse later
    assert 6 in fired and 8 in fired               # DNp01 and ORN
    assert 10 in brain.step()                      # KC, one more synapse on


def test_silent_network_stays_silent_with_noise_off(brain):
    brain.noise_hz = 0.0
    assert sum(len(brain.step()) for _ in range(50)) == 0


def test_resting_spike_rate_stays_low_with_noise_on(brain):
    # At rest the calibrated model is quiet (~1 Hz per neuron, far below the
    # 50 Hz step ceiling): 50 steps x 14 neurons could in principle yield
    # 700 spikes; a handful is the healthy range, a flood is a broken model.
    total = sum(len(brain.step()) for _ in range(50))
    assert total < 25, f"resting network fired {total} times in 50 steps"


def test_same_seed_gives_same_spikes(tmp_path):
    def replay():
        b = make_small_brain(tmp_path)
        b.stimulate(np.array([0]), 2.0)
        return [b.step() for _ in range(5)]

    first, second = replay(), replay()
    assert all(np.array_equal(a, c) for a, c in zip(first, second))


def test_reset_silences_and_replays(brain):
    brain.stimulate(np.array([0]), 2.0)
    first = [brain.step() for _ in range(3)]
    assert brain.steps == 3
    brain.reset(64)
    assert brain.steps == 0
    assert np.all(brain.v == 0)
    brain.stimulate(np.array([0]), 2.0)
    assert all(np.array_equal(a, c)
               for a, c in zip(first, [brain.step() for _ in range(3)]))


def test_sensory_input_false_removes_synapses_onto_sensory(tmp_path):
    on = make_small_brain(tmp_path, sensory_input=True)
    on.stimulate(np.array([0]), 2.0)
    on.step()
    assert 8 in on.step()          # LC4 -> ORN edge intact

    off = make_small_brain(tmp_path, sensory_input=False)
    off.stimulate(np.array([0]), 2.0)
    off.step()
    fired = off.step()
    assert 6 in fired              # LC4 -> DNp01 edge kept ...
    assert 8 not in fired          # ... but LC4 -> ORN edge is masked


def test_step_returns_flat_indices_for_batch_1(brain):
    brain.stimulate(np.array([0]), 2.0)
    fired = brain.step()
    assert isinstance(fired, np.ndarray) and fired.ndim == 1


# ---- reservoir --------------------------------------------------------------

def test_trace_records_fired_population_and_decays(brain):
    trace = Trace(brain, types=["DNp01"])
    brain.stimulate(np.array([0]), 2.0)
    brain.step()                                  # neuron 0 fires
    assert np.allclose(trace.observe(brain.step()), [1.0, 0.0])  # 6 fires
    assert np.allclose(trace.observe(brain.step()),
                       [np.exp(-0.2), 0.0], atol=1e-6)  # decay, no new spike
    trace.reset()
    assert np.allclose(trace.features(), [0.0, 0.0])


def test_trace_group_selector(brain):
    trace = Trace(brain, group="descending")
    assert np.array_equal(trace.idx, [6, 7])


def test_trace_requires_exactly_one_population_selector(brain):
    with pytest.raises(ValueError, match="exactly one of"):
        Trace(brain)
    with pytest.raises(ValueError, match="exactly one of"):
        Trace(brain, types=["DNp01"], group="descending")
    with pytest.raises(ValueError, match='aggregate must be'):
        Trace(brain, types=["DNp01"], aggregate="sum")


def test_run_collects_activity_over_time(brain):
    activity = run(brain, 3,
                   encode=lambda t: [(np.array([0]), 2.0)] if t == 0 else ())
    assert activity.shape == (3, N)
    assert activity[0][0] == 1.0    # stimulated neuron fires on step 0
    assert activity[1][6] == 1.0    # downstream neuron fires on step 1


def test_fit_ridge_recovers_a_known_linear_map():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(60, 5))
    w_true = np.array([1.0, -2.0, 0.5, 0.0, 3.0])
    y = x @ w_true + 0.5 + rng.normal(scale=0.01, size=60)
    w, b = fit_ridge(x, y, lam=1e-2)
    assert np.mean(np.abs(x @ w + b - y)) < 0.05
    assert abs(b - 0.5) < 0.05


def test_fit_logistic_separates_classes():
    rng = np.random.default_rng(0)
    x = np.vstack([rng.normal([-2, 0], 1.0, size=(30, 2)),
                   rng.normal([2, 0], 1.0, size=(30, 2))])
    y = np.array([0] * 30 + [1] * 30)
    w, b = fit_logistic(x, y, lam=0.1)
    from scipy.special import expit
    assert auc(y, expit(x @ w + b)) > 0.95


def test_auc_known_values():
    y = np.array([0, 0, 1, 1])
    assert auc(y, np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert auc(y, np.array([0.9, 0.8, 0.2, 0.1])) == 0.0
    assert np.isnan(auc(np.array([1, 1, 1]), np.array([0.1, 0.5, 0.9])))


def test_folds_covers_every_sample_once():
    splits = list(folds(10))
    assert len(splits) == 5
    seen = np.concatenate([test for _, test in splits])
    assert sorted(seen.tolist()) == list(range(10))
    for train, test in splits:
        assert len(test) == 2 and not set(train) & set(test)


def test_folds_leave_one_group_out():
    groups = np.array([0, 0, 0, 1, 1, 1, 2, 2, 2])
    splits = list(folds(9, groups=groups))
    assert len(splits) == 3
    assert [sorted(test.tolist()) for _, test in splits] == [
        [0, 1, 2], [3, 4, 5], [6, 7, 8]]


def test_bases_for_and_project_standardise():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(20, 4))
    bases = bases_for(x, [None, 2])
    assert project(bases[None], x).shape == (20, 4)
    assert np.allclose(project(bases[None], x).mean(0), 0, atol=1e-6)
    assert project(bases[2], x).shape == (20, 2)


def test_readout_fit_predict_save_load(tmp_path):
    rng = np.random.default_rng(0)
    x = rng.normal(size=(60, 8))
    x[30:, :4] += 1.5
    y = np.array([0] * 30 + [1] * 30)
    readout = Readout.fit(x, y, kind="logistic",
                          components=(2, 5), lambdas=(0.1, 1.0))
    assert np.isfinite(readout.cv_score) and readout.cv_score > 0.5
    pred = readout.predict(x)
    assert pred.shape == (60,)
    assert np.all((pred >= 0) & (pred <= 1))
    assert auc(y, pred) > 0.9
    path = tmp_path / "readout.npz"
    readout.save(path)
    loaded = Readout.load(path)
    assert np.allclose(loaded.predict(x), pred)
    assert loaded.cv_score == readout.cv_score


def test_readout_ridge_predict_shape():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(40, 6))
    y = x[:, 0] - 2 * x[:, 1]
    readout = Readout.fit(x, y, kind="ridge",
                          components=(2, 4), lambdas=(0.1, 1.0))
    assert readout.predict(x[:3]).shape == (3,)
    assert np.isfinite(readout.predict(x[0]))


# ---- eyes -------------------------------------------------------------------

def test_blob_for_clips_to_valid_range():
    blob = blob_for(0.0, 0.5, 1.0)
    assert blob.center == 0.0 and 0.03 <= blob.half_width <= 0.7
    assert blob_for(220.0, 0.5, 1.0).center == 1.0
    assert blob_for(-220.0, 0.5, 1.0).center == -1.0


def test_eyes_drive_responds_to_change_not_steady_light():
    eyes = Eyes(np.linspace(-1, 1, 11))
    first = eyes.drive([])
    assert np.allclose(first, 0.45 * 0.9)          # steady background only
    changed = eyes.drive([blob_for(0.0, 0.5, 1.0)])
    assert changed[5] == 1.0                        # new dark blob in view
    assert changed[0] == pytest.approx(0.45 * 0.9)
    steady = eyes.drive([blob_for(0.0, 0.5, 1.0)])
    assert steady[5] == 0.0                         # same scene: no change
    assert steady[0] == pytest.approx(0.45 * 0.9)


def test_feature_detectors_inject_drives_correct_side(brain):
    detectors = FeatureDetectors(brain)
    far = dict((tuple(c.tolist()), float(a))
               for c, a in detectors.inject(opp=(-50, 20)))
    assert far == {(4,): pytest.approx(0.68)}      # LC10a L chases; no loom yet
    near = dict((tuple(c.tolist()), float(a))
                for c, a in detectors.inject(opp=(-20, 20)))
    assert near[(2,)] == pytest.approx(0.8)        # LPLC2 L looms as it nears
    assert near[(4,)] == pytest.approx(0.8)
    right = dict((tuple(c.tolist()), float(a))
                 for c, a in detectors.inject(opp=(30, 20)))
    assert (5,) in right and (4,) not in right     # opponent on the right


def test_feature_detectors_rejects_unknown_parameters(brain):
    with pytest.raises(ValueError, match="unknown encoder parameters"):
        FeatureDetectors(brain, bogus=1.0)


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
