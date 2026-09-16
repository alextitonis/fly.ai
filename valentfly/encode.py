"""Maps the 5 candidate seats onto 5 disjoint, real MaleCNS neuron populations.

Picked from the connectome's named olfactory receptor neuron types (`ORN_*`,
one per antennal-lobe glomerulus -- e.g. `ORN_DA1`, `ORN_VA1v`) -- flies
really do use smell in mate choice, which is the only reason this particular
pick is thematically apt. Falls back to the broader `*sensory*` superclasses
if a build doesn't have named ORN types.

Candidates are also matched by POPULATION SIZE (closest to the candidate
pool's median neuron count, tie-broken by sorted name for determinism): an
early version of this picked types with wildly different sizes (down to one
neuron with no identified type at all), and the biggest population won
essentially every season regardless of compatibility -- more neurons means
more spikes reaching the descending-neuron readout no matter what they're
being told. Matching sizes doesn't eliminate every difference in how
strongly a type talks to the descending neurons, but it removes the most
obvious confound.

This is a MADE-UP assignment for a demo, same caveat this repo already gives
its other encoders (see `world/README.md`'s "not the real connectome"):
nothing here claims these are the neurons a real fly uses to judge a mate.
"""
from __future__ import annotations

import numpy as np

MIN_POPULATION = 10  # skip vanishingly small / noisy types


def _sized_types(brain, keep) -> list[tuple[str, int]]:
    """[(cell_type, neuron_count)] for every distinct, non-empty type `keep` accepts."""
    ct = brain.cell_type.astype(str)
    uniq, counts = np.unique(ct, return_counts=True)
    return [(u, int(c)) for u, c in zip(uniq, counts)
            if u and c >= MIN_POPULATION and keep(u)]


def _closest_to_median(sized: list[tuple[str, int]], n_seats: int) -> list[str]:
    sizes = np.array([c for _, c in sized])
    median = np.median(sizes)
    ranked = sorted(sized, key=lambda t: (abs(t[1] - median), t[0]))
    return sorted(name for name, _ in ranked[:n_seats])


def pick_seat_types(brain, n_seats: int) -> list[str]:
    sized = _sized_types(brain, lambda t: t.startswith("ORN_"))
    if len(sized) < n_seats and brain.superclass is not None:
        sup = brain.superclass.astype(str)
        sensory_types = set(np.unique(brain.cell_type.astype(str)[np.char.find(sup, "sensory") >= 0]))
        sized = _sized_types(brain, lambda t: t in sensory_types)
    if len(sized) < n_seats:
        sized = _sized_types(brain, lambda _t: True)
    if len(sized) < n_seats:
        raise RuntimeError(f"connectome build has only {len(sized)} usable cell types, need {n_seats}")
    return _closest_to_median(sized, n_seats)


class Encoder:
    """One dedicated real neuron population per candidate seat."""

    def __init__(self, brain, n_seats: int):
        self.types = pick_seat_types(brain, n_seats)
        self.idx = [brain.cells([t]) for t in self.types]

    def stimulate(self, seat: int, strength: float):
        """(neuron indices, amount) pair for `FlyBrain.step(inject=...)`."""
        return self.idx[seat], strength
