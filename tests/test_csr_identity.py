"""Regression test: edge identity must not change at the first GPU sparse product.

    python -m pytest tests/test_csr_identity.py     or     python tests/test_csr_identity.py

1. test_prefix_construction_is_resorted_by_gpu (negative control, synthetic, seconds): the
   pre-fix construction (row mask on a CSR, then upload) gives an unsorted CSR that the first
   cuSPARSE product re-sorts in place.  If this passes, the bug is live in this CuPy and test 2
   is meaningful.
2. test_flybrain_edge_identity_survives_first_spmv (MaleCNS data, ~1 min): FlyBrain's GPU matrix
   has the same indptr, indices and data before and after the first steps (with spikes), and
   the cached positions of every KC->MBON edge still point at the same presynaptic neurons.
Both need an NVIDIA GPU with CuPy; they are skipped otherwise.  Test 2 needs the brain data
($FLY_DATA or flybrain's default folder).
"""
import hashlib
import os
import sys

import numpy as np
from scipy import sparse


def _cupy():
    try:
        import cupy
        if cupy.cuda.runtime.getDeviceCount() > 0:
            return cupy
    except Exception:                                        # noqa: BLE001
        pass
    return None


def _skip(msg):
    try:
        import pytest
        pytest.skip(msg)
    except ImportError:
        print("SKIP", msg)
        raise SystemExit(0)


def _h(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def test_prefix_construction_is_resorted_by_gpu():
    cp = _cupy()
    if cp is None:
        _skip("no CUDA GPU / CuPy")
    from cupyx.scipy import sparse as cusparse
    rng = np.random.default_rng(0)
    n = 2000
    W = sparse.random(n, n, density=0.01, format="csr", random_state=1, dtype=np.float32)
    mask = rng.random(n) < 0.9
    Wm = sparse.diags(mask.astype(np.float32)) @ W.tocsr()   # the pre-fix line
    G = cusparse.csr_matrix(Wm.tocsr().astype(np.float32))
    before = _h(cp.asnumpy(G.indices))
    x = cp.zeros(n, cp.float32); x[:50] = 1
    _ = G @ x
    cp.cuda.Device().synchronize()
    after = _h(cp.asnumpy(G.indices))
    if Wm.has_sorted_indices:
        _skip("scipy produced sorted indices here; the unsorted case is not reached")
    assert before != after, "negative control: the unsorted matrix was NOT re-sorted by the first GPU product"


def test_flybrain_edge_identity_survives_first_spmv():
    cp = _cupy()
    if cp is None:
        _skip("no CUDA GPU / CuPy")
    from flybrain import FlyBrain
    from flybrain.data import has_data, DATA
    data = os.environ.get("FLY_DATA") or os.environ.get("GPF_FLY_DATA") or DATA
    if not has_data(data):
        _skip(f"no brain data in {data}")
    b = FlyBrain(data=data, device="cuda", batch=1, seed=1, sensory_input=False)
    ip0, ix0, d0 = (cp.asnumpy(a).copy() for a in (b._W.indptr, b._W.indices, b._W.data))
    assert b._W.has_sorted_indices, "matrix uploaded without sorted indices"
    # cached positions of every KC->MBON edge (as plasticity code does), before any product
    ct = np.asarray(b.cell_type).astype(str)
    kc = np.char.find(ct, "KC") >= 0
    mbon = np.char.find(ct, "MBON") >= 0
    rows = np.repeat(np.arange(b.n), np.diff(ip0))
    pos = np.flatnonzero(mbon[rows] & kc[ix0])
    pre_ids = ix0[pos].copy()
    assert len(pos) > 60000, f"expected ~61k KC->MBON edges, found {len(pos)}"
    rng = np.random.default_rng(0)
    for _ in range(3):                                       # spikes -> non-trivial products
        b.stimulate(rng.choice(b.n, 5000, replace=False), 2.0)
        b.step()
    cp.cuda.Device().synchronize()
    ip1, ix1, d1 = (cp.asnumpy(a) for a in (b._W.indptr, b._W.indices, b._W.data))
    assert np.array_equal(ip0, ip1), "indptr changed"
    assert np.array_equal(ix0, ix1), "column indices changed after the first sparse product"
    assert np.array_equal(d0, d1), "weights moved after the first sparse product"
    assert np.array_equal(ix1[pos], pre_ids), "cached KC->MBON positions now point at other neurons"


if __name__ == "__main__":
    for name, f in list(globals().items()):
        if name.startswith("test_"):
            f(); print("ok", name)
    sys.exit(0)
