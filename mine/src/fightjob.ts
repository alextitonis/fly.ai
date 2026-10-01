/**
 * A fight job: one Fly Colosseum fight (world/src/arena/game.ts runFight), played on the miner's loaded connectome with
 * the very code the tournament server and the page's Verify use. Two kinds of order send them:
 *   - practice fights between random fighters (balance testing: what each stat point is really worth);
 *   - a finished season's fights, replayed by the network to check the server's results.
 *
 * Output: a small JSON summary of the fight. The engine is float, but runFight works damage in whole numbers of 1e-12
 * HP, so every JavaScript engine that follows IEEE-754 returns the same bytes; miners must agree on them exactly.
 */
import { ConnectomeBrain, cells } from "../../world/src/connectome.ts";
import { runFight, type EndEvent, type RoundEvent } from "../../world/src/arena/game.ts";
import { groups, runRound, type Groups } from "../../world/src/arena/readout.ts";
import type { Stats } from "../../world/src/arena/stats.ts";
import type { Model } from "./model.ts";

export interface FightParams { server_seed: string; digest: string; label: string; a: Stats; b: Stats }

/** What a fight job answers: who won and how, and enough of the fight to tell two runs apart. */
export interface FightResult {
  a: Stats; b: Stats;
  seeds: [number, number];
  winner: 0 | 1;
  how: EndEvent["how"];
  rounds: number;
  /** HP each fly had left, and the spikes each fired over the fight */
  hp: [number, number];
  charge: [number, number];
  escape: [number, number];
}

const groupCache = new WeakMap<Model, Groups>();

export async function fightResult(model: Model, p: FightParams): Promise<FightResult> {
  let g = groupCache.get(model);
  if (!g) groupCache.set(model, (g = groups(model.meta, cells)));
  const { seeds, events } = await runFight(p.server_seed, p.digest, p.label, [p.a, p.b], (seed) => {
    const brain = new ConnectomeBrain(model.w, model.meta.params, seed);
    return (scent, loom) => runRound(brain, g!, scent, loom);
  });
  const rounds = events.filter((e): e is RoundEvent => e.type === "round");
  const end = events[events.length - 1] as EndEvent;
  const last = rounds[rounds.length - 1];
  const sum = (k: "charge" | "escape", i: 0 | 1) => rounds.reduce((s, r) => s + r[k][i], 0);
  return {
    a: p.a, b: p.b, seeds, winner: end.winner, how: end.how, rounds: end.rounds,
    hp: last ? last.hp : [0, 0], charge: [sum("charge", 0), sum("charge", 1)], escape: [sum("escape", 0), sum("escape", 1)],
  };
}

export async function runFightJob(model: Model, p: FightParams): Promise<Uint8Array> {
  return new TextEncoder().encode(JSON.stringify(await fightResult(model, p)));
}
