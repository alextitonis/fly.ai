"""Let the MaleCNS fly brain play SSH Fighter (https://sshfighter.com) as a bot.

Loop, 30 times a second:
    game state -> fly eyes (opponent + hostile projectiles as dark shapes)
    -> 166,700-neuron connectome simulation (50 steps/s)
    -> descending neurons -> button presses

The brain is never trained. The decoder is hand-written: it counts spikes of
a few identified descending neurons in short windows.

    python fly_fighter.py --offline                 # fake opponent, no network
    python fly_fighter.py --user FLYBRAIN --identity ~/.ssh/sshfighter-flybrain
"""
from __future__ import annotations

import argparse
import json
import gzip
import queue
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # the fly.ai core lives one level up
from fly_brain import FlyBrain
from fly_eyes import Eyes, FeatureDetectors, blob_for
from reservoir import EXPLORE_P, MOVE_EXPLORE, MOVE_HOLD, Featurizer, Readout, Recorder

STEER_WINDOW = 25     # brain steps (0.5 s) for comparing left vs right DNa02
STEER_MARGIN = 2      # spikes more on one side needed to walk that way
JUMP_WINDOW = 5       # brain steps (0.1 s); DNp01 fires ~1/s at rest
JUMP_SPIKES = 2
COOLDOWN = {"jump": 0.8, "punch": 0.3, "kick": 0.4}
# While recording, jumps are random (labels for a dodge readout): per actionable grounded
# frame, more often when a hostile projectile is within JUMP_NEAR world units.
EXPLORE_JUMP, EXPLORE_JUMP_NEAR, JUMP_NEAR = 0.01, 0.08, 60.0
LOGS = Path(__file__).resolve().parent / "logs"


class Decoder:
    """Descending-neuron spikes -> SSH Fighter input.

    These neurons fire only ~1 spike/s at rest, so decisions use raw spike
    counts in short windows with hand-picked thresholds. (Comparing each neuron
    to its own running average doesn't work: a target that stays on one side
    becomes the new "normal" and the turn signal cancels itself.)

    With several flies, each fly decides with exactly these rules and the flies
    vote: the most common move wins (ties -> stand still), and an action fires
    only if at least half of them want it. With one fly this is the plain rule.
    (Averaging spike counts instead breaks the thresholds: e.g. MDN's resting
    ~1 Hz beats DNg100's ~0 in almost every window, so the average backs off.)
    """

    def __init__(self, groups: dict[str, np.ndarray], n: int):
        self.names = list(groups)
        self.col = {g: i for i, g in enumerate(self.names)}
        self.groups = groups
        self.history = deque(maxlen=STEER_WINDOW)   # per step: (flies, groups) spike counts
        self.last = {a: -10.0 for a in COOLDOWN}
        self.mask = np.zeros(n, bool)

    def observe(self, flies: list[np.ndarray]) -> None:
        counts = np.zeros((len(flies), len(self.names)))
        for f, fired in enumerate(flies):
            self.mask[:] = False
            self.mask[fired] = True
            for g, idx in self.groups.items():
                counts[f, self.col[g]] = self.mask[idx].sum()
        self.history.append(counts)

    def count(self, *groups: str, window: int = STEER_WINDOW) -> np.ndarray:
        """Spikes of these groups over the last `window` steps, one number per fly."""
        recent = np.sum(list(self.history)[-window:], axis=0)
        return recent[:, [self.col[g] for g in groups]].sum(axis=1)

    def command(self, facing: int, now: float) -> dict:
        c = self.count
        cmd = {"t": "input", "moveX": 0, "motion": "N"}
        turn = c("steer_R") - c("steer_L")
        fwd, back = c("forward_L", "forward_R"), c("backward_L", "backward_R")
        move = np.where(np.abs(turn) >= STEER_MARGIN, np.sign(turn),   # turn right -> walk right on screen
                        np.where(fwd > back, facing,                    # DNg100: walk forward
                                 np.where(back > fwd, -facing, 0)))     # MDN moonwalk: back off (= block)
        options = (0, -1, 1)                                            # first = winner on a tie
        cmd["moveX"] = options[int(np.argmax([(move == m).sum() for m in options]))]
        triggers = {"jump": c("escape_L", "escape_R", window=JUMP_WINDOW) >= JUMP_SPIKES,
                    "punch": c("punch_L", "punch_R", window=1) > 0,
                    "kick": c("kick_L", "kick_R", window=1) > 0}
        for action, wants in triggers.items():
            if wants.mean() >= 0.5 and now - self.last[action] >= COOLDOWN[action]:
                cmd[action] = True
                self.last[action] = now
        return cmd

    def snapshot(self) -> dict[str, float]:
        """Spikes per group over the steering window, averaged over flies."""
        return {g: float(self.count(g).mean()) for g in self.names}


def what_the_fly_sees(state: dict) -> list:
    you, opp = state.get("you"), state.get("opp")
    if state.get("phase") != "fight" or not you or not opp:
        return []
    striking = opp.get("hitboxActive") or opp.get("movePhase") == "active"
    blobs = [blob_for(opp["x"] - you["x"], 30, 1.0 if striking else 0.8)]
    for p in state.get("projectiles") or []:
        if p.get("ownedBy") == "opponent" and p.get("dangerous") is not False and p.get("canHit") is not False:
            blobs.append(blob_for(p["x"] - you["x"], 12, 0.95))
    return blobs


# Projectile radii from the SSH Fighter bot docs; the fly sees the diameter.
PROJECTILE_RADIUS = {"blue": 11, "fire": 11, "sonic": 11, "citation": 11, "knowledge": 8,
                     "mote": 5, "boomerang": 7, "rope": 8}


def detector_inputs(state: dict):
    """-> (opponent (dx, size) or None, hostile projectiles [(key, dx, size)], threat 0..1)."""
    you, opp = state.get("you"), state.get("opp")
    if state.get("phase") != "fight" or not you or not opp:
        return None, [], 0.0
    dx = opp["x"] - you["x"]
    attacking = opp.get("hitboxActive") or opp.get("movePhase") in ("startup", "active")
    threat = float(np.clip((90 - abs(dx)) / 60, 0, 1)) if attacking else 0.0   # full within 30, none beyond 90
    shots = []
    for p in state.get("projectiles") or []:
        if p.get("ownedBy") == "opponent" and p.get("dangerous") is not False and p.get("canHit") is not False:
            size = 2.0 * PROJECTILE_RADIUS.get(p.get("style"), 11)
            shots.append((f"p{p.get('id')}", p["x"] - you["x"], size))
    return (dx, 30.0), shots, threat


class Fly:
    """Keeps the brain running in step with game time (50 brain steps per 30 frames).
    flies > 1 runs that many copies of the brain (same wiring, own noise) that vote."""

    def __init__(self, device: str | None = None, flies: int = 1, seed: int = 64, encoder: dict | None = None):
        print("loading connectome...", flush=True)
        self.brain = FlyBrain(device=device, batch=flies, seed=seed)
        self.eyes = Eyes(self.brain.azimuth)
        self.features = FeatureDetectors(self.brain, **(encoder or {}))
        self.featurizer = Featurizer(self.brain)   # descending-neuron traces for the trained readout
        # Exploration while recording. Attacks and movement are separate so a trained attack
        # readout can play while movement is still randomised for fresh movement labels.
        self.explore_attacks = False
        self.explore_moves = False
        self.readout: Readout | None = None
        self.rng = np.random.default_rng()
        # Movement held for MOVE_HOLD frames: -1 away, 0 still, +1 toward; None = brain's own steering.
        self.move_rel: int | None = None
        self.move_left = 0
        self.move_rel_sent = 0         # what was actually sent, relative to the opponent
        self.move_start_logged = False  # True on the first frame of a random (exploration) hold
        self.decoder = Decoder(self.brain.groups, self.brain.n)
        self.game_time = 0.0
        self.step_ms = 0.0
        self.frame_spikes = np.empty(0, np.int64)   # every neuron that fired during the last game frame
        print(f"brain ready: {self.brain.n:,} neurons, {len(self.brain.indices):,} connections "
              f"on {self.brain.device}" + (f", {flies} flies voting" if flies > 1 else ""), flush=True)
        # Settle spontaneous activity so baselines are meaningful before the first fight.
        for _ in range(250):
            self.decoder.observe(self._flies(self.brain.step(self.eyes.drive([]))))
        self.game_time = self.brain.steps * self.brain.dt   # start the game clock after warm-up

    def _flies(self, fired) -> list[np.ndarray]:
        return fired if isinstance(fired, list) else [fired]

    def react(self, state: dict) -> dict:
        self.game_time += 1 / 30
        self.jump_random = False
        blobs = what_the_fly_sees(state)
        inject = self.features.inject(*detector_inputs(state))
        t = time.perf_counter()
        steps = 0
        fired_this_frame = []
        while self.brain.steps * self.brain.dt < self.game_time and steps < 3:
            flies = self._flies(self.brain.step(self.eyes.drive(blobs), inject))
            self.decoder.observe(flies)
            self.featurizer.observe(flies)
            fired_this_frame.append(flies[0])   # the dashboard shows the first fly
            steps += 1
        self.frame_spikes = np.concatenate(fired_this_frame) if fired_this_frame else np.empty(0, np.int64)
        if self.brain.steps * self.brain.dt < self.game_time - 0.1:   # fell behind: skip ahead
            self.game_time = self.brain.steps * self.brain.dt
        self.step_ms = 0.9 * self.step_ms + 0.1 * (time.perf_counter() - t) * 1000
        you = state.get("you") or {}
        if state.get("phase") != "fight":
            self.move_left = 0
            self.move_rel_sent, self.move_start_logged = 0, False
            return {"t": "input", "moveX": 0, "motion": "N"}
        cmd = self.decoder.command(int(you.get("facing", 1)), self.brain.steps * self.brain.dt)
        if self.explore_attacks or self.readout:
            cmd.pop("punch", None)
            cmd.pop("kick", None)
            if you.get("actionable"):
                if self.explore_attacks:
                    r = self.rng.random()
                    if r < EXPLORE_P["punch"]:
                        cmd["punch"] = True
                    elif r < EXPLORE_P["punch"] + EXPLORE_P["kick"]:
                        cmd["kick"] = True
                else:
                    action = self.readout.choose(self.featurizer.features())
                    if action:
                        cmd[action] = True
        if self.explore_moves:
            cmd.pop("jump", None)
            if you.get("actionable") and not you.get("y"):
                near = any(p.get("ownedBy") == "opponent" and abs(p.get("x", 1e9) - you.get("x", 0)) < JUMP_NEAR
                           for p in state.get("projectiles") or [])
                if self.rng.random() < (EXPLORE_JUMP_NEAR if near else EXPLORE_JUMP):
                    cmd["jump"] = True
                    self.jump_random = True
        opp = state.get("opp") or {}
        toward = 1 if opp.get("x", 0) >= you.get("x", 0) else -1
        self.move_start_logged = False
        if self.explore_moves or (self.readout and self.readout.has_move):
            if self.move_left <= 0:
                self.move_left = MOVE_HOLD
                if self.explore_moves:
                    # half the holds are random moves (labelled for training), half the brain's own steering
                    self.move_rel = int(self.rng.integers(-1, 2)) if self.rng.random() < MOVE_EXPLORE else None
                    self.move_start_logged = self.move_rel is not None
                else:
                    self.move_rel = self.readout.choose_move(self.featurizer.features())
            self.move_left -= 1
            if self.move_rel is not None:
                cmd["moveX"] = self.move_rel * toward
        self.move_rel_sent = cmd["moveX"] * toward
        return cmd


class MatchLog:
    def __init__(self, name: str):
        LOGS.mkdir(exist_ok=True)
        self.file = (LOGS / f"{time.strftime('%Y%m%d-%H%M%S')}-{name}.jsonl").open("w")

    def write(self, state: dict, cmd: dict, fly: Fly) -> None:
        you, opp = state.get("you") or {}, state.get("opp") or {}
        self.file.write(json.dumps({
            "frame": state.get("frame"), "phase": state.get("phase"), "round": state.get("round"),
            "you": [you.get("x"), you.get("y"), you.get("hp")], "opp": [opp.get("x"), opp.get("y"), opp.get("hp")],
            "cmd": {k: v for k, v in cmd.items() if k != "t"},
            "spikes": fly.decoder.snapshot()}) + "\n")

    def close(self):
        self.file.close()


def print_status(state: dict, cmd: dict, fly: Fly) -> None:
    you, opp = state.get("you") or {}, state.get("opp") or {}
    acts = "".join(k[0].upper() for k in ("jump", "punch", "kick") if cmd.get(k))
    move = {-1: "<", 0: "-", 1: ">"}[cmd.get("moveX", 0)]
    s = fly.decoder.snapshot()
    side = "L" if opp.get("x", 0) < you.get("x", 0) else "R"
    print(f"\rR{state.get('round')} hp {you.get('hp', 0):3d} vs {opp.get('hp', 0):3d}  opp {side} {abs(opp.get('x', 0) - you.get('x', 0)):5.1f}"
          f"  move {move} {acts:3s}  DNa02 L{s['steer_L']:4.1f} R{s['steer_R']:4.1f}"
          f"  DNp01 {s['escape_L'] + s['escape_R']:4.1f}  brain {fly.step_ms:4.1f} ms   ", end="", flush=True)


# ---- offline opponent, for testing without the network --------------------------------

def offline(fly: Fly, seconds: float, dash=None) -> None:
    you = {"character": "FLY", "x": 60.0, "y": 0, "facing": 1, "hp": 100}
    opp = {"character": "DUMMY", "x": 180.0, "y": 0, "facing": -1, "hp": 100, "movePhase": "neutral", "hitboxActive": False}
    shots: list[dict] = []
    counts = {"toward": 0, "away": 0, "still": 0, "jump": 0, "jump_near_shot": 0,
              "frames_shot_near": 0, "punch": 0, "kick": 0}
    frames = int(seconds * 30)
    start = time.perf_counter()
    next_id = 0
    for frame in range(frames):
        opp["x"] = float(np.clip(opp["x"] + 1.5 * np.sin(frame / 40), 22, 218))  # dummy wanders
        if frame % 90 == 45:                                   # and fires at the fly every 3 s
            direction = -1.0 if you["x"] < opp["x"] else 1.0
            shots.append({"id": next_id, "x": opp["x"], "vx": 3.0 * direction, "style": "blue",
                          "ownedBy": "opponent", "dangerous": True, "canHit": True})
            next_id += 1
        for s in shots:
            s["x"] += s["vx"]
        shots = [s for s in shots if 22 < s["x"] < 218]
        state = {"t": "state", "frame": frame, "phase": "fight", "round": 1,
                 "you": you, "opp": opp, "projectiles": shots}
        cmd = fly.react(state)
        toward = 1 if opp["x"] > you["x"] else -1
        if cmd["moveX"] == 0:
            counts["still"] += 1
        else:
            counts["toward" if cmd["moveX"] == toward else "away"] += 1
        shot_near = any(abs(s["x"] - you["x"]) < 40 for s in shots)
        counts["frames_shot_near"] += shot_near
        if cmd.get("jump") and shot_near:
            counts["jump_near_shot"] += 1
        you["x"] = float(np.clip(you["x"] + 2.0 * cmd["moveX"], 22, 218))
        you["facing"] = 1 if opp["x"] > you["x"] else -1
        for a in ("jump", "punch", "kick"):
            counts[a] += bool(cmd.get(a))
        if frame % 15 == 0:
            print_status(state, cmd, fly)
        if dash:
            dash.publish(state, cmd, fly)
            # watchable speed: real game time
            time.sleep(max(0.0, start + (frame + 1) / 30 - time.perf_counter()))
    elapsed = time.perf_counter() - start
    print(f"\n{frames} frames in {elapsed:.1f} s ({frames / elapsed:.0f} fps; game needs 30)")
    print("actions:", counts)
    moves = counts["toward"] + counts["away"]
    chance = counts["frames_shot_near"] / frames
    print(f"chasing: {counts['toward'] / max(moves, 1):.0%} of moves go toward the opponent (chance 50%)")
    print(f"dodging: {counts['jump_near_shot'] / max(counts['jump'], 1):.0%} of jumps happen with a shot"
          f" within 40 units (chance {chance:.0%})")


# ---- live play over SSH ---------------------------------------------------------------

def replay(fly: Fly, path: str, dash=None, speed: float = 1.0) -> None:
    """Push a recorded match's states back through the brain, for the dashboard.

    Only matches recorded with --record have the full per-frame state (<mid>.states.jsonl.gz);
    the match logs keep decoder rates, not enough to drive the brain again. The brain re-runs
    from scratch, so the spikes are a fresh run of the same wiring on the same input, not a
    recording of the original ones.
    """
    src = Path(path)
    if src.is_dir():
        found = sorted(src.glob("*.states.jsonl.gz"))
        if not found:
            sys.exit(f"no recorded states in {src}")
        src = found[0]
    mid = src.name.split(".")[0].split("-")[-1]
    print(f"replaying {mid} from {src}")
    if dash:
        dash.set_match(mid, f"{mid} (replay)")
    frames = 0
    opener = (lambda: gzip.open(src, "rt", encoding="utf-8")) if src.suffix == ".gz"         else (lambda: src.open(encoding="utf-8"))
    with opener() as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if "state" in rec:                      # <mid>.states.jsonl.gz: the full game state
                state = rec["state"]
            else:                                   # logs/<stamp>-<mid>.jsonl: positions and HP only
                you, opp = rec.get("you") or [0, 0, 0], rec.get("opp") or [0, 0, 0]
                facing = 1 if opp[0] >= you[0] else -1
                state = {"frame": rec.get("frame"), "phase": rec.get("phase"), "round": rec.get("round"),
                         "you": {"x": you[0], "y": you[1], "hp": you[2], "facing": facing,
                                 "character": "FLY", "actionable": True},
                         "opp": {"x": opp[0], "y": opp[1], "hp": opp[2], "facing": -facing,
                                 "character": "OPPONENT"},
                         "projectiles": []}
            state.setdefault("t", "state")
            cmd = fly.react(state)
            if dash:
                dash.publish(state, cmd, fly)
            frames += 1
            if speed:
                time.sleep(1 / (30 * speed))
    print(f"replayed {frames} frames")


def play(fly: Fly, args, dash=None) -> None:
    cmd = ["ssh", "-T", "-o", "ServerAliveInterval=30"]
    if args.identity:
        cmd += ["-i", str(Path(args.identity).expanduser()), "-o", "IdentitiesOnly=yes"]
    cmd += [f"{args.user}@sshfighter.com", "play"]
    ssh = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
                           encoding="utf-8")
    lines: queue.Queue[str | None] = queue.Queue()

    def reader():
        for line in ssh.stdout:
            lines.put(line)
        lines.put(None)

    threading.Thread(target=reader, daemon=True).start()

    def send(obj: dict) -> None:
        ssh.stdin.write(json.dumps(obj) + "\n")
        ssh.stdin.flush()

    wins = losses = draws = 0
    log: MatchLog | None = None
    rec: Recorder | None = None
    last_sent = time.monotonic()
    requeue_at = None
    try:
        while True:
            if requeue_at and time.monotonic() >= requeue_at:
                send({"t": "queue", "char": args.char, "opponents": args.opponents})
                requeue_at = None
            try:
                line = lines.get(timeout=1.0)
            except queue.Empty:
                if time.monotonic() - last_sent > 60:
                    send({"t": "ping"})
                    last_sent = time.monotonic()
                continue
            if line is None:
                print("\nconnection closed")
                break
            # Only react to the newest state; stale ones are skipped if the brain lags.
            batch = [line]
            while not lines.empty():
                nxt = lines.get_nowait()
                if nxt is None:
                    lines.put(None)
                    break
                batch.append(nxt)
            messages = []
            for raw in batch:
                raw = raw.strip()
                if raw.startswith("{"):
                    try:
                        messages.append(json.loads(raw))
                    except json.JSONDecodeError:
                        pass
            states = [m for m in messages if m.get("t") == "state"]
            for msg in messages:
                t = msg.get("t")
                if t == "welcome":
                    print(f"connected as {msg.get('name')} (elo {msg.get('elo')}), build {msg.get('build')}")
                    send({"t": "queue", "char": args.char, "opponents": args.opponents})
                elif t == "queued":
                    print(f"waiting for an opponent ({msg.get('opponents')}) as {msg.get('char')}...")
                elif t == "matchStart":
                    print(f"\nMATCH vs {msg.get('oppName')} ({msg.get('oppType')}) on {msg.get('stage')}  id {msg.get('mid')}")
                    log = MatchLog(msg.get("mid", "match"))
                    rec = Recorder(args.record, msg.get("mid", "match")) if args.record else None
                    mid = msg.get("mid")
                    # /watch/ only works while the match is running; /matches/ stays afterwards.
                    print(f"watch live: https://sshfighter.com/watch/{mid}")
                    print(f"replay:     https://sshfighter.com/matches/{mid}")
                    if dash:
                        dash.set_match(msg.get("mid"), msg.get("oppName"))
                elif t == "matchEnd":
                    res = msg.get("result") or {}
                    # A round that times out at equal HP is a draw, and a fly that never closes
                    # can draw every round forever; youWon alone has reported those as wins.
                    won = bool(res.get("youWon"))
                    drew = bool(res.get("draw") or res.get("isDraw")
                                or (res.get("youScore") is not None and res.get("youScore") == res.get("oppScore")))
                    wins += won and not drew
                    draws += drew
                    losses += not won and not drew
                    print(f"\nmatch over: {'DRAW' if drew else 'WON' if won else 'lost'}"
                          f"  (record {wins}-{losses}-{draws})  result: {res}")
                    if log:
                        log.close()
                        log = None
                    if rec:
                        rec.save()
                        rec = None
                    if args.matches and wins + losses + draws >= args.matches:
                        send({"t": "leave"})
                        return
                    requeue_at = time.monotonic() + 1.0
                elif t == "error":
                    print(f"\nserver error: {msg}")
            if states:
                for skipped in states[:-1]:          # keep brain time aligned with game time
                    fly.game_time += 1 / 30
                state = states[-1]
                out = fly.react(state)
                send(out)
                last_sent = time.monotonic()
                if log:
                    log.write(state, out, fly)
                if rec:
                    rec.add(state, out, fly.featurizer.features(), fly.move_rel_sent, fly.move_start_logged,
                            fly.jump_random)
                if dash:
                    dash.publish(state, out, fly)
                if state.get("frame", 0) % 10 == 0:
                    print_status(state, out, fly)
    except KeyboardInterrupt:
        print("\nstopping...")
        try:
            send({"t": "leave"})
        except OSError:
            pass
    finally:
        if log:
            log.close()
        if rec:
            rec.save()   # keep a partial match too
        ssh.terminate()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--offline", action="store_true", help="play a fake opponent locally")
    p.add_argument("--replay", help="watch a match again through the brain: a recorded "
                                    "<mid>.states.jsonl.gz, a recordings folder, or a "
                                    "logs/<stamp>-<mid>.jsonl match log; use with --dashboard")
    p.add_argument("--speed", type=float, default=1.0, help="replay speed multiplier")
    p.add_argument("--seconds", type=float, default=20)
    p.add_argument("--user", help="bot handle on sshfighter.com")
    p.add_argument("--identity", help="the bot's own SSH private key")
    p.add_argument("--char", default="BYU")
    p.add_argument("--opponents", default="all", choices=["all", "humans", "bots"])
    p.add_argument("--matches", type=int, default=0, help="stop after N matches (0 = forever)")
    p.add_argument("--dashboard", action="store_true", help="live brain view at http://127.0.0.1:8777")
    p.add_argument("--no-browser", action="store_true", help="don't open the dashboard automatically")
    p.add_argument("--record", help="folder to save brain activity + outcomes (random punches/kicks)")
    p.add_argument("--readout", help="trained readout.npz: attacks chosen from descending-neuron activity")
    p.add_argument("--no-move-readout", action="store_true",
                   help="with --readout: keep the fly's own steering instead of the trained movement readout")
    p.add_argument("--device", choices=["cpu", "cuda", "auto"], help="where to run the brain (default: $FLY_DEVICE or cpu)")
    p.add_argument("--flies", type=int, default=1, help="copies of the brain that vote (same wiring, own noise); "
                   "use with --device cuda, where 8 fit in real time")
    p.add_argument("--seed", type=int, default=64, help="brain noise seed")
    p.add_argument("--encoder", default="", help="encoder parameters, e.g. loom_size=0.3,chase_gain=0.6 "
                   "(see fly_eyes.ENCODER; unset ones keep the hand-set value)")
    args = p.parse_args()
    try:
        encoder = {k.strip(): float(v) for k, v in (kv.split("=") for kv in args.encoder.split(",") if kv.strip())}
    except ValueError:
        sys.exit("--encoder takes name=value pairs separated by commas")
    from fly_eyes import ENCODER
    if set(encoder) - set(ENCODER):
        sys.exit(f"unknown encoder parameters {sorted(set(encoder) - set(ENCODER))}; known: {', '.join(ENCODER)}")
    if not args.offline and not args.replay and not args.user:
        sys.exit("--user is required for live play (or use --offline / --replay)")
    fly = Fly(args.device, args.flies, args.seed, encoder)
    if encoder:
        print(f"encoder: {encoder}")
    # Recording alone: attacks and movement are both random (clean labels for both).
    # Recording with a trained readout: it attacks, movement stays random, so movement
    # labels are collected by a fly that can actually land a hit.
    fly.explore_moves = bool(args.record)
    fly.explore_attacks = bool(args.record) and not args.readout
    if args.readout:
        fly.readout = Readout(args.readout)
        if args.no_move_readout or args.record:
            fly.readout.move = None   # while recording, movement must stay random or brain-steered
        parts = list(fly.readout.models) + (["movement"] if fly.readout.has_move else [])
        print(f"trained readout loaded: {', '.join(parts) or 'nothing usable'}")
    dash = None
    if args.dashboard:
        from fly_dashboard import Dashboard
        dash = Dashboard(fly)
        dash.start(open_browser=not args.no_browser)
    if args.replay:
        replay(fly, args.replay, dash, args.speed)
    elif args.offline:
        offline(fly, args.seconds, dash)
    else:
        play(fly, args, dash)


if __name__ == "__main__":
    main()
