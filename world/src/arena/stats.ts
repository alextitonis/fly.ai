/**
 * Fly Colosseum: a fighter's stats, worked out from its Trader Fly traits and nothing else. The one copy: the page's
 * stat cards, the tournament server and the Verify replay all call statsOf, and every table below is printed on the
 * page ("How a fight works"), so anyone can work a fly's stats out by hand from its traits.
 *
 * Four stats, in points. What a point does is in game.ts:
 *   pow   Power     each point adds 0.25% to the damage of its charge
 *   grd   Guard     each point adds 0.6% to what its dodge blocks
 *   vit   Vitality  each point adds 1 HP to the starting 200
 *   fury  Fury      each point adds 0.5% more damage while the fly is below half its HP
 *
 * Points come from the traits rolled on chain (flytrade/contracts/src/FlyTraits.sol; the indexes and names here are
 * that contract's): the pose gives 8, the colorway 4, the background 2, gear 4 (none: 0), the extra 2 (none: 0), and
 * the rarity adds 0 / 1 / 2 / 3 to every stat. Potions bought for one tournament add 4 each (POTIONS).
 */
export interface Traits { rarity: number; pose: number; colorway: number; background: number; gear: number; extra: number }
export interface Stats { pow: number; grd: number; vit: number; fury: number }
export type Stat = keyof Stats;
export const STATS: Stat[] = ["pow", "grd", "vit", "fury"];
type Add = Partial<Stats>;

export const RARITIES = ["Common", "Uncommon", "Rare", "Legendary"];
/** added to every stat */
export const RARITY_BONUS = [0, 1, 2, 3];

export const POSES: [string, Add][] = [
  ["To The Moon", { pow: 6, fury: 2 }],
  ["Asleep At The Desk", { vit: 6, grd: 2 }],
  ["Called It", { fury: 6, pow: 2 }],
  ["Bought The Top", { vit: 4, fury: 4 }],
  ["Exit Liquidity", { grd: 4, fury: 4 }],
  ["Diamond Wings", { grd: 6, vit: 2 }],
  ["HODL", { grd: 4, vit: 4 }],
  ["Buy The Dip", { pow: 4, fury: 4 }],
  ["Paper Hands", { grd: 6, pow: 2 }],
  ["Got Rugged", { fury: 8 }],
  ["Probably Nothing", { grd: 4, pow: 4 }],
  ["GM", { pow: 2, grd: 2, vit: 2, fury: 2 }],
  ["Checking Charts", { vit: 4, pow: 4 }],
  ["Pump It", { pow: 8 }],
];

/** colorway names per rarity; the colorway's index picks the stat: 0 Power, 1 Guard, 2 Vitality, 3 Fury */
export const COLORWAYS: string[][] = [
  ["Housefly", "Blowfly", "Horsefly", "Fruit Fly"],
  ["Greenbottle", "Obsidian", "Copper", "Mint"],
  ["Chrome", "Holo", "Neon", "Lava"],
  ["Diamond", "Ghost", "Cosmic", "Glitch"],
];
export const COLORWAY_POINTS = 4;

export const BACKGROUNDS: [string, Add][] = [
  ["Slate", { grd: 2 }], ["Plum", { fury: 2 }], ["Sand", { vit: 2 }], ["Tangerine", { pow: 2 }], ["Bull Run", { pow: 2 }],
  ["Bear Market", { grd: 2 }], ["Crab Season", { vit: 2 }], ["Midnight", { fury: 2 }], ["Mint", { vit: 2 }],
  ["Blush", { fury: 2 }], ["Ocean", { grd: 2 }], ["Moonlight", { fury: 2 }], ["Liquidation", { pow: 2 }], ["Matrix", { grd: 2 }],
];

export const GEAR: [string, Add][] = [
  ["None", {}], ["Shades", { grd: 4 }], ["Gold Chain", { pow: 4 }], ["Laser Eyes", { pow: 4 }], ["Crown", { vit: 4 }],
  ["Cap", { vit: 4 }], ["Party Hat", { fury: 4 }], ["Headphones", { grd: 4 }], ["Monocle", { fury: 4 }], ["Halo", { vit: 4 }],
];

export const EXTRAS: [string, Add][] = [
  ["None", {}], ["Coffee", { fury: 2 }], ["Sticky Note", { grd: 2 }], ["Tiny Candle Chart", { fury: 2 }], ["Receipt", { vit: 2 }],
  ["$FLYAI Coin", { pow: 2 }], ["Rocket", { pow: 2 }], ["Pizza", { vit: 2 }], ["Laptop", { grd: 2 }], ["Lambo Key", { pow: 2 }],
  ["Diamond", { grd: 2 }], ["Money Bag", { vit: 2 }], ["Golden Ticket", { fury: 2 }], ["Moon Rock", { pow: 2 }],
];

/** Potions: bought for one fly in one tournament, one of each kind at most, MAX_POTIONS in all. Everyone sees them. */
export const POTIONS = {
  preworkout: { name: "Pre-Workout", add: { pow: 4 } as Add },
  bubblewrap: { name: "Bubble Wrap", add: { grd: 4 } as Add },
  copium: { name: "Copium", add: { vit: 4 } as Add },
  hopium: { name: "Hopium", add: { fury: 4 } as Add },
};
export type PotionId = keyof typeof POTIONS;
export const POTION_IDS = Object.keys(POTIONS) as PotionId[];
export const MAX_POTIONS = 2;

export function validTraits(t: Traits): boolean {
  const int = (x: number, n: number) => Number.isInteger(x) && x >= 0 && x < n;
  return int(t.rarity, RARITIES.length) && int(t.pose, POSES.length) && int(t.colorway, COLORWAY_POINTS) && int(t.background, BACKGROUNDS.length)
    && int(t.gear, GEAR.length) && int(t.extra, EXTRAS.length);
}

export interface Line { source: "rarity" | "pose" | "colorway" | "background" | "gear" | "extra" | "potion"; name: string; add: Add }

/** Where every point comes from, line by line: the stat card prints these. */
export function breakdown(t: Traits, potions: PotionId[] = []): Line[] {
  if (!validTraits(t)) throw new Error("not a Trader Fly's traits");
  const r = RARITY_BONUS[t.rarity];
  const lines: Line[] = [
    { source: "rarity", name: RARITIES[t.rarity], add: { pow: r, grd: r, vit: r, fury: r } },
    { source: "pose", name: POSES[t.pose][0], add: POSES[t.pose][1] },
    { source: "colorway", name: COLORWAYS[t.rarity][t.colorway], add: { [STATS[t.colorway]]: COLORWAY_POINTS } },
    { source: "background", name: BACKGROUNDS[t.background][0], add: BACKGROUNDS[t.background][1] },
    { source: "gear", name: GEAR[t.gear][0], add: GEAR[t.gear][1] },
    { source: "extra", name: EXTRAS[t.extra][0], add: EXTRAS[t.extra][1] },
  ];
  for (const p of potions) lines.push({ source: "potion", name: POTIONS[p].name, add: POTIONS[p].add });
  return lines;
}

export function statsOf(t: Traits, potions: PotionId[] = []): Stats {
  const s: Stats = { pow: 0, grd: 0, vit: 0, fury: 0 };
  for (const line of breakdown(t, potions)) for (const k of STATS) s[k] += line.add[k] ?? 0;
  return s;
}

/** A potion list as the rules take it: known kinds, no repeats, MAX_POTIONS at most. */
export function validPotions(p: unknown): p is PotionId[] {
  return Array.isArray(p) && p.length <= MAX_POTIONS && new Set(p).size === p.length && p.every((x) => POTION_IDS.includes(x));
}
