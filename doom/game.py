"""Freedoom through ViZDoom, headless and silent. One `step` = one Doom tic (1/35 s)."""
from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
import vizdoom as vzd

VZ = os.path.dirname(vzd.__file__)
SCEN = os.path.join(VZ, "scenarios")

# Things that can hurt you. Anything else in the labels buffer (items, blood, the player) is scenery.
MONSTERS = {"Zombieman", "ShotgunGuy", "ChaingunGuy", "DoomImp", "Demon", "Spectre", "LostSoul", "Cacodemon",
            "HellKnight", "BaronOfHell", "Arachnotron", "PainElemental", "Revenant", "Fatso", "Archvile",
            "Cyberdemon", "SpiderMastermind", "WolfensteinSS", "MarineChainsawVzd", "ZombieMan"}
SHOTS = {"DoomImpBall", "CacodemonBall", "BaronBall", "FatShot", "RevenantTracer", "ArachnotronPlasma",
         "Rocket", "PlasmaBall"}

MAPS = {
    # name: (wad, map, can_walk)
    "center": (os.path.join(SCEN, "defend_the_center.wad"), "map01", False),   # ViZDoom arena: turn + shoot
    "corridor": (os.path.join(SCEN, "deadly_corridor.wad"), "map01", True),
    "map01": (os.path.join(VZ, "freedoom2.wad"), "map01", True),               # Freedoom: Phase 2, level 1
    "e1m1": (os.path.join(VZ, "freedoom1.wad"), "e1m1", True),
}


@dataclass
class Thing:
    name: str
    bearing: float   # radians from straight ahead, + = right (the fly's eyes cover about +-165 degrees)
    size: float      # angular height, radians
    key: int         # stable id across tics
    shot: bool
    on_screen: bool


class Doom:
    FOV = np.radians(90.0)

    def __init__(self, level: str = "center", seed: int = 1, skill: int = 3, panorama: bool = True):
        self.panorama = panorama   # False: only monsters on the Doom screen (walls hide the rest)
        wad, mp, self.can_walk = MAPS[level]
        g = vzd.DoomGame()
        if level in ("center", "corridor"):
            g.load_config(os.path.join(SCEN, "defend_the_center.cfg" if level == "center" else "deadly_corridor.cfg"))
            g.set_available_buttons([])
        if "freedoom" in wad:
            g.set_doom_game_path(wad)
        else:
            g.set_doom_scenario_path(wad)
        g.set_doom_map(mp)
        g.set_doom_skill(skill)
        g.set_screen_resolution(vzd.ScreenResolution.RES_320X240)
        g.set_screen_format(vzd.ScreenFormat.RGB24)
        g.set_labels_buffer_enabled(True)
        g.set_objects_info_enabled(True)
        g.set_render_hud(True)
        g.set_render_weapon(True)
        g.set_render_messages(False)
        g.set_window_visible(False)
        g.set_sound_enabled(False)
        g.set_mode(vzd.Mode.PLAYER)
        g.set_episode_timeout(0)
        g.set_living_reward(0)
        g.set_seed(seed)
        self.buttons = [vzd.Button.TURN_LEFT_RIGHT_DELTA, vzd.Button.MOVE_FORWARD_BACKWARD_DELTA,
                        vzd.Button.MOVE_LEFT_RIGHT_DELTA, vzd.Button.ATTACK]
        g.set_available_buttons(self.buttons)
        g.set_available_game_variables([vzd.GameVariable.HEALTH, vzd.GameVariable.KILLCOUNT,
                                        vzd.GameVariable.AMMO2, vzd.GameVariable.DEAD,
                                        vzd.GameVariable.POSITION_X, vzd.GameVariable.POSITION_Y,
                                        vzd.GameVariable.ANGLE])
        g.init()
        self.g = g
        self.g.new_episode()
        self.frame = np.zeros((240, 320, 3), np.uint8)
        self.things: list[Thing] = []
        self.health, self.kills, self.ammo, self.dead = 100, 0, 0, False
        self._read()

    def _read(self):
        s = self.g.get_state()
        if s is None:
            return
        self.frame = s.screen_buffer
        H, W = self.frame.shape[:2]
        hp, k, ammo, dead, px, py, ang = s.game_variables
        self.health, self.kills, self.ammo, self.dead = int(hp), int(k), int(ammo), bool(dead)
        on_screen = {lab.object_id for lab in s.labels}
        things = []
        for o in s.objects:
            shot = o.name in SHOTS
            if o.name not in MONSTERS and not shot:
                continue
            dx, dy = o.position_x - px, o.position_y - py
            dist = max(16.0, float(np.hypot(dx, dy)))
            # Doom angles run counter-clockwise; flip so + = to the player's right
            rel = -((np.degrees(np.arctan2(dy, dx)) - ang + 180) % 360 - 180)
            if abs(rel) > 165:                     # the small blind spot straight behind a fly
                continue
            height = 16.0 if shot else 56.0
            things.append(Thing(o.name, float(np.radians(rel)), 2 * float(np.arctan(height / 2 / dist)), int(o.id),
                                shot, int(o.id) in on_screen))
        self.things = things if self.panorama else [t for t in things if t.on_screen]

    def step(self, turn_deg: float = 0.0, walk: float = 0.0, strafe: float = 0.0, attack: bool = False):
        """turn_deg + = right; walk + = forward (units/tic); strafe + = right."""
        if not self.can_walk:
            walk = strafe = 0.0
        self.g.make_action([float(turn_deg), float(walk), float(strafe), float(attack)], 1)
        if self.g.is_episode_finished():
            self.dead = self.dead or self.g.is_player_dead()
            return False
        self._read()
        return not self.dead

    def close(self):
        self.g.close()
