"""Latitude/longitude <-> the home frame (metres east, north, up of the dock). For real GPS; the sim works in metres already."""
from __future__ import annotations

import numpy as np

R_EARTH = 6_378_137.0   # m, WGS-84 equatorial radius


class HomeFrame:
    """Flat-earth (equirectangular) projection around home: under 1 cm of error per km for a patrol a few km across."""

    def __init__(self, lat: float, lon: float, alt: float = 0.0):
        self.lat0, self.lon0, self.alt0 = float(lat), float(lon), float(alt)
        self.k = np.cos(np.radians(self.lat0))

    def to_local(self, lat: float, lon: float, alt: float | None = None) -> tuple[float, float, float]:
        x = np.radians(lon - self.lon0) * R_EARTH * self.k
        y = np.radians(lat - self.lat0) * R_EARTH
        return float(x), float(y), float((alt if alt is not None else self.alt0) - self.alt0)

    def to_latlon(self, x: float, y: float, z: float = 0.0) -> tuple[float, float, float]:
        lat = self.lat0 + np.degrees(y / R_EARTH)
        lon = self.lon0 + np.degrees(x / (R_EARTH * self.k))
        return float(lat), float(lon), float(self.alt0 + z)
