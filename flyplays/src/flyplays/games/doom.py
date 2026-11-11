"""Doom: the fly plays Freedoom (the free Doom-engine game) through ViZDoom, headless and silent.
Needs `pip install "flyplays[doom]"` (ViZDoom ships Freedoom, nothing else to download).

The fly sees nearly all the way round: every monster that isn't in the blind spot straight behind is a
`creature` on its side (LC10a while in view, LPLC2 as it comes closer, LC4 when it's close), fireballs are
`shot`s (LPLC1). Out: left-minus-right steering turns the player; a burst on the escape neurons - in a real fly,
the escape jump - pulls the trigger and backs away from that side. Every shot is the fly trying to get away.

Levels: "center" (ViZDoom's arena: monsters come from all sides, turn and shoot), "corridor",
"map01" (Freedoom: Phase 2), "e1m1" (Freedoom: Phase 1).
"""
from __future__ import annotations

import os

import numpy as np

from ..fly import Decision, Thing
from ..game import Game, State

MONSTERS = {"Zombieman", "ShotgunGuy", "ChaingunGuy", "DoomImp", "Demon", "Spectre", "LostSoul", "Cacodemon",
            "HellKnight", "BaronOfHell", "Arachnotron", "PainElemental", "Revenant", "Fatso", "Archvile",
            "Cyberdemon", "SpiderMastermind", "WolfensteinSS", "MarineChainsawVzd", "ZombieMan"}
SHOTS = {"DoomImpBall", "CacodemonBall", "BaronBall", "FatShot", "RevenantTracer", "ArachnotronPlasma",
         "Rocket", "PlasmaBall"}
TIC = 1 / 35


class Doom(Game):
    name = "doom"
    title = "A REAL FLY BRAIN PLAYS DOOM"
    score_name = "kills"
    labels = {"left": "", "right": "", "escape": "BANG!"}
    settings = {"chase": 0.6, "chase_gain": 0.8, "loom_gain": 25.0, "threat": 0.25, "threat_max": 0.8,
                "shot_gain": 25.0, "rate_tau": 0.08, "escape": 90.0}
    dt = 1 / 70      # two brain steps per Doom tic
    TURN = 0.35      # degrees per tic per Hz of right-minus-left steering
    BACK = 6.0       # units per tic backed away while the escape neurons fire (levels you can walk)

    def __init__(self, level: str = "center", skill: int = 3):
        try:
            import vizdoom as vzd
        except ImportError as e:
            raise SystemExit('Doom needs ViZDoom: pip install "flyplays[doom]"') from e
        self.vzd, self.level, self.skill = vzd, level, skill

    def start(self, seed: int) -> None:
        vzd = self.vzd
        vz = os.path.dirname(vzd.__file__)
        scen = os.path.join(vz, "scenarios")
        maps = {"center": (os.path.join(scen, "defend_the_center.wad"), "map01", False, "defend_the_center.cfg"),
                "corridor": (os.path.join(scen, "deadly_corridor.wad"), "map01", True, "deadly_corridor.cfg"),
                "map01": (os.path.join(vz, "freedoom2.wad"), "map01", True, None),
                "e1m1": (os.path.join(vz, "freedoom1.wad"), "e1m1", True, None)}
        if self.level not in maps:
            raise SystemExit(f"unknown level {self.level}; one of {', '.join(maps)}")
        wad, mp, self.can_walk, cfg = maps[self.level]
        g = vzd.DoomGame()
        if cfg:
            g.load_config(os.path.join(scen, cfg))
        (g.set_doom_game_path if "freedoom" in wad else g.set_doom_scenario_path)(wad)
        g.set_doom_map(mp)
        g.set_doom_skill(self.skill)
        g.set_screen_resolution(vzd.ScreenResolution.RES_320X240)
        g.set_screen_format(vzd.ScreenFormat.RGB24)
        g.set_labels_buffer_enabled(True)
        g.set_objects_info_enabled(True)
        g.set_render_hud(True)
        g.set_render_messages(False)
        g.set_window_visible(False)
        g.set_sound_enabled(False)
        g.set_mode(vzd.Mode.PLAYER)
        g.set_episode_timeout(0)
        g.set_seed(seed)
        g.set_available_buttons([vzd.Button.TURN_LEFT_RIGHT_DELTA, vzd.Button.MOVE_FORWARD_BACKWARD_DELTA,
                                 vzd.Button.MOVE_LEFT_RIGHT_DELTA, vzd.Button.ATTACK])
        g.set_available_game_variables([vzd.GameVariable.HEALTH, vzd.GameVariable.KILLCOUNT, vzd.GameVariable.DEAD,
                                        vzd.GameVariable.POSITION_X, vzd.GameVariable.POSITION_Y,
                                        vzd.GameVariable.ANGLE])
        g.init()
        g.new_episode()
        self.g = g
        self.img = np.zeros((240, 320, 3), np.uint8)
        self.things: list[Thing] = []
        self.kills, self.dead, self.clock = 0, False, 0.0
        self.action = [0.0, 0.0, 0.0, 0.0]
        self._read()

    def _read(self) -> None:
        s = self.g.get_state()
        if s is None:
            return
        self.img = s.screen_buffer
        hp, k, dead, px, py, ang = s.game_variables
        self.kills, self.dead = int(k), bool(dead)
        things = []
        for o in s.objects:
            shot = o.name in SHOTS
            if o.name not in MONSTERS and not shot:
                continue
            dx, dy = o.position_x - px, o.position_y - py
            dist = max(16.0, float(np.hypot(dx, dy)))
            rel = -((np.degrees(np.arctan2(dy, dx)) - ang + 180) % 360 - 180)   # + = to the player's right
            if abs(rel) > 165:                                                  # the fly's blind spot
                continue
            height = 16.0 if shot else 56.0
            things.append(Thing(float(np.radians(rel)), 2 * float(np.arctan(height / 2 / dist)),
                                "shot" if shot else "creature", int(o.id)))
        self.things = things

    def tick(self, seconds: float) -> State:
        self.clock += seconds
        while self.clock >= TIC and not self.dead:
            self.clock -= TIC
            self.g.make_action(self.action, 1)
            if self.g.is_episode_finished():
                self.dead = True
                break
            self._read()
        return State(not self.dead, self.kills)

    def sense(self):
        return self.things

    def act(self, d: Decision) -> None:
        back = self.BACK if (d.escape and self.can_walk) else 0.0
        away = (1.0 if d.escape_side == "L" else -1.0) * back          # scared on the left -> step right
        self.action = [self.TURN * d.turn_hz, -back, away, float(d.escape)]

    def frame(self) -> np.ndarray:
        return self.img

    def close(self) -> None:
        try:
            self.g.close()
        except Exception:
            pass
