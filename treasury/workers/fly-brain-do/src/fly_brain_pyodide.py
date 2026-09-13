"""Pyodide-compatible FlyBrain — pure numpy implementation of the LIF connectome.

This is a faithful port of flycoinrh/fly_brain.py (MIT, alextitonis/fly.ai) that
replaces numba JIT with pure numpy and scipy.sparse with manual CSR operations.
The dynamics are identical:
    v <- exp(-dt/tau) v + gain * W @ spikes + tonic + noise + eye input
    v >= 1 -> spike, reset to 0

The connectome data is loaded from R2 as numpy arrays (indptr, indices, data)
which were extracted from the original scipy sparse matrix and pruned to fit
within the 128MB Durable Object memory limit.
"""
from __future__ import annotations

import numpy as np


class FlyBrain:
    """Pure-numpy LIF simulation of the MaleCNS connectome.

    Same API as flycoinrh.FlyBrain but without numba/scipy dependencies.
    Loads weights from numpy arrays (indptr, indices, data) instead of scipy.sparse.

    Parameters:
        weights_npz: numpy .npz file with indptr, indices, data, shape arrays
        meta_npz: numpy .npz file with visual, azimuth, cell_type, side, groups
        seed: random seed for noise
    """

    dt = 0.020      # 20ms timestep
    tau = 0.100     # 100ms membrane time constant
    gain = 3.0      # synaptic gain
    tonic = 0.14    # tonic drive
    noise_hz = 1.2  # noise rate
    noise_amp = 0.22  # noise amplitude
    eye_gain = 0.62   # visual input gain

    def __init__(self, weights_npz: str, meta_npz: str, seed: int = 64):
        # Load connectome weights from numpy format (no scipy needed)
        w = np.load(weights_npz)
        self.indptr = w["indptr"]
        self.indices = w["indices"]
        self.data = w["data"].astype(np.float32)  # stored as float16, upcast for computation
        shape = w["shape"]
        self.n = int(shape[0])

        # Load metadata — supports both raw string arrays (full brain.npz)
        # and integer-indexed format (slimmed for R2 memory limits)
        meta = np.load(meta_npz)
        self.visual = meta["visual"]
        self.azimuth = meta["azimuth"]
        if "cell_type_idx" in meta.files:
            # Slimmed integer-indexed format: keep as integers for speed
            # (decoding 166,700 strings is too slow for the 30s CPU limit)
            self._cell_type_idx = meta["cell_type_idx"]
            self._cell_type_names = meta["cell_type_names"]
            self._side_idx = meta["side_idx"]
            self._side_names = meta["side_names"]
            self._superclass_idx = meta["superclass_idx"]
            self._superclass_names = meta["superclass_names"]
            # Build lookup dicts for fast type→index resolution
            self._ct_lookup = {name: i for i, name in enumerate(self._cell_type_names)}
            self._sc_lookup = {name: i for i, name in enumerate(self._superclass_names)}
            self._side_lookup = {name: i for i, name in enumerate(self._side_names)}
            # Expose string arrays for compatibility (lazy, only if accessed)
            self.cell_type = None  # Will be built lazily if needed
            self.side = None
            self.superclass = None
        else:
            # Full format with raw string arrays
            self._cell_type_idx = None
            self.cell_type = meta["cell_type"] if "cell_type" in meta.files else np.array([], dtype=str)
            self.side = meta["side"] if "side" in meta.files else np.array([], dtype=str)
            self.superclass = meta["superclass"] if "superclass" in meta.files else None
        self.positions = meta["positions"] if "positions" in meta.files else None
        self.groups = {k.removeprefix("group_"): meta[k] for k in meta.files if k.startswith("group_")}

        self._visual = self.visual
        self.decay = np.float32(np.exp(-self.dt / self.tau))
        self.device = "cpu"
        self.batch = 1
        self.reset(seed)

    def reset(self, seed: int | None = None) -> None:
        """Silence the network (all voltages 0, no spikes) and restart noise."""
        self.rng = np.random.default_rng(seed)
        self.v = np.zeros(self.n, dtype=np.float32)
        self.fired = np.empty(0, dtype=np.int64)
        self.steps = 0

    def cells(self, types: list[str], side: str | None = None) -> np.ndarray:
        if self._cell_type_idx is not None:
            # Integer-indexed format: use fast integer lookups
            type_indices = [self._ct_lookup[t] for t in types if t in self._ct_lookup]
            if type_indices:
                mask = np.isin(self._cell_type_idx, type_indices)
            elif self._superclass_idx is not None:
                # Not found in cell_type — try superclass (e.g. "descending_neuron")
                sc_indices = [self._sc_lookup[t] for t in types if t in self._sc_lookup]
                if not sc_indices:
                    return np.array([], dtype=np.int64)
                mask = np.isin(self._superclass_idx, sc_indices)
            else:
                return np.array([], dtype=np.int64)
            if side and side in self._side_lookup:
                mask &= self._side_idx == self._side_lookup[side]
            return np.flatnonzero(mask)
        else:
            # Full string array format
            mask = np.isin(self.cell_type, types)
            if not mask.any() and self.superclass is not None:
                # Not found in cell_type — try superclass
                mask = np.isin(self.superclass, types)
            if side:
                mask &= self.side == side
            return np.flatnonzero(mask)

    def stimulate(self, idx: np.ndarray, amount) -> None:
        """Add voltage to these neurons right now (before the next step)."""
        self.v[np.asarray(idx)] += np.float32(amount)

    def _propagate(self, fired: np.ndarray) -> np.ndarray:
        """Sum outgoing weights of spiked neurons — pure numpy CSR multiply.

        This replaces numba.njit with a vectorized numpy scatter-add.
        For each spiked neuron j, we add weights[indptr[j]:indptr[j+1]]
        to current[indices[indptr[j]:indptr[j+1]]].
        """
        current = np.zeros(self.n, dtype=np.float32)
        if len(fired) == 0:
            return current

        # Build segment boundaries for each spiked neuron
        starts = self.indptr[fired]
        ends = self.indptr[fired + 1]

        # Concatenate all weight slices
        lengths = ends - starts
        seg_offsets = np.repeat(np.arange(len(fired)), lengths)
        all_indices = np.concatenate([self.indices[s:e] for s, e in zip(starts, ends)])
        all_weights = np.concatenate([self.data[s:e] for s, e in zip(starts, ends)])

        # Scatter-add: accumulate weights into current at target indices
        np.add.at(current, all_indices, all_weights)
        return current

    def synaptic_input(self, fired: np.ndarray) -> np.ndarray:
        """Input current from the flat spike indices of the last step."""
        return self._propagate(fired)

    def step(self, eye_drive: np.ndarray | None = None, inject=()) -> np.ndarray:
        """Advance 20ms. Returns indices of neurons that fired."""
        # Synaptic input from last step's spikes
        current = self.synaptic_input(self.fired) * np.float32(self.gain)

        # Membrane decay
        self.v *= self.decay
        self.v += current + np.float32(self.tonic)

        # Poisson noise
        noise_mask = self.rng.random(self.n) < (self.noise_hz * self.dt)
        self.v[noise_mask] += np.float32(self.noise_amp)

        # Visual input
        if eye_drive is not None:
            drive = np.asarray(eye_drive, dtype=np.float32)
            self.v[self._visual] += drive * np.float32(self.eye_gain)

        # Injected currents
        for idx, amount in inject:
            self.v[np.asarray(idx)] += np.float32(amount)

        # Threshold and reset
        fired = np.flatnonzero(self.v >= 1.0)
        self.v[fired] = 0.0
        self.fired = fired
        self.steps += 1
        return fired
