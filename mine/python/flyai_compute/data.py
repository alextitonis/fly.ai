"""Data shards for ``train`` runs, in the server's format (mine/src/train.ts):

    "FLYDATA1" | u32 rows | u32 x_dim | u32 y_kind (0 labels, 1 floats) | u32 y_dim | f32 x[rows*x_dim] | y

y is u32 class labels (one per row) or f32 targets (y_dim per row), all little-endian.
"""

import struct
from array import array
from typing import Any, Sequence

MAGIC = b"FLYDATA1"


def _np():
    try:
        import numpy

        return numpy
    except ImportError:
        return None


def _floats(x: Any) -> tuple:
    """(flat little-endian f32 bytes, rows, cols) from a 2-D numpy array or a list of rows."""
    np = _np()
    if np is not None and isinstance(x, np.ndarray):
        if x.ndim != 2:
            raise ValueError("x must be 2-D: rows x features")
        return x.astype("<f4").tobytes(), x.shape[0], x.shape[1]
    rows = [list(r) for r in x]
    if not rows or any(len(r) != len(rows[0]) for r in rows):
        raise ValueError("x must be a non-empty list of equal-length rows")
    a = array("f", (float(v) for r in rows for v in r))
    if struct.pack("=I", 1) != struct.pack("<I", 1):
        a.byteswap()
    return a.tobytes(), len(rows), len(rows[0])


def encode_shard(x: Any, y: Any, classes: int = None) -> bytes:
    """One shard from features and targets.

    For classification pass integer labels and ``classes`` (or let it be max(label) + 1). For regression pass float
    targets, one row per x row (a 1-D list counts as one target a row).
    """
    xb, rows, cols = _floats(x)
    np = _np()
    labels = None
    if np is not None and isinstance(y, np.ndarray):
        if y.ndim == 1 and np.issubdtype(y.dtype, np.integer):
            labels = [int(v) for v in y]
        else:
            yb, yr, yc = _floats(y.reshape(len(y), -1).astype("float64"))
    elif all(isinstance(v, int) for v in y):
        labels = [int(v) for v in y]
    else:
        yy = [v if isinstance(v, (list, tuple)) else [v] for v in y]
        yb, yr, yc = _floats(yy)
    if labels is not None:
        if len(labels) != rows:
            raise ValueError("one label per row")
        k = classes if classes is not None else max(labels) + 1
        if min(labels) < 0 or max(labels) >= k:
            raise ValueError(f"labels must be 0..{k - 1}")
        return MAGIC + struct.pack("<4I", rows, cols, 0, k) + xb + struct.pack(f"<{rows}I", *labels)
    if yr != rows:
        raise ValueError("one target row per x row")
    return MAGIC + struct.pack("<4I", rows, cols, 1, yc) + xb + yb


def decode_shard(b: bytes) -> dict:
    """A shard back as {rows, x_dim, y_kind, y_dim, x: [[...]], y: [...]}."""
    if b[:8] != MAGIC:
        raise ValueError("not a FLYDATA1 shard")
    rows, xd, kind, yd = struct.unpack_from("<4I", b, 8)
    xs = struct.unpack_from(f"<{rows * xd}f", b, 24)
    at = 24 + rows * xd * 4
    ys = struct.unpack_from(f"<{rows}I", b, at) if kind == 0 else struct.unpack_from(f"<{rows * yd}f", b, at)
    return {"rows": rows, "x_dim": xd, "y_kind": kind, "y_dim": yd,
            "x": [list(xs[r * xd:(r + 1) * xd]) for r in range(rows)],
            "y": list(ys) if kind == 0 else [list(ys[r * yd:(r + 1) * yd]) for r in range(rows)]}


def split(n: int, parts: int) -> Sequence[tuple]:
    """(start, end) of `parts` near-equal slices of n rows."""
    parts = max(1, min(parts, n))
    return [(i * n // parts, (i + 1) * n // parts) for i in range(parts)]


def f64_bytes(xs: Sequence[float]) -> bytes:
    return struct.pack(f"<{len(xs)}d", *xs)


def f32_bytes(xs: Sequence[float]) -> bytes:
    return struct.pack(f"<{len(xs)}f", *xs)
