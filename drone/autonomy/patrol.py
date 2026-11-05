"""Which ground to cover, in what order, and where it got to: so after a charge it carries on where it stopped."""
from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np


class Route(ABC):
    @abstractmethod
    def goal(self) -> np.ndarray | None:
        """The current waypoint (home frame, m), or None when the route is done."""

    @abstractmethod
    def advance(self, here: np.ndarray, reach: float) -> None:
        """Move on to the next waypoint once within `reach` m of this one."""

    @property
    @abstractmethod
    def progress(self) -> float:
        """0..1 of the route flown."""


class Lawnmower(Route):
    """Back-and-forth rows over a rectangle, rows `swath` apart (the camera's footprint width, minus overlap).
    loop=True starts over when done, for a standing patrol."""

    def __init__(self, x0: float, y0: float, x1: float, y1: float, swath: float, loop: bool = True, step: float = 4.0):
        pts = []
        ys = np.arange(min(y0, y1) + swath / 2, max(y0, y1), swath)
        for i, y in enumerate(ys):
            xs = np.arange(x0, x1 + 1e-6, step) if x1 > x0 else np.arange(x0, x1 - 1e-6, -step)
            xs = np.append(xs, x1) if abs(xs[-1] - x1) > 1e-6 else xs
            if i % 2:
                xs = xs[::-1]
            pts += [np.array([x, y]) for x in xs]
        self.points = pts
        self.i = 0
        self.loop = loop
        self.laps = 0

    def goal(self) -> np.ndarray | None:
        return None if self.i >= len(self.points) else self.points[self.i]

    def advance(self, here: np.ndarray, reach: float) -> None:
        g = self.goal()
        if g is not None and np.hypot(*(g - here)) < reach:
            self.i += 1
            if self.i >= len(self.points) and self.loop:
                self.i, self.laps = 0, self.laps + 1

    @property
    def progress(self) -> float:
        return self.laps + self.i / len(self.points)

    def remaining_length(self, here: np.ndarray) -> float:
        g = self.goal()
        if g is None:
            return 0.0
        rest = self.points[self.i:]
        return float(np.hypot(*(g - here)) + sum(np.hypot(*(b - a)) for a, b in zip(rest, rest[1:])))
