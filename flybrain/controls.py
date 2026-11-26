"""Tested control wirings (shuffles) with matched no-stimulus blanks for FlyBrain.

Every control accepts either a loaded `FlyBrain` or a sparse weight matrix (rows =
postsynaptic, columns = presynaptic) and a seed, and returns `(W_ctrl, report)`:

    W_ctrl, report = degree_preserving(brain, seed=0)
    with use_wiring(brain, W_ctrl):
        base = blank_rates(brain, steps=50, seeds=[0, 1], warm=10)
        ...

All three controls preserve Dale's law (no neuron has mixed excitatory/inhibitory
outputs), keep `sensory_input=False` rows empty, and offer optional per-row L1
input-strength matching (`match_input=True`, matching `flybrain.build`'s per-neuron
input normalization).
"""
from __future__ import annotations

from collections.abc import Iterable
from contextlib import contextmanager
from dataclasses import dataclass

import numpy as np
from scipy import sparse

from .brain import FlyBrain


@dataclass(frozen=True)
class ControlReport:
    """Summary of structural and input-strength properties of a control wiring."""
    kind: str
    seed: int
    nnz_before: int
    nnz_after: int
    self_loops: int
    mixed_sign_outputs: int
    input_sum_corr: float
    input_abs_corr: float
    in_degree_preserved: bool
    out_degree_preserved: bool
    sensory_rows_empty: bool
    match_input: bool

    def __str__(self) -> str:
        return (
            f"{self.kind}(seed={self.seed}, match_input={self.match_input}): "
            f"nnz {self.nnz_before:,}->{self.nnz_after:,}, "
            f"self_loops={self.self_loops}, "
            f"mixed_sign_outputs={self.mixed_sign_outputs}, "
            f"input_sum_corr={self.input_sum_corr:.4f}, "
            f"input_abs_corr={self.input_abs_corr:.4f}, "
            f"in_deg={'yes' if self.in_degree_preserved else 'no'}, "
            f"out_deg={'yes' if self.out_degree_preserved else 'no'}, "
            f"sensory_empty={'yes' if self.sensory_rows_empty else 'no'}"
        )


def _canonical_csr(W: sparse.spmatrix) -> sparse.csr_matrix:
    M = sparse.csr_matrix(W, dtype=np.float32, copy=True)
    M.sum_duplicates()
    M.eliminate_zeros()
    M.sort_indices()
    return M


def _extract_matrix(
    brain_or_W: FlyBrain | sparse.spmatrix,
    sensory_mask: np.ndarray | None = None,
) -> tuple[sparse.csr_matrix, np.ndarray | None]:
    """Return `(W_csr, empty_row_mask)` from a `FlyBrain` or sparse weight matrix."""
    if isinstance(brain_or_W, FlyBrain):
        n = brain_or_W.n
        W_csc = sparse.csc_matrix(
            (brain_or_W.weights.copy(), brain_or_W.indices.copy(), brain_or_W.indptr.copy()),
            shape=(n, n),
            dtype=np.float32,
        )
        W = _canonical_csr(W_csc)
        if sensory_mask is None and not brain_or_W.sensory_input:
            if brain_or_W.superclass is None:
                raise RuntimeError("brain has no superclass metadata for sensory_input=False")
            sensory_mask = np.char.find(brain_or_W.superclass.astype(str), "sensory") >= 0
    elif sparse.issparse(brain_or_W):
        if brain_or_W.ndim != 2 or brain_or_W.shape[0] != brain_or_W.shape[1]:
            raise ValueError(f"weight matrix must be square, got {brain_or_W.shape}")
        W = _canonical_csr(brain_or_W)
    else:
        raise TypeError(f"expected FlyBrain or scipy.sparse matrix, got {type(brain_or_W).__name__}")

    if sensory_mask is not None:
        sensory_mask = np.asarray(sensory_mask, dtype=bool)
        if sensory_mask.shape != (W.shape[0],):
            raise ValueError(f"sensory_mask must have shape ({W.shape[0]},), got {sensory_mask.shape}")
        if sensory_mask.any():
            W = _canonical_csr(sparse.diags((~sensory_mask).astype(np.float32)) @ W)
    return W, sensory_mask


def _presynaptic_signs(W: sparse.csr_matrix, rng: np.random.Generator) -> np.ndarray:
    """Return +1/-1 sign per presynaptic neuron (column) preserving W's signs."""
    n = W.shape[0]
    W_csc = W.tocsc()
    col_sum = np.asarray(W_csc.sum(axis=0)).ravel()
    has_out = np.diff(W_csc.indptr) > 0
    pos_frac = float((col_sum[has_out] > 0).mean()) if has_out.any() else 0.5
    signs = np.where(rng.random(n) < pos_frac, np.float32(1.0), np.float32(-1.0))
    signs[has_out] = np.where(col_sum[has_out] < 0, np.float32(-1.0), np.float32(1.0))
    return signs


def _match_row_input_strength(W_orig: sparse.csr_matrix, W_ctrl: sparse.csr_matrix) -> sparse.csr_matrix:
    """Rescale each non-empty postsynaptic row of `W_ctrl` to match `W_orig`'s L1 input sum.

    Positive row scaling preserves every presynaptic neuron's sign, nnz, self-loop count,
    and in/out-degrees while restoring per-neuron input normalization (`build.py`).
    """
    n = W_orig.shape[0]
    target = np.asarray(np.abs(W_orig).sum(axis=1)).ravel().astype(np.float64)
    actual = np.asarray(np.abs(W_ctrl).sum(axis=1)).ravel().astype(np.float64)
    scale = np.ones(n, dtype=np.float32)
    nz = (actual > 0.0) & (target > 0.0)
    scale[nz] = (target[nz] / actual[nz]).astype(np.float32)
    # In erdos_renyi, a non-sensory row that was empty in W_orig may receive edges;
    # scale it to the median non-zero target (1.0 on MaleCNS) if any target exists.
    new_rows = (actual > 0.0) & (target == 0.0)
    if new_rows.any() and (target > 0.0).any():
        default_strength = float(np.median(target[target > 0.0]))
        scale[new_rows] = (default_strength / actual[new_rows]).astype(np.float32)
    return _canonical_csr(sparse.diags(scale) @ W_ctrl)


def _safe_corr(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.size < 2:
        return float("nan")
    sa = float(a.std())
    sb = float(b.std())
    if sa == 0.0 and sb == 0.0:
        return 1.0 if np.allclose(a, b) else 0.0
    if sa == 0.0 or sb == 0.0:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def _mixed_sign_count(W: sparse.csr_matrix) -> int:
    W_csc = W.tocsc()
    pos = np.asarray((W_csc > 0).sum(axis=0)).ravel()
    neg = np.asarray((W_csc < 0).sum(axis=0)).ravel()
    return int(np.sum((pos > 0) & (neg > 0)))


def _build_report(
    kind: str,
    seed: int,
    W_orig: sparse.csr_matrix,
    W_ctrl: sparse.csr_matrix,
    sensory_mask: np.ndarray | None,
    match_input: bool,
) -> ControlReport:
    in_deg_orig = np.diff(W_orig.indptr)
    in_deg_ctrl = np.diff(W_ctrl.indptr)
    out_deg_orig = np.diff(W_orig.tocsc().indptr)
    out_deg_ctrl = np.diff(W_ctrl.tocsc().indptr)

    in_sum_orig = np.asarray(W_orig.sum(axis=1)).ravel()
    in_sum_ctrl = np.asarray(W_ctrl.sum(axis=1)).ravel()
    in_abs_orig = np.asarray(np.abs(W_orig).sum(axis=1)).ravel()
    in_abs_ctrl = np.asarray(np.abs(W_ctrl).sum(axis=1)).ravel()

    self_loops = int((W_ctrl.diagonal() != 0).sum())
    mixed_sign = _mixed_sign_count(W_ctrl)
    if sensory_mask is not None and sensory_mask.any():
        sensory_empty = bool(np.all(in_deg_ctrl[sensory_mask] == 0))
    else:
        sensory_empty = True

    return ControlReport(
        kind=kind,
        seed=int(seed),
        nnz_before=int(W_orig.nnz),
        nnz_after=int(W_ctrl.nnz),
        self_loops=self_loops,
        mixed_sign_outputs=mixed_sign,
        input_sum_corr=_safe_corr(in_sum_orig, in_sum_ctrl),
        input_abs_corr=_safe_corr(in_abs_orig, in_abs_ctrl),
        in_degree_preserved=bool(np.array_equal(in_deg_orig, in_deg_ctrl)),
        out_degree_preserved=bool(np.array_equal(out_deg_orig, out_deg_ctrl)),
        sensory_rows_empty=sensory_empty,
        match_input=bool(match_input),
    )


def _resolve_degree_preserving_conflicts(
    post: np.ndarray,
    pre: np.ndarray,
    n: int,
    rng: np.random.Generator,
    max_rounds: int = 64,
) -> tuple[np.ndarray, np.ndarray]:
    """Eliminate self-loops and duplicate `(post, pre)` pairs by swapping `post` entries.

    Swapping `post[i]` with `post[j]` preserves every neuron's exact in-degree and
    out-degree, never introduces edges into empty rows, and runs in O(nnz) time on
    large sparse graphs like MaleCNS (only the tiny conflicting subset is swapped).
    """
    m = len(post)
    if m == 0:
        return post, pre
    n64 = np.int64(n)
    for _outer in range(8):
        keys = post.astype(np.int64) * n64 + pre.astype(np.int64)
        order = np.argsort(keys, kind="mergesort")
        sorted_keys = keys[order]
        dup_mask = np.zeros(m, dtype=bool)
        if m > 1:
            dup_pos = np.flatnonzero(sorted_keys[1:] == sorted_keys[:-1]) + 1
            dup_mask[order[dup_pos]] = True
        bad = np.flatnonzero((post == pre) | dup_mask)
        if bad.size == 0:
            return post, pre

        added_keys: set[int] = set()
        for _ in range(max_rounds // 4):
            if bad.size == 0:
                return post, pre
            partners = rng.integers(0, m, size=bad.size)
            pi = post[bad]
            pj = post[partners]
            ci = pre[bad]
            cj = pre[partners]
            k1 = pj.astype(np.int64) * n64 + ci.astype(np.int64)
            k2 = pi.astype(np.int64) * n64 + cj.astype(np.int64)
            p1 = np.searchsorted(sorted_keys, k1)
            hit1 = (p1 < m) & (sorted_keys[np.minimum(p1, m - 1)] == k1)
            p2 = np.searchsorted(sorted_keys, k2)
            hit2 = (p2 < m) & (sorted_keys[np.minimum(p2, m - 1)] == k2)
            ok = (bad != partners) & (pi != pj) & (ci != cj) & (pj != ci) & (pi != cj) & (k1 != k2) & (~hit1) & (~hit2)
            still_bad = []
            used: set[int] = set()
            for idx_i, idx_j, valid, kk1, kk2, p_i, p_j in zip(
                bad.tolist(), partners.tolist(), ok.tolist(), k1.tolist(), k2.tolist(), pi.tolist(), pj.tolist()
            ):
                if (not valid) or (idx_i in used) or (idx_j in used) or (kk1 in added_keys) or (kk2 in added_keys):
                    still_bad.append(idx_i)
                    continue
                post[idx_i] = p_j
                post[idx_j] = p_i
                added_keys.add(kk1)
                added_keys.add(kk2)
                used.add(idx_i)
                used.add(idx_j)
            bad = np.array(still_bad, dtype=np.int64)

    return post, pre


def weight_shuffle(
    brain_or_W: FlyBrain | sparse.spmatrix,
    seed: int = 0,
    *,
    match_input: bool = False,
    sensory_mask: np.ndarray | None = None,
) -> tuple[sparse.csr_matrix, ControlReport]:
    """Permute synapse weight magnitudes across the same `(post, pre)` pairs, keeping
    each presynaptic neuron's sign."""
    W_orig, s_mask = _extract_matrix(brain_or_W, sensory_mask)
    rng = np.random.default_rng(seed)
    coo = W_orig.tocoo()
    signs = _presynaptic_signs(W_orig, rng)
    perm_mag = rng.permutation(np.abs(coo.data))
    w_new = (perm_mag * signs[coo.col]).astype(np.float32, copy=False)
    W_ctrl = _canonical_csr(sparse.csr_matrix((w_new, (coo.row, coo.col)), shape=W_orig.shape, dtype=np.float32))
    if match_input:
        W_ctrl = _match_row_input_strength(W_orig, W_ctrl)
    return W_ctrl, _build_report("weight_shuffle", seed, W_orig, W_ctrl, s_mask, match_input)


def degree_preserving(
    brain_or_W: FlyBrain | sparse.spmatrix,
    seed: int = 0,
    *,
    match_input: bool = False,
    sensory_mask: np.ndarray | None = None,
) -> tuple[sparse.csr_matrix, ControlReport]:
    """Permute postsynaptic partners while keeping each synapse's presynaptic neuron
    and weight (preserving out-degree, in-degree, and presynaptic sign), with no
    self-loops and duplicate pairs resolved by edge swaps."""
    W_orig, s_mask = _extract_matrix(brain_or_W, sensory_mask)
    rng = np.random.default_rng(seed)
    n = W_orig.shape[0]
    coo = W_orig.tocoo()
    pre = coo.col.astype(np.int32, copy=True)
    post = rng.permutation(coo.row.astype(np.int32, copy=False))
    data = coo.data.astype(np.float32, copy=True)

    post, pre = _resolve_degree_preserving_conflicts(post, pre, n, rng)
    # Guard against any mathematically unresolvable self-loop on a degenerate tiny graph.
    keep = post != pre
    if not keep.all():
        post, pre, data = post[keep], pre[keep], data[keep]

    W_ctrl = _canonical_csr(sparse.csr_matrix((data, (post, pre)), shape=W_orig.shape, dtype=np.float32))
    if match_input:
        W_ctrl = _match_row_input_strength(W_orig, W_ctrl)
    return W_ctrl, _build_report("degree_preserving", seed, W_orig, W_ctrl, s_mask, match_input)


def erdos_renyi(
    brain_or_W: FlyBrain | sparse.spmatrix,
    seed: int = 0,
    *,
    match_input: bool = False,
    sensory_mask: np.ndarray | None = None,
) -> tuple[sparse.csr_matrix, ControlReport]:
    """Random `(post, pre)` pairs with the same neurons and edge count, no self-loops,
    no duplicate pairs, Dale's-law presynaptic signs, and `sensory_input=False` rows
    kept empty."""
    W_orig, s_mask = _extract_matrix(brain_or_W, sensory_mask)
    rng = np.random.default_rng(seed)
    n = W_orig.shape[0]
    m = int(W_orig.nnz)
    allowed_post = np.flatnonzero(~s_mask).astype(np.int32) if (s_mask is not None and s_mask.any()) else np.arange(n, dtype=np.int32)
    max_edges = int(len(allowed_post)) * max(n - 1, 0)
    if m > max_edges:
        raise ValueError(f"cannot sample {m} simple off-diagonal edges into {len(allowed_post)} allowed rows of size {n}")

    n64 = np.int64(n)
    keys = np.empty(0, dtype=np.int64)
    while keys.size < m:
        need = m - keys.size
        # Slight oversampling minimizes redraw iterations even on denser tiny fixtures.
        draw = max(need + max(need // 16, 16), need)
        p_cand = allowed_post[rng.integers(0, len(allowed_post), size=draw)]
        c_cand = rng.integers(0, n, size=draw, dtype=np.int32)
        ok = p_cand != c_cand
        cand_keys = p_cand[ok].astype(np.int64) * n64 + c_cand[ok].astype(np.int64)
        if keys.size == 0:
            keys = np.unique(cand_keys)
        else:
            keys = np.unique(np.concatenate([keys, cand_keys]))
        if keys.size > m:
            # Randomly drop excess unique draws rather than biasing toward low row indices.
            excess = keys.size - m
            drop = rng.choice(keys.size, size=excess, replace=False)
            keep = np.ones(keys.size, dtype=bool)
            keep[drop] = False
            keys = keys[keep]

    post = (keys // n64).astype(np.int32)
    pre = (keys % n64).astype(np.int32)
    signs = _presynaptic_signs(W_orig, rng)
    perm_mag = rng.permutation(np.abs(W_orig.data))
    w_new = (perm_mag * signs[pre]).astype(np.float32, copy=False)

    W_ctrl = _canonical_csr(sparse.csr_matrix((w_new, (post, pre)), shape=W_orig.shape, dtype=np.float32))
    if match_input:
        W_ctrl = _match_row_input_strength(W_orig, W_ctrl)
    return W_ctrl, _build_report("erdos_renyi", seed, W_orig, W_ctrl, s_mask, match_input)


@contextmanager
def use_wiring(brain: FlyBrain, W: sparse.spmatrix):
    """Temporarily replace `brain`'s synaptic weights with `W`, restoring the original
    wiring on exit (on both CPU and CUDA)."""
    if not sparse.issparse(W) or W.shape != (brain.n, brain.n):
        raise ValueError(f"wiring must be a ({brain.n}, {brain.n}) sparse matrix, got {getattr(W, 'shape', type(W).__name__)}")
    W_csr = _canonical_csr(W)
    W_csc = W_csr.tocsc()

    old_indptr, old_indices, old_weights = brain.indptr, brain.indices, brain.weights
    has_gpu = brain.device == "cuda"
    old_gpu_W = getattr(brain, "_W", None) if has_gpu else None
    try:
        if has_gpu:
            from cupyx.scipy import sparse as cusparse
            brain._W = cusparse.csr_matrix(W_csr)
        brain.indptr, brain.indices, brain.weights = W_csc.indptr, W_csc.indices, W_csc.data
        yield brain
    finally:
        brain.indptr, brain.indices, brain.weights = old_indptr, old_indices, old_weights
        if has_gpu:
            brain._W = old_gpu_W


def blank_rates(
    brain: FlyBrain,
    steps: int,
    seeds: Iterable[int],
    *,
    warm: int = 0,
) -> np.ndarray:
    """Run matched no-stimulus trials on `brain` for each seed and return firing rates
    in Hz with shape `(brain.n, len(seeds) * brain.batch)`."""
    steps = int(steps)
    warm = int(warm)
    if steps <= 0:
        raise ValueError(f"steps must be positive, got {steps}")
    if warm < 0:
        raise ValueError(f"warm must be non-negative, got {warm}")
    seed_list = [int(s) for s in seeds]
    if not seed_list:
        raise ValueError("seeds must be non-empty")

    batch = brain.batch
    window = steps * brain.dt
    runs = []
    for seed in seed_list:
        brain.reset(seed)
        for _ in range(warm):
            brain.step()
        counts = np.zeros((brain.n, batch), dtype=np.int32)
        for _ in range(steps):
            fired = brain.step()
            if batch == 1:
                counts[fired, 0] += 1
            else:
                for k, f in enumerate(fired):
                    counts[f, k] += 1
        runs.append(counts / window)
    return np.concatenate(runs, axis=1)
