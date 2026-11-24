// Trading leaderboard scoring (src/tradeboard.ts): the old rules, plus linked wallets don't score off each other and win once.
import { score, seasonStart, TEAM, type Sale } from "./tradeboard.ts";

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) failed++; };
const S = 4, t0 = seasonStart(S) + 3_600_000;
const w = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
let n = 0;
const sale = (buyer: string, seller: string, amount: number, fly: number, hoursIn: number): Sale =>
  ({ tx: `0x${(++n).toString(16)}`, market: "m", id: String(fly), buyer, seller, amount, block: n, at: t0 + hoursIn * 3_600_000 });

const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map(w);
const sales = [
  sale(A, B, 200_000, 1, 0),      // A-B linked: dropped
  sale(A, C, 200_000, 2, 1),
  sale(C, D, 150_000, 3, 2),
  sale(E, F, 100_000, 4, 3),
  sale(D, E, 100_000, 5, 4),
  sale(A, C, 200_000, 6, 5),
  sale(A, C, 200_000, 7, 6),      // third A-C trade: over the pair max
  sale(D, F, 10_000, 8, 7),       // under MIN_TRADE
  sale(F, "0x625862521777e19ad54ce6c7abed9ca54d6589ea", 20_000, 9, 8),   // with the dev wallet: F scores, dev isn't ranked
];
const links = new Set([[A, B].sort().join("|")]);
const roots: Record<string, string> = { [A]: A, [B]: A, [C]: A, [D]: D, [E]: E, [F]: F };   // C shares A's funding root
const r = score(sales, S, (a, b) => links.has([a, b].sort().join("|")) || roots[a] === roots[b] && !!roots[a], (x) => roots[x] ?? x);

const pts = Object.fromEntries(r.rows.map((x) => [x.wallet, x.points]));
check("a linked pair scores nothing", !pts[B] && r.droppedLinked >= 1);
check("same funding root: A-C trades dropped too", !pts[A] && !pts[C] || (pts[A] ?? 0) === 0);
check("C scores only its unlinked trade with D", pts[C] === 150_000);
check("D: C + E trades", pts[D] === 250_000);
check("E: F + D trades", pts[E] === 200_000);
check("team wallet not ranked, its counterparty scores", !pts["0x625862521777e19ad54ce6c7abed9ca54d6589ea"] && pts[F] === 120_000);
check("small sale ignored", r.rows.every((x) => x.trades <= 2));
check("places: one per funding root", new Set(r.places.map((p) => roots[p] ?? p)).size === r.places.length);
check("places are D, E, then C's root", r.places[0] === D && r.places[1] === E && r.places[2] === C);
check("team list holds the dev wallet", TEAM.has("0x625862521777e19ad54ce6c7abed9ca54d6589ea"));

// linked wallets win once: two wallets of one root both high on the board
const r2 = score([sale(D, A, 300_000, 20, 10), sale(E, C, 290_000, 21, 11), sale(F, D, 100_000, 22, 12)], S,
  () => false, (x) => roots[x] ?? x);
check("A and C share a root: only A takes a place", r2.places.includes(A) && !r2.places.includes(C));

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all passed");
