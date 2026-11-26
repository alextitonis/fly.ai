"""pytest tests/test_controls.py -- control wirings, reports, use_wiring, and blank_rates."""
from __future__ import annotations

import sys
import types

import numpy as np
import pytest
from scipy import sparse

from conftest import A, B, DNP01, INH, LC4, N, PHOTO, SENS
from flybrain.controls import (
    ControlReport,
    blank_rates,
    degree_preserving,
    erdos_renyi,
    use_wiring,
    weight_shuffle,
)


def _brain_csr(brain) -> sparse.csr_matrix:
    return sparse.csc_matrix(
        (brain.weights, brain.indices, brain.indptr),
        shape=(brain.n, brain.n),
        dtype=np.float32,
    ).tocsr()


@pytest.mark.parametrize("fn", [weight_shuffle, degree_preserving, erdos_renyi])
@pytest.mark.parametrize("sensory_input", [True, False])
@pytest.mark.parametrize("match_input", [False, True])
def test_control_invariants_on_fixture(make_brain, fn, sensory_input, match_input):
    brain = make_brain(noise=False, sensory_input=sensory_input)
    orig = _brain_csr(brain)
    W_ctrl, report = fn(brain, seed=11, match_input=match_input)

    assert isinstance(report, ControlReport)
    assert W_ctrl.shape == (N, N)
    assert W_ctrl.dtype == np.float32
    assert report.nnz_before == orig.nnz
    assert report.nnz_after == W_ctrl.nnz
    assert report.self_loops == 0
    assert int((W_ctrl.diagonal() != 0).sum()) == 0
    assert report.mixed_sign_outputs == 0
    assert report.sensory_rows_empty is True
    assert report.match_input is match_input

    # Verify Dale's law directly on every presynaptic neuron (column).
    csc = W_ctrl.tocsc()
    pos = np.asarray((csc > 0).sum(axis=0)).ravel()
    neg = np.asarray((csc < 0).sum(axis=0)).ravel()
    assert int(np.sum((pos > 0) & (neg > 0))) == 0

    # Verify sensory_input=False rows stay empty.
    if not sensory_input:
        sensory = np.char.find(brain.superclass.astype(str), "sensory") >= 0
        assert int(np.diff(W_ctrl.indptr)[sensory].sum()) == 0

    if fn is weight_shuffle:
        assert report.nnz_after == report.nnz_before
        assert report.in_degree_preserved is True
        assert report.out_degree_preserved is True
        # Exact same edge pairs as original.
        assert np.array_equal(W_ctrl.indptr, orig.indptr)
        assert np.array_equal(W_ctrl.indices, orig.indices)
    elif fn is degree_preserving:
        assert report.nnz_after == report.nnz_before
        assert report.in_degree_preserved is True
        assert report.out_degree_preserved is True
        assert np.array_equal(np.diff(W_ctrl.indptr), np.diff(orig.indptr))
        assert np.array_equal(np.diff(csc.indptr), np.diff(orig.tocsc().indptr))
    elif fn is erdos_renyi:
        assert report.nnz_after == report.nnz_before

    # Verify per-row L1 input-strength matching when requested.
    if match_input and fn in (weight_shuffle, degree_preserving):
        orig_abs = np.asarray(np.abs(orig).sum(axis=1)).ravel()
        ctrl_abs = np.asarray(np.abs(W_ctrl).sum(axis=1)).ravel()
        assert np.allclose(ctrl_abs, orig_abs, atol=1e-5)
        assert report.input_abs_corr == pytest.approx(1.0, abs=1e-5)

    # Check report input_sum_corr matches direct computation.
    in0 = np.asarray(orig.sum(axis=1)).ravel()
    in1 = np.asarray(W_ctrl.sum(axis=1)).ravel()
    expected_corr = float(np.corrcoef(in0, in1)[0, 1])
    assert report.input_sum_corr == pytest.approx(expected_corr, abs=1e-6)


@pytest.mark.parametrize("fn", [weight_shuffle, degree_preserving, erdos_renyi])
def test_controls_are_reproducible_and_accept_raw_matrix(make_brain, fn):
    brain = make_brain(noise=False)
    orig = _brain_csr(brain)

    W1, r1 = fn(brain, seed=7)
    W2, r2 = fn(brain, seed=7)
    W3, r3 = fn(orig, seed=7)
    W4, _ = fn(brain, seed=8)

    assert r1 == r2 == r3
    assert np.array_equal(W1.indptr, W2.indptr) and np.array_equal(W1.indices, W2.indices)
    assert np.allclose(W1.data, W2.data)
    assert np.array_equal(W1.indptr, W3.indptr) and np.array_equal(W1.indices, W3.indices)
    assert np.allclose(W1.data, W3.data)
    assert not (
        np.array_equal(W1.indptr, W4.indptr)
        and np.array_equal(W1.indices, W4.indices)
        and np.allclose(W1.data, W4.data)
    )


def test_degree_preserving_resolves_self_loops_and_duplicates_on_dense_block():
    # A small dense 10-neuron matrix where naive permutation almost always creates
    # self-loops and duplicate pairs.
    rng = np.random.default_rng(0)
    n = 10
    rows, cols, vals = [], [], []
    signs = np.array([1, 1, 1, 1, 1, -1, -1, -1, -1, -1], dtype=np.float32)
    for i in range(n):
        for j in range(n):
            if i != j and rng.random() < 0.5:
                rows.append(i)
                cols.append(j)
                vals.append(float(signs[j]) * float(rng.uniform(0.1, 0.5)))
    W = sparse.csr_matrix((np.array(vals, np.float32), (rows, cols)), shape=(n, n))
    for seed in range(5):
        W_ctrl, rep = degree_preserving(W, seed=seed)
        assert rep.self_loops == 0
        assert rep.mixed_sign_outputs == 0
        assert rep.nnz_after == rep.nnz_before
        assert rep.in_degree_preserved is True
        assert rep.out_degree_preserved is True


def test_weight_shuffle_preserves_presynaptic_sign_and_permutes_magnitudes(make_brain):
    brain = make_brain(noise=False)
    orig = _brain_csr(brain)
    W_ctrl, rep = weight_shuffle(brain, seed=3)
    assert rep.mixed_sign_outputs == 0
    # INH (col 20) -> B (row 19) stays negative; A (col 18) -> B (row 19) stays positive.
    assert W_ctrl[B, INH] < 0
    assert W_ctrl[B, A] > 0
    assert np.allclose(np.sort(np.abs(W_ctrl.data)), np.sort(np.abs(orig.data)))


def test_use_wiring_swaps_and_restores_cpu_even_on_exception(make_brain):
    brain = make_brain(noise=False)
    orig_indptr = brain.indptr.copy()
    orig_indices = brain.indices.copy()
    orig_weights = brain.weights.copy()

    # Empty wiring silences A -> B transmission.
    empty = sparse.csr_matrix((N, N), dtype=np.float32)
    with use_wiring(brain, empty):
        brain.reset(0)
        brain.stimulate([A], 1.5)
        first = set(brain.step().tolist())
        second = set(brain.step().tolist())
        assert first == {A}
        assert B not in second and SENS not in second

    # Original wiring restored: A -> B and A -> SENS fire again.
    assert np.array_equal(brain.indptr, orig_indptr)
    assert np.array_equal(brain.indices, orig_indices)
    assert np.array_equal(brain.weights, orig_weights)
    brain.reset(0)
    brain.stimulate([A], 1.5)
    assert set(brain.step().tolist()) == {A}
    assert set(brain.step().tolist()) == {B, SENS}

    # Restoration also holds if an exception is raised inside the context.
    with pytest.raises(RuntimeError, match="boom"):
        with use_wiring(brain, empty):
            assert brain.weights.size == 0
            raise RuntimeError("boom")
    assert np.array_equal(brain.weights, orig_weights)


def test_use_wiring_updates_and_restores_cuda_matrix(make_brain, monkeypatch):
    brain = make_brain(noise=False)
    sentinel_orig = object()
    uploaded = []

    fake_cusparse = types.ModuleType("cupyx.scipy.sparse")
    def _fake_csr(mat):
        token = ("gpu_csr", mat.nnz, mat.data.copy())
        uploaded.append(token)
        return token
    fake_cusparse.csr_matrix = _fake_csr
    fake_scipy = types.ModuleType("cupyx.scipy")
    fake_scipy.sparse = fake_cusparse
    fake_cupyx = types.ModuleType("cupyx")
    fake_cupyx.scipy = fake_scipy
    monkeypatch.setitem(sys.modules, "cupyx", fake_cupyx)
    monkeypatch.setitem(sys.modules, "cupyx.scipy", fake_scipy)
    monkeypatch.setitem(sys.modules, "cupyx.scipy.sparse", fake_cusparse)

    brain.device = "cuda"
    brain._W = sentinel_orig
    W_ctrl, _ = weight_shuffle(brain, seed=5)

    with use_wiring(brain, W_ctrl):
        assert len(uploaded) == 1
        assert brain._W is uploaded[0]
        assert brain._W[1] == W_ctrl.nnz
    assert brain._W is sentinel_orig


@pytest.mark.parametrize("batch", [1, 3])
def test_blank_rates_matches_manual_no_stimulus_runs(make_brain, batch):
    brain = make_brain(batch=batch)
    brain.noise_amp = 0.5
    seeds = [4, 5]
    warm, steps = 5, 40

    got = blank_rates(brain, steps=steps, seeds=seeds, warm=warm)
    assert got.shape == (N, len(seeds) * batch)

    # Compare against manual loop with identical seeds, warm, and steps.
    manual = []
    for seed in seeds:
        brain.reset(seed)
        for _ in range(warm):
            brain.step()
        counts = np.zeros((N, batch), dtype=np.int32)
        for _ in range(steps):
            fired = brain.step()
            if batch == 1:
                counts[fired, 0] += 1
            else:
                for k, f in enumerate(fired):
                    counts[f, k] += 1
        manual.append(counts / (steps * brain.dt))
    expected = np.concatenate(manual, axis=1)
    assert np.allclose(got, expected)
    assert got.sum() > 0


def test_report_str_contains_key_fields(make_brain):
    brain = make_brain(noise=False)
    _, rep = degree_preserving(brain, seed=0)
    s = str(rep)
    assert "degree_preserving" in s
    assert "self_loops=0" in s
    assert "mixed_sign_outputs=0" in s
    assert "in_deg=yes" in s
    assert "out_deg=yes" in s
