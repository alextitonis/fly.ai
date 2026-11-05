"""When to head home: enough charge to fly back from here, plus a reserve to find the pad and land."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class EnergyPolicy:
    flight_time: float          # s of flight on a full battery (Crazyflie ~420, a 5-inch quad ~900-1500)
    cruise: float               # m/s home
    reserve: float = 0.10       # of a full battery, always kept back for landing and the unexpected
    margin: float = 1.4         # x the straight-line time home: wind, detours, a missed pad
    resume_at: float = 0.95     # charge to this before going out again

    def needed(self, distance_home: float, height: float = 0.0, sigma: float = 0.0) -> float:
        """Battery fraction needed to get home from here and land. Uncertainty adds a search for the pad."""
        seconds = self.margin * (distance_home + 2 * sigma) / self.cruise + height / 0.5
        return self.reserve + seconds / self.flight_time

    def must_return(self, level: float, distance_home: float, height: float = 0.0, sigma: float = 0.0) -> bool:
        return level <= self.needed(distance_home, height, sigma)
