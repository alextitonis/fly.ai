/**
 * Fly Colosseum teaser: one real-brain fight between two revealed Trader Flies, written as JSON for the video renderer
 * (flytrade/marketing/art/colosseum/clip.py).
 *   node --experimental-strip-types tools/arena-clip.ts --top 12          the strongest revealed flies
 *   node --experimental-strip-types tools/arena-clip.ts <flyA> <flyB> [tries=6]   plays up to `tries` fights, keeps the most dramatic
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ConnectomeBrain, cells, parseMeta, parseWeights } from "../src/connectome.ts";
import { groups, runRound } from "../src/arena/readout.ts";
import { deriveRng, maxHp, playFight, setupFight, type FightEvent, type RoundEvent } from "../src/arena/game.ts";
import { BACKGROUNDS, COLORWAYS, EXTRAS, GEAR, POSES, RARITIES, statsOf, type Traits } from "../src/arena/stats.ts";

const REVEAL = "../flytrade/nft/reveal";
const traitsOf = (id: number): Traits => {
  const a = Object.fromEntries((JSON.parse(readFileSync(`${REVEAL}/${id}.json`, "utf8")).attributes as { trait_type: string; value: string }[]).map((x) => [x.trait_type, x.value]));
  const rarity = RARITIES.indexOf(a.Rarity);
  return { rarity, pose: POSES.findIndex((p) => p[0] === a.Pose), colorway: COLORWAYS[rarity].indexOf(a.Colorway),
    background: BACKGROUNDS.findIndex((p) => p[0] === a.Background), gear: GEAR.findIndex((p) => p[0] === a.Gear), extra: EXTRAS.findIndex((p) => p[0] === a.Extra) };
};
const sum = (t: Traits) => { const s = statsOf(t); return s.pow + s.grd + s.vit + s.fury; };
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (process.argv.includes("--top")) {
  const ids = readdirSync(REVEAL).filter((f) => /^\d+\.json$/.test(f)).map((f) => Number(f.slice(0, -5)));
  ids.map((id) => ({ id, t: traitsOf(id) })).sort((x, y) => sum(y.t) - sum(x.t)).slice(0, Number(args[0] ?? 12))
    .forEach(({ id, t }) => console.log(`#${id} ${RARITIES[t.rarity]} ${POSES[t.pose][0]} / ${GEAR[t.gear][0]} / ${EXTRAS[t.extra][0]} ${JSON.stringify(statsOf(t))} = ${sum(t)}`));
  process.exit(0);
}

const dir = "public/connectome";
const unpack = (raw: Buffer) => { const b = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const parts: string[] = JSON.parse(readFileSync(`${dir}/brain.json`, "utf8")).parts;
const meta = parseMeta(unpack(readFileSync(`${dir}/meta.bin`)));
const w = parseWeights(unpack(Buffer.concat(parts.map((p) => readFileSync(`${dir}/${p}`)))));
const g = groups(meta, cells);

const [ia, ib] = [Number(args[0]), Number(args[1])], tries = Number(args[2] ?? 6);
const stats = [statsOf(traitsOf(ia)), statsOf(traitsOf(ib))] as const;
let best: { score: number; seeds: [number, number]; events: FightEvent[]; label: string } | null = null;
for (let k = 0; k < tries; k++) {
  const label = `clip-${ia}-${ib}-${k}`;
  const rng = await deriveRng(label, "teaser");
  const { seeds } = setupFight(rng);
  const brains = seeds.map((s) => new ConnectomeBrain(w, meta.params, s));
  const events: FightEvent[] = [];
  for await (const e of playFight([stats[0], stats[1]], rng, (side, _r, scent, loom) => runRound(brains[side], g, scent, loom))) events.push(e);
  const rounds = events.filter((e): e is RoundEvent => e.type === "round");
  const end = events[events.length - 1] as { winner: number; how: string };
  // dramatic: many rounds, a knockout, and the underdog (fewer points) winning is a bonus
  const lastHp = rounds[rounds.length - 1].hp;
  const score = rounds.length + (end.how === "ko" ? 3 : 0) - Math.abs(lastHp[0] - lastHp[1]) / 40 + (sum(traitsOf(end.winner === 0 ? ia : ib)) < sum(traitsOf(end.winner === 0 ? ib : ia)) ? 2 : 0);
  console.log(`${label}: ${rounds.length} rounds, ${end.how}, winner ${end.winner === 0 ? ia : ib}, hp ${lastHp} score ${score.toFixed(1)}`);
  if (process.argv.includes("--pick") ? k === Number(process.env.PICK) : (!best || score > best.score)) best = { score, seeds, events, label };
}
const view = (id: number) => { const t = traitsOf(id), s = statsOf(t); return { fly: id, traits: t, stats: s, hp: maxHp(s), strength: sum(t), rarity: RARITIES[t.rarity] }; };
writeFileSync("clip.json", JSON.stringify({ label: best!.label, a: view(ia), b: view(ib), events: best!.events }, null, 1));
console.log("kept", best!.label, "-> world/clip.json");
