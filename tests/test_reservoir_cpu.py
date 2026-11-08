"""pytest tests/test_reservoir_cpu.py -- flybrain.reservoir (Trace, run, Readout, auc, folds) on CPU."""
import numpy as np
import pytest

from conftest import A, B, DNP01, LC4, SENS
from flybrain import Readout, Trace, auc, folds, run


# ---- Trace ---------------------------------------------------------------------------------

def test_trace_counts_only_its_population_and_decays(make_brain):
    brain = make_brain()
    tr = Trace(brain, idx=np.array([A, B]), tau=0.1)
    f = tr.observe(np.array([A, SENS]))           # SENS is outside the population
    assert f.tolist() == [1.0, 0.0]
    f = tr.observe(np.array([], np.int64))
    assert f[0] == pytest.approx(np.exp(-brain.dt / 0.1)) and f[1] == 0.0
    tr.reset()
    assert not tr.features().any()


def test_trace_picks_population_by_types_side_and_group(make_brain):
    brain = make_brain()
    assert set(Trace(brain, types=["LC4"], side="R").idx) == set(LC4["R"])
    assert Trace(brain, group="escape_L").idx.tolist() == [DNP01["L"]]
    with pytest.raises(ValueError):
        Trace(brain, types=["LC4"], idx=np.array([0]))


def test_trace_batch_mean_and_per_fly(make_brain):
    brain = make_brain(batch=2)
    fired = [np.array([A]), np.array([], np.int64)]
    assert Trace(brain, idx=np.array([A])).observe(fired).tolist() == [0.5]
    assert Trace(brain, idx=np.array([A]), aggregate="batch").observe(fired).tolist() == [[1.0, 0.0]]


# ---- run -----------------------------------------------------------------------------------

def test_run_records_the_stimulus_and_its_downstream_effect(make_brain):
    brain = make_brain(noise=False)
    act = run(brain, 4, encode=lambda t: [([A], 1.5)] if t == 0 else [],
              trace=Trace(brain, idx=np.array([A, B])))
    assert act.shape == (4, 2)
    assert act[0].tolist() == [1.0, 0.0]          # A fires on step 0
    assert act[1, 1] == 1.0                       # B one step later
    assert act[3, 0] < act[1, 0] < act[0, 0]      # and the trace decays


def test_brain_as_reservoir_recovers_which_side_was_stimulated(make_brain):
    """End to end: stimulate left or right LC4 for a few steps, read the DNp01 trace,
    and a logistic readout learns the side on held-out trials."""
    brain = make_brain()
    rng = np.random.default_rng(0)
    X, y = [], []
    for trial in range(40):
        side = "LR"[trial % 2]
        brain.reset(int(rng.integers(1 << 30)))
        act = run(brain, 6, encode=lambda t: [(LC4[side], 1.5)] if t < 3 else [],
                  trace=Trace(brain, types=["DNp01"]))
        X.append(act[-1]); y.append(int(side == "R"))
    X, y = np.array(X), np.array(y)
    r = Readout.fit(X[:30], y[:30], kind="logistic", components=(None,), lambdas=(1e-2,))
    assert auc(y[30:], r.predict(X[30:])) == 1.0


# ---- Readout -------------------------------------------------------------------------------

def _labelled(n=400, d=30, seed=0):
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(n, d))
    w = np.zeros(d); w[:3] = [2.0, -1.5, 1.0]
    return X, X @ w, rng


def test_logistic_readout_recovers_a_known_label():
    X, score, rng = _labelled()
    y = (score + rng.normal(0, 0.3, len(score)) > 0).astype(int)
    r = Readout.fit(X[:300], y[:300], kind="logistic")
    assert r.cv_score > 0.9
    assert auc(y[300:], r.predict(X[300:])) > 0.9


def test_logistic_readout_on_noise_scores_chance():
    X, _, rng = _labelled()
    y = rng.integers(0, 2, len(X))
    r = Readout.fit(X[:300], y[:300], kind="logistic")
    assert 0.35 < auc(y[300:], r.predict(X[300:])) < 0.65


def test_ridge_readout_recovers_a_linear_target_and_multi_output():
    X, score, _ = _labelled()
    r = Readout.fit(X[:300], score[:300], kind="ridge", components=(None,), lambdas=(1e-4,))
    assert np.corrcoef(r.predict(X[300:]), score[300:])[0, 1] > 0.99
    Y = np.column_stack([score, -2 * score])
    r2 = Readout.fit(X[:300], Y[:300], kind="ridge", components=(None,), lambdas=(1e-4,))
    pred = r2.predict(X[300:])
    assert pred.shape == (100, 2)
    assert np.allclose(pred[:, 1], -2 * pred[:, 0], atol=1e-6 + 1e-3 * np.abs(pred).max())


def test_readout_single_sample_matches_batch():
    X, score, _ = _labelled()
    r = Readout.fit(X, (score > 0).astype(int), kind="logistic", components=(5,), lambdas=(0.1,))
    assert r.predict(X[7]) == pytest.approx(r.predict(X[:10])[7])
    assert 0.0 <= r.predict(X[7]) <= 1.0


@pytest.mark.parametrize("kind,components", [("logistic", 5), ("ridge", None)])
def test_readout_save_load_round_trip(tmp_path, kind, components):
    X, score, _ = _labelled()
    y = (score > 0).astype(int) if kind == "logistic" else score
    r = Readout.fit(X, y, kind=kind, components=(components,), lambdas=(0.1,))
    r.save(tmp_path / "readout.npz")
    back = Readout.load(tmp_path / "readout.npz")
    assert (back.kind, back.components, back.lam) == (kind, components, 0.1)
    assert back.cv_score == pytest.approx(r.cv_score)
    assert np.allclose(back.predict(X), r.predict(X))


def test_readout_rejects_unknown_kind():
    with pytest.raises(ValueError):
        Readout.fit(np.zeros((10, 2)), np.zeros(10), kind="svm")


# ---- auc, folds ----------------------------------------------------------------------------

def test_auc():
    y = np.array([0, 0, 1, 1])
    assert auc(y, np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert auc(y, np.array([0.9, 0.8, 0.2, 0.1])) == 0.0
    assert auc(y, np.array([0.1, 0.8, 0.2, 0.9])) == 0.75
    assert np.isnan(auc(np.ones(4), np.arange(4.0)))


def test_kfold_tests_every_sample_once_and_never_leaks():
    seen = []
    for train, test in folds(23, k=5):
        assert not set(train) & set(test)
        assert len(train) + len(test) == 23
        seen += test.tolist()
    assert sorted(seen) == list(range(23))


def test_group_folds_hold_out_whole_groups():
    groups = np.array(["a", "a", "b", "c", "c", "c"])
    splits = list(folds(len(groups), groups=groups))
    assert len(splits) == 3
    for train, test in splits:
        assert len(set(groups[test])) == 1
        assert not set(groups[train]) & set(groups[test])
    assert list(folds(3, groups=np.array(["x", "x", "x"]))) == []    # one group: nothing to train on
