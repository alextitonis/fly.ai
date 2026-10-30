"""World-Sim's idea on the drone: a small latent planner on top, compared with the fly alone.

    python drone/planner.py collect --kind fly --minutes 8 --seed 1 --out data/fly1.npz
    python drone/planner.py fit --kind fly --data data/fly*.npz --out data/fly.pt
    python drone/planner.py fly --policy flyplan --model data/fly.pt --seed 301 --seconds 60

Same parts as World-Sim (github.com/alextitonis/ai-model), small: encoder (state -> latent), dynamics (latent + action ->
next latent, so futures are imagined without touching the simulator), reward and value heads, a decoder that keeps the
latent honest, and a search over imagined action sequences. Each 0.2 s it searches 3 steps ahead and takes the first move.

Three pilots on one task, eating fruit among pillars:
  fly       the fly alone: pilot.py, nothing on top
  flyplan   planner reading ONLY the fly's descending neurons; it acts by nudging LC10a left or right, so the connectome
            still does the flying and its reflexes stay on
  raw       planner reading the simulator's exact state, flying the yaw rate itself: no fly at all
Comparing flyplan with raw tells whether the fly adds anything. Trained on flights from other seeds than it is tested on.
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sim import DroneSim  # noqa: E402

DECISION_S = 0.2
GAMMA = 0.97
HOLD_S = 0.6            # exploration holds a random move this long
NUDGE = 0.6             # volts on LC10a for a planner's nudge
YAW = 1.5               # rad/s for the raw pilot's turns
RAW_SPEED = 0.6
ACTIONS = 3             # left, nothing, right
CRASH_COST = 2.0
PCA_DIMS = 64


def raw_state(sim: DroneSim) -> np.ndarray:
    """Exact bearings and distances: the two nearest fruit and pillars, and where the walls are."""
    things = sim.things(fov=np.pi)
    out = []
    for kind in ("fruit", "pillar"):
        near = sorted((t for t in things if t.kind == kind), key=lambda t: t.distance)[:2]
        for t in near:
            out += [np.sin(t.bearing), np.cos(t.bearing), min(t.distance, 6.0) / 3]
        out += [0.0, 0.0, 2.0] * (2 - len(near))
    x, y = sim.pos[:2]
    h = sim.heading
    return np.array(out + [x / 3, y / 3, np.cos(h), np.sin(h)], np.float32)


class Flight:
    """One drone and one pilot kind, stepped a decision at a time. For kind "fly" the state is the descending neurons'
    spikes over the last decision; for kind "raw" the exact state."""

    def __init__(self, kind: str, seed: int):
        self.kind = kind
        self.sim = DroneSim(seed=seed, gusts=False)
        self.ate = self.crashes = 0
        if kind == "fly":
            from pilot import Pilot, Senses
            from flybrain import FlyBrain
            self.brain = FlyBrain(batch=1, seed=seed, sensory_input=True)
            self.senses, self.pilot = Senses(self.brain), Pilot(self.brain)
            for _ in range(100):
                self.pilot.observe(self.brain.step())
            dn = np.flatnonzero(np.isin(self.brain.superclass.astype(str), ["descending_neuron", "descending_neuron_tbc"]))
            self.where = np.full(self.brain.n, -1)
            self.where[dn] = np.arange(len(dn))
            self.counts = np.zeros(len(dn), np.float32)
            self.ticks = round(self.brain.dt / self.sim.dt)
            self.steps = round(DECISION_S / self.brain.dt)
            self.lc10a = self.senses.cells["chase"]

    def state(self) -> np.ndarray:
        return np.log1p(self.counts) if self.kind == "fly" else raw_state(self.sim)

    def act(self, action: int) -> float:
        """Plays one decision; action 0 left, 1 nothing, 2 right. Returns the reward (fruit, less crashes)."""
        ate0, reward = self.sim.eaten, 0.0
        if self.kind == "fly":
            self.counts[:] = 0
            for _ in range(self.steps):
                inj = self.senses.inject(self.sim.things())
                if action != 1:
                    inj = inj + [(self.lc10a["L" if action == 0 else "R"], NUDGE)]
                fired = self.brain.step(None, inj)
                self.pilot.observe(fired)
                h = self.where[fired]
                self.counts[h[h >= 0]] += 1
                cmd = self.pilot.command(self.sim.t, self.sim.pos[2])
                for _ in range(self.ticks):
                    self.sim.step(**cmd)
                if self.sim.crashed:
                    break
        else:
            for _ in range(round(DECISION_S / self.sim.dt)):
                z = self.sim.pos[2]
                self.sim.step(forward=RAW_SPEED, climb=0.3 * (1.0 - z), yaw_rate=(1 - action) * YAW)
                if self.sim.crashed:
                    break
        reward += self.sim.eaten - ate0
        self.ate += self.sim.eaten - ate0
        if self.sim.crashed:
            self.crashes += 1
            reward -= CRASH_COST
            eaten, t = self.sim.eaten, self.sim.data.time
            self.sim.reset()
            self.sim.eaten, self.sim.data.time = eaten, t
        return reward


def collect(args) -> None:
    rng = np.random.default_rng(args.seed + 99)
    fl = Flight(args.kind, args.seed)
    n = int(args.minutes * 60 / DECISION_S)
    S, A, R, D = [], [], [], []
    action, hold, chase = 1, 0, True
    for i in range(n):
        s = fl.state()
        if hold <= 0:
            hold = int(HOLD_S / DECISION_S)
            action = int(rng.integers(ACTIONS))
            chase = rng.random() < 0.5
        hold -= 1
        if args.kind == "raw" and chase:               # half of its data heads for fruit, or it would never eat any
            near = [t for t in fl.sim.things(fov=np.pi) if t.kind == "fruit"]
            if near:
                b = min(near, key=lambda t: t.distance).bearing
                action = 0 if b > 0.15 else 2 if b < -0.15 else 1
        crash_before = fl.crashes
        r = fl.act(action)
        S.append(s), A.append(action), R.append(r), D.append(fl.crashes > crash_before)
        if i % 300 == 0:
            print(f"  {i}/{n} fruit {fl.ate} crashes {fl.crashes}", flush=True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.out, s=np.array(S, np.float32), a=np.array(A, np.int8), r=np.array(R, np.float32), d=np.array(D, bool))
    print(json.dumps({"fruit": fl.ate, "crashes": fl.crashes, "minutes": args.minutes}))


def build(dim: int, hidden: int = 128, latent: int = 32):
    import torch.nn as nn

    class Model(nn.Module):
        def __init__(self):
            super().__init__()
            act = nn.ELU
            self.encoder = nn.Sequential(nn.Linear(dim, hidden), act(), nn.Linear(hidden, latent), nn.LayerNorm(latent))
            self.dynamics = nn.Sequential(nn.Linear(latent + ACTIONS, hidden), act(), nn.Linear(hidden, latent))
            self.reward = nn.Sequential(nn.Linear(latent + ACTIONS, hidden), act(), nn.Linear(hidden, 1))
            self.value = nn.Sequential(nn.Linear(latent, hidden), act(), nn.Linear(hidden, 1))
            self.decoder = nn.Sequential(nn.Linear(latent, hidden), act(), nn.Linear(hidden, dim))
    return Model()


def fit(args) -> None:
    import torch
    import torch.nn.functional as F
    files = sorted(sum((glob.glob(p) for p in args.data), []))
    runs = [np.load(f) for f in files]
    S = np.concatenate([r["s"] for r in runs])
    mu, sd = S.mean(0), S.std(0) + 1e-3
    x = (S - mu) / sd
    comp = None
    if S.shape[1] > PCA_DIMS:                          # 1,314 neurons -> their main directions, as World-Sim's small encoders expect
        keep = x[np.random.default_rng(0).permutation(len(x))[:6000]]
        _, _, vt = np.linalg.svd(keep, full_matrices=False)
        comp = vt[:PCA_DIMS]
        x = x @ comp.T
    # discounted return to the end of each flight's stretch; a crash ends it
    rets, offset = np.zeros(len(S), np.float32), 0
    xs, xn, acts, rew, done = [], [], [], [], []
    for r in runs:
        n = len(r["s"])
        g = 0.0
        for i in range(n - 1, -1, -1):
            g = float(r["r"][i]) + GAMMA * g * (not r["d"][i])
            rets[offset + i] = g
        xs.append(x[offset:offset + n - 1]); xn.append(x[offset + 1:offset + n])
        acts.append(r["a"][:n - 1]); rew.append(r["r"][:n - 1]); done.append(r["d"][:n - 1])
        offset += n
    keep = np.concatenate([np.ones(len(r["s"]) - 1, bool) for r in runs])
    device = "cuda" if torch.cuda.is_available() else "cpu"
    to = lambda a, t=torch.float32: torch.as_tensor(np.asarray(a), dtype=t, device=device)    # noqa: E731
    X, Xn, Ac, Re, Do = to(np.concatenate(xs)), to(np.concatenate(xn)), to(np.concatenate(acts), torch.long), to(np.concatenate(rew)), to(np.concatenate(done))
    Ret = []
    off = 0
    for r in runs:
        n = len(r["s"])
        Ret.append(rets[off:off + n - 1])
        off += n
    Ret = to(np.concatenate(Ret))
    m = build(X.shape[1]).to(device)
    opt = torch.optim.Adam(m.parameters(), lr=1e-3, weight_decay=1e-5)
    n = len(X)
    print(f"{n} transitions from {len(files)} flights, input {X.shape[1]}, device {device}", flush=True)
    for epoch in range(args.epochs):
        perm = torch.randperm(n, device=device)
        for i in range(0, n, 256):
            b = perm[i:i + 256]
            z = m.encoder(X[b])
            a = F.one_hot(Ac[b], ACTIONS).float()
            za = torch.cat([z, a], 1)
            zn = m.dynamics(za)
            with torch.no_grad():
                target = m.encoder(Xn[b])
            pred = ((zn - target) ** 2).sum(1) * (1 - Do[b])       # no next latent across a crash
            loss = pred.mean() + F.mse_loss(m.reward(za).squeeze(1), Re[b]) * 5 + F.mse_loss(m.value(z).squeeze(1), Ret[b]) \
                + F.mse_loss(m.decoder(z), X[b])
            opt.zero_grad(); loss.backward(); opt.step()
        if epoch % 20 == 0 or epoch == args.epochs - 1:
            print(f"  epoch {epoch} loss {loss.item():.3f}", flush=True)
    torch.save({"state": {k: v.cpu() for k, v in m.state_dict().items()}, "dim": X.shape[1], "mu": mu, "sd": sd, "comp": comp,
                "kind": args.kind}, args.out)


class Plan:
    def __init__(self, path: str):
        import torch
        self.torch = torch
        d = torch.load(path, weights_only=False, map_location="cpu")
        self.m = build(d["dim"])
        self.m.load_state_dict(d["state"])
        self.m.eval()
        self.mu, self.sd, self.comp = d["mu"], d["sd"], d["comp"]
        import itertools
        self.seqs = list(itertools.product(range(ACTIONS), repeat=3))

    def __call__(self, s: np.ndarray) -> int:
        """Best first move: imagined rewards over 3 moves, then the value of where that ends."""
        torch, m = self.torch, self.m
        x = (s - self.mu) / self.sd
        if self.comp is not None:
            x = x @ self.comp.T
        with torch.no_grad():
            seq = torch.as_tensor(self.seqs)
            z = m.encoder(torch.as_tensor(x, dtype=torch.float32)[None]).repeat(len(seq), 1)
            total = torch.zeros(len(seq))
            disc = 1.0
            for k in range(seq.shape[1]):
                za = torch.cat([z, torch.nn.functional.one_hot(seq[:, k], ACTIONS).float()], 1)
                total += disc * m.reward(za).squeeze(1)
                z = m.dynamics(za)
                disc *= GAMMA
            total += disc * m.value(z).squeeze(1)
            first = seq[:, 0]
            return int(max(range(ACTIONS), key=lambda a: float(total[first == a].max())))


def fly(args) -> None:
    kind = "raw" if args.policy == "raw" else "fly"
    fl = Flight(kind, args.seed)
    plan = Plan(args.model) if args.policy != "fly" else None
    moves = [0, 0, 0]
    for _ in range(int(args.seconds / DECISION_S)):
        a = plan(fl.state()) if plan else 1
        moves[a] += 1
        fl.act(a)
    print(json.dumps({"policy": args.policy, "seed": args.seed, "seconds": args.seconds, "fruit": fl.ate, "crashes": fl.crashes,
                      "moves": moves}))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect")
    c.add_argument("--kind", choices=("fly", "raw"), required=True)
    c.add_argument("--minutes", type=float, default=8)
    c.add_argument("--seed", type=int, default=1)
    c.add_argument("--out", required=True)
    f = sub.add_parser("fit")
    f.add_argument("--kind", choices=("fly", "raw"), required=True)
    f.add_argument("--data", nargs="+", required=True)
    f.add_argument("--epochs", type=int, default=120)
    f.add_argument("--out", required=True)
    y = sub.add_parser("fly")
    y.add_argument("--policy", choices=("fly", "flyplan", "raw"), required=True)
    y.add_argument("--model")
    y.add_argument("--seed", type=int, default=301)
    y.add_argument("--seconds", type=float, default=60)
    args = ap.parse_args()
    {"collect": collect, "fit": fit, "fly": fly}[args.cmd](args)


if __name__ == "__main__":
    main()
