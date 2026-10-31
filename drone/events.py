"""Hooks: run your own code when the drone notices something, without touching the flight loop.

    bus = Events()
    bus.on("new_colour", lambda e: print("never seen this", e.data["hue"]))
    bus.on("*", log.append)                    # everything
    bus.emit("target_lost", t=12.3, bearing=0.4)

Events the drone scripts send:
  new_colour      a colour the fly wasn't trained on            {hue, bearing, value, familiar}
  trained_colour  a colour it was rewarded for                  {hue, bearing, value, familiar}
  avoid_colour    a colour it was punished for                  {hue, bearing, value, familiar}
  target_lost     the target left every camera                  {bearing}
  target_found    back in view after being lost                 {bearing, lost_for, predicted, error}
  obstacle_ahead  a pillar close ahead, from the picture alone  {bearing, distance}
  crash           the drone hit something or left the arena     {}

An event says what the camera and brain reported, so it can be wrong: nothing here checks it against the simulator.
A hook that raises is reported once and switched off, so it can't bring the drone down mid-flight.
"""
from __future__ import annotations

import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Event:
    name: str
    t: float = 0.0
    data: dict = field(default_factory=dict)


class Events:
    def __init__(self, cooldown: float = 0.0):
        self.hooks: dict[str, list[Callable]] = defaultdict(list)
        self.cooldown = cooldown               # seconds before the same event and key can fire again
        self.last: dict[tuple, float] = {}
        self.counts: dict[str, int] = defaultdict(int)

    def on(self, name: str, hook: Callable) -> Callable:
        """Call hook(event) on this event; "*" means all of them. Returns the hook, so off() can take it back."""
        self.hooks[name].append(hook)
        return hook

    def off(self, name: str, hook: Callable) -> None:
        if hook in self.hooks[name]:
            self.hooks[name].remove(hook)

    def emit(self, name: str, t: float = 0.0, key=None, **data) -> bool:
        """Send an event. With a key, repeats inside the cooldown are dropped (a colour is seen on every look). True if sent."""
        if key is not None:
            if t - self.last.get((name, key), -1e9) < self.cooldown:
                return False
            self.last[(name, key)] = t
        self.counts[name] += 1
        event = Event(name, t, data)
        for wanted in (name, "*"):
            for hook in list(self.hooks[wanted]):
                try:
                    hook(event)
                except Exception as err:                # a broken hook must not stop the flight
                    print(f"hook {getattr(hook, '__name__', hook)} on {name} failed and is off: {err!r}", file=sys.stderr)
                    self.off(wanted, hook)
        return True
