"""Leaky integrate-and-fire simulation of the MaleCNS connectome.

Dynamics follow ornata/fly (fly64/model.py) so results are comparable:
    v <- exp(-dt/tau) v + gain * W @ spikes + tonic + noise + eye input
    v >= 1 -> spike, reset to 0
tonic/gain/noise are hand-calibrated, not measured. fly64 used tonic 0.18,
gain 1.5, which parks every neuron at threshold (0.18 / (1 - 0.82) = 1.0) so
the network ticks on its own. inject.py showed tonic 0.14, gain 3.0 keeps
descending neurons quiet at rest (~1 Hz) while LC4/LPLC2 -> DNp01 and
LC10a -> DNa02 signals still get through, ipsilaterally.

batch > 1 runs that many independent flies (same wiring, own voltages and
noise) in lock-step; on a GPU one sparse multiply serves them all, so 8 flies
cost about as much as 1-2.
"""
from __future__ import annotations

import os
from pathlib import Path

import numba
import numpy as np
from scipy import sparse

from .data import DATA, ensure_data


@numba.njit(nogil=True, parallel=True)
def _propagate(indptr, indices, weights, fired, n):
    """Sum the outgoing weights (CSC columns) of every neuron that spiked.
    Each thread scatters into its own buffer; buffers are summed at the end."""
    threads = numba.get_num_threads()
    partial = np.zeros((threads, n), np.float32)
    chunk = (len(fired) + threads - 1) // threads
    for t in numba.prange(threads):
        acc = partial[t]
        for k in range(t * chunk, min(len(fired), (t + 1) * chunk)):
            j = fired[k]
            for e in range(indptr[j], indptr[j + 1]):
                acc[indices[e]] += weights[e]
    current = np.zeros(n, np.float32)
    for i in numba.prange(n):
        s = np.float32(0.0)
        for t in range(threads):
            s += partial[t, i]
        current[i] = s
    return current


def cuda_available() -> bool:
    try:
        import cupy
        return cupy.cuda.runtime.getDeviceCount() > 0
    except Exception:
        return False


class FlyBrain:
    """device: "cpu" (numba), "cuda" (CuPy, NVIDIA GPU) or "auto"; defaults to
    $FLY_DEVICE, else "cpu". Both run the same model; the noise streams differ,
    so individual spikes differ between devices but statistics match.

    batch: number of independent flies. Voltages are (n, batch). With batch 1,
    step() returns the fired neuron indices; with batch > 1, a list of them,
    one array per fly. Inputs broadcast: an amount can be a number (same for
    every fly) or an array of length batch (one per fly)."""
    dt = 0.020
    tau = 0.100
    gain = 3.0
    tonic = 0.14            # calibrated at dt = 0.020; rescaled for other steps (see __init__)
    noise_hz = 1.2
    noise_amp = 0.22
    eye_gain = 0.62

    def __init__(self, data: Path | str | None = None, seed: int = 64, device: str | None = None, batch: int = 1,
                 dt: float | None = None, sensory_input: bool = True, refractory: float = 0.0):
        """data: folder with brain.npz and weights.npz (default $FLY_DATA, else ~/fly-data).
        If they aren't there, the prebuilt brain is downloaded into it first (~260 MB, once).

        dt: step length in seconds (default 0.020). tonic is rescaled so a silent
        neuron settles at the same voltage as in the calibrated 20 ms model.

        sensory_input: False removes every synapse onto sensory neurons (any superclass
        containing "sensory"), so they fire only from noise and what you inject. With
        True (the original model), olfactory receptor neurons excite each other into a
        runaway loop and sit near maximum rate at rest, so odours add nothing.

        refractory: seconds a neuron is held at 0 after it spikes (0 = none; at 20 ms
        steps the step itself already caps rates at 50 Hz)."""
        device = device or os.environ.get("FLY_DEVICE", "cpu")
        if device == "auto":
            device = "cuda" if cuda_available() else "cpu"
        if device not in ("cpu", "cuda"):
            raise ValueError(f"device must be cpu, cuda or auto, not {device!r}")
        self.device = device
        self.batch = int(batch)
        if dt is not None:
            self.dt = float(dt)
        self.tonic = type(self).tonic * (1 - np.exp(-self.dt / self.tau)) / (1 - np.exp(-0.020 / self.tau))
        self.refractory_steps = int(round(refractory / self.dt))
        self.sensory_input = sensory_input
        data = ensure_data(data)
        meta = np.load(data / "brain.npz")
        W = sparse.load_npz(data / "weights.npz")
        if not sensory_input:
            if "superclass" not in meta.files:
                raise RuntimeError("brain.npz has no superclass; run `flybrain build`")
            sensory = np.char.find(meta["superclass"].astype(str), "sensory") >= 0
            W = sparse.diags((~sensory).astype(np.float32)) @ W.tocsr()   # rows = postsynaptic
        # The row mask above can leave a valid CSR matrix with unsorted column indices.
        # CuPy/cuSPARSE may canonicalise such a matrix in place during the first sparse
        # product, which silently moves any offsets into _W.indices/_W.data that callers
        # cached before it (e.g. to apply plasticity to chosen synapses).  Canonicalise here,
        # before the matrix is uploaded, so the GPU copy never changes layout.
        W = W.tocsr()
        W.sum_duplicates()
        W.sort_indices()
        if device == "cuda":
            import cupy
            from cupyx.scipy import sparse as cusparse
            self.xp = cupy
            self._W = cusparse.csr_matrix(W.tocsr().astype(np.float32))  # rows = postsynaptic
        else:
            self.xp = np
        W = W.tocsc()
        self.n = W.shape[0]
        self.indptr, self.indices, self.weights = W.indptr, W.indices, W.data
        self.visual = meta["visual"]
        self.azimuth = meta["azimuth"]  # -1 far left ... +1 far right
        self.cell_type = meta["cell_type"]
        self.side = meta["side"]
        self.positions = meta["positions"] if "positions" in meta.files else None
        self.superclass = meta["superclass"] if "superclass" in meta.files else None
        self.groups = {k.removeprefix("group_"): meta[k] for k in meta.files if k.startswith("group_")}
        self._visual = self.xp.asarray(self.visual)
        self.decay = np.float32(np.exp(-self.dt / self.tau))
        self.reset(seed)

    def reset(self, seed: int | None = None) -> None:
        """Silence the network (all voltages 0, no spikes) and restart the noise."""
        xp = self.xp
        self.rng = xp.random.default_rng(seed)
        self.v = xp.zeros((self.n, self.batch), xp.float32)
        self.fired = xp.empty(0, xp.int64)   # flat indices into v
        self.steps = 0
        # step of each neuron's last spike, for the refractory period
        self.last_spike = xp.full((self.n, self.batch), -10**6, xp.int32) if self.refractory_steps else None

    def cells(self, types: list[str], side: str | None = None) -> np.ndarray:
        """Neurons whose cell type is in `types`. A superclass name
        ("descending_neuron", "visual_projection", ...) selects the whole class."""
        mask = np.isin(self.cell_type, types)
        if self.superclass is not None:
            mask |= np.isin(self.superclass, types)
        if side:
            mask &= self.side == side
        return np.flatnonzero(mask)

    def _amount(self, amount):
        """A number, or one value per fly, shaped to broadcast over v[idx]."""
        a = self.xp.asarray(amount, dtype=self.xp.float32)
        return a if a.ndim == 0 else a.reshape(1, -1)

    def stimulate(self, idx: np.ndarray, amount) -> None:
        """Add voltage to these neurons right now (before the next step)."""
        self.v[self.xp.asarray(idx)] += self._amount(amount)

    def synaptic_input(self, fired):
        """Input current (n, batch) from the flat spike indices of the last step."""
        xp, B = self.xp, self.batch
        if self.device == "cuda":
            spikes = xp.zeros((self.n, B), xp.float32)
            spikes.ravel()[fired] = 1.0
            if B == 1:
                return (self._W @ spikes[:, 0])[:, None]
            return self._W @ spikes
        rows, cols = np.divmod(fired, B)
        return np.column_stack([_propagate(self.indptr, self.indices, self.weights, rows[cols == b], self.n)
                                for b in range(B)])

    def step(self, eye_drive: np.ndarray | None = None, inject=()):
        """Advance one step (dt, 20 ms by default). eye_drive: 0..1 per photoreceptor (len(self.visual)), or
        (len(self.visual), batch); inject: (neuron indices, extra voltage) pairs
        added this step. Returns the indices of the neurons that fired (NumPy):
        one array with batch 1, else a list with one array per fly."""
        xp, B = self.xp, self.batch
        current = self.synaptic_input(self.fired) * self.gain
        self.v *= self.decay
        self.v += current + self.tonic
        self.v += (self.rng.random((self.n, B)) < self.noise_hz * self.dt) * np.float32(self.noise_amp)
        if eye_drive is not None:
            drive = xp.asarray(eye_drive, dtype=xp.float32)
            self.v[self._visual] += (drive[:, None] if drive.ndim == 1 else drive) * self.eye_gain
        for idx, amount in inject:
            self.v[xp.asarray(idx)] += self._amount(amount)
        if self.refractory_steps:
            self.v[(self.steps - self.last_spike) <= self.refractory_steps] = 0.0
        fired = xp.flatnonzero(self.v >= 1.0)
        self.v.ravel()[fired] = 0.0
        if self.refractory_steps:
            self.last_spike.ravel()[fired] = self.steps
        self.fired = fired
        self.steps += 1
        flat = fired if xp is np else fired.get()
        if B == 1:
            return flat
        rows, cols = np.divmod(flat, B)
        order = np.argsort(cols, kind="stable")
        return np.split(rows[order], np.cumsum(np.bincount(cols, minlength=B))[:-1])
