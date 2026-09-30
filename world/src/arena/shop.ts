/**
 * Fly Colosseum's auras: a glow around a fly in the arena and on its card. Looks only, no stats. Bought once for a
 * fly with $FLYAI from the on-site balance (mine/src/arena.ts), they stay with the fly whoever owns it; a fly wears
 * one at a time. Prices are whole $FLYAI; `colors` is the glow, inside then outside.
 */
export interface Aura { id: string; name: string; price: number; colors: [string, string] }

export const AURAS: Aura[] = [
  { id: "ember", name: "Ember", price: 25_000, colors: ["#ffb347", "#ff4d2e"] },
  { id: "frost", name: "Frost", price: 25_000, colors: ["#e8fbff", "#4db8ff"] },
  { id: "toxic", name: "Toxic", price: 50_000, colors: ["#d7ff5e", "#3ddc97"] },
  { id: "gold", name: "Golden", price: 100_000, colors: ["#fff3b0", "#f5b700"] },
  { id: "storm", name: "Lightning", price: 150_000, colors: ["#ffffff", "#9d7bff"] },
  { id: "cosmic", name: "Cosmic", price: 250_000, colors: ["#ff7ad9", "#5b5bff"] },
];

export const auraOf = (id: string | null | undefined) => AURAS.find((a) => a.id === id) ?? null;
