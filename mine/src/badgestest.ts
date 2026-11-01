/**
 * Soulbound badges (src/badges.ts) against a real Postgres and a fake chain: clocks over the transfers, staking and locks
 * counting as held, earned badges staying after a sale, OG's live check, a rerun not booking twice, vouchers.
 *   npm run test:badges
 */
import type { ServerResponse } from "node:http";
import { applyChange, applyFly, badgeConfig, claimData, createBadges, newHolder, signVoucher, type Chain } from "./badges.ts";
import { FLYAI, type Log } from "./gta.ts";
import { selector } from "./staking.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const DAY = 86_400_000;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LOCKED = "0x904a8aa9ab681d45182d3583ae57e3cbc0ba1fcb72f9811ec8feee917bdbffe5";
const TRADER_FLY = "0x18d4d831ca89672126172b73ba05f5a318ad5a72";
const ROOT = "0x631b8d39efa88052cbdac92d3915589101e2d2cd6a11f55b012d07795f723420";
const CLAIMED = "0x9cdcf2f7714cca3508c7f0110b04a90a80a3a8dd0e35de99689db74d28c5383e";
const STAKE = "0x5279dafa0858d4a5b2dceb05e5b41f954cd692cc";
const LOCK = "0x87ded9d9788a1f6653a0261ef84c56658d0bf5e9";
const CONTRACT = addr(0xb4d6e);
const KEY = "11".repeat(32);
const cfg = { ...badgeConfig({ BADGES_CONTRACT: CONTRACT, BADGE_SIGNER_KEY: KEY, BADGES_FROM_BLOCK: "0", BADGES_EXCLUDE: addr(0xde5) }) };

// --- pure parts ---
{
  const h = newHolder();
  const t0 = cfg.ogEnd + DAY;
  applyChange(h, 200_000n * E18, t0, cfg);
  check("reaching the level starts the clock", h.low === t0);
  applyChange(h, 50_000n * E18, t0 + DAY, cfg);
  check("more on top doesn't restart it", h.low === t0);
  const sold = applyChange(h, -200_000n * E18, t0 + 8 * DAY, cfg);
  check("dropping below stops it and books what it reached", h.low === null && sold.length === 1 && sold[0].badge === "larva" && sold[0].at === t0 + 7 * DAY);
  const f = newHolder();
  for (let i = 0; i < 10; i++) applyFly(f, 1, t0, cfg);
  check("the tenth fly starts the 10-fly clock, the first the 1-fly clock", f.f1 === t0 && f.f10 === t0 && f.f50 === null);
  const down = applyFly(f, -1, t0 + 31 * DAY, cfg);
  check("dropping to 9 flies books swarm, the 1-fly clock runs on", down.length === 1 && down[0].badge === "swarm" && f.f10 === null && f.f1 === t0);
  const before = newHolder();
  applyChange(before, 20_000n * E18, cfg.ogEnd - DAY, cfg);
  applyChange(before, 5_000n * E18, cfg.ogEnd + DAY, cfg);
  check("OG amount is what it had when the window closed", before.og === 20_000n * E18);
  const data = claimData([1, 3], 99, ["aa".repeat(65), "bb".repeat(65)]);
  check("claim calldata has the selector and lays out both signatures", data.startsWith(selector("claim(uint256[],uint256,bytes[])"))
    && data.includes("aa".repeat(65)) && data.includes("bb".repeat(65)) && (data.length - 10) % 64 === 0);
}

// --- the fake chain ---
const T0 = cfg.ogEnd - 10 * DAY;                     // block 0's time; a block is one hour
const BLOCK_MS = 3_600_000;
const timeAt = (n: number) => T0 + n * BLOCK_MS;
let idx = 0;
const money: Log[] = [], locks: Log[] = [], flies: Log[] = [];
const log = (n: number, topics: string[], data: string): Log => ({ blockNumber: `0x${n.toString(16)}`, transactionHash: `0x${"11".repeat(32)}`, logIndex: `0x${(idx++).toString(16)}`, topics, data });
const send_ = (n: number, from: string, to: string, whole: bigint) => money.push(log(n, [TRANSFER, topic(from), topic(to)], `0x${(whole * E18).toString(16).padStart(64, "0")}`));
const fly = (n: number, from: string, to: string, id: number) => flies.push(log(n, [TRANSFER, topic(from), topic(to), `0x${id.toString(16).padStart(64, "0")}`], "0x"));
const lockFor = (n: number, who: string, whole: bigint) => locks.push(log(n, [LOCKED, `0x${"0".repeat(64)}`, topic(who), topic(addr(0xde5))], `0x${(whole * E18).toString(16).padStart(64, "0")}${"0".repeat(128)}`));
const days = (d: number) => d * 24;
const POOL = addr(0xc0), A = addr(0xa1), B = addr(0xa2), C = addr(0xa3), W = addr(0xa4), L = addr(0xa5), S = addr(0xa6), DEV = addr(0xde5), F = addr(0xa7), OG = addr(0xa8), OG2 = addr(0xa9);
send_(1, addr(0), POOL, 900_000_000n);
send_(2, POOL, A, 200_000n);                         // A holds on: larva soon, diamond later
send_(3, POOL, B, 200_000n);                         // B holds 8 days and sells: keeps larva
send_(days(8) + 3, B, POOL, 200_000n);
send_(days(8) + 4, POOL, W, 12_000_000n);            // W: 10M+ for 31 days
send_(4, POOL, C, 200_000n);                         // C stakes it all at once: still holds
send_(5, C, STAKE, 200_000n);
send_(6, POOL, S, 200_000n);                         // S moves it after 3 days: S's clock is over, T's starts
send_(days(3), S, addr(0xaa), 200_000n);
send_(7, POOL, addr(0xde0), 100n);                   // the lock's funder
lockFor(8, L, 150_000n);                             // L: locked for it counts as held
send_(8, addr(0xde0), LOCK, 150_000n);
send_(days(7) + 8, LOCK, L, 150_000n);               // ...and the claim changes nothing
send_(9, POOL, DEV, 200_000n);                       // team
send_(10, POOL, OG, 15_000n);                        // OG: 15k at the close, 15k now
send_(11, POOL, OG2, 15_000n);                       // OG2: sold part after the close
send_(days(11), OG2, POOL, 5_000n);
fly(12, addr(0), F, 1);                              // F: one fly 31+ days
fly(13, addr(0), B, 2);                              // B's fly sold after 2 days: starts again for F2
fly(days(2) + 13, B, addr(0xab), 2);
for (let i = 100; i < 110; i++) fly(14, addr(0), addr(0xad), i);   // 10 flies from the start: swarm
for (let i = 110; i < 120; i++) fly(14, addr(0), addr(0xae), i);   // 10 flies, one gone after 5 days: no swarm
fly(days(5), addr(0xae), addr(0xab), 110);
const DIST = cfg.distributor, P4 = addr(0xb1), P3 = addr(0xb2);
const desk: Log[] = [];
const root = (n: number, epoch: number) => desk.push(log(n, [ROOT, `0x${epoch.toString(16).padStart(64, "0")}`, `0x${"0".repeat(64)}`], "0x"));
const claimed = (n: number, who: string, flyId: number) => desk.push(log(n, [CLAIMED, topic(who), `0x${flyId.toString(16).padStart(64, "0")}`], "0x"));
for (let e = 1; e <= 4; e++) {
  root(e * 100, e);
  claimed(e * 100 + 1, P4, 1);
  claimed(e * 100 + 1, P4, 2);                       // two flies in one payout is still one payout
  if (e < 4) claimed(e * 100 + 2, P3, 3);
}
const minted: Log[] = [];
const SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const mint = (n: number, from: string, to: string, id: number) => minted.push(log(n, [SINGLE, topic(to), topic(from), topic(to)], `0x${id.toString(16).padStart(64, "0")}${"1".padStart(64, "0")}`));
const R1 = addr(0xc1), R2 = addr(0xc2), R3 = addr(0xc3);
mint(50, addr(0), R2, 1); mint(51, addr(0), R2, 4);  // R2 reaches 2 first
mint(60, addr(0), R1, 1); mint(61, addr(0), R1, 5);  // R1 reaches 2 later
mint(62, addr(0), R3, 1); mint(63, addr(0), R3, 2); mint(64, addr(0), R3, 3);   // R3: 3, top of the board
mint(70, addr(0), addr(0xde5), 1);                   // team: not on the board
mint(80, addr(0), addr(0xc4), 1);                    // one badge, revoked: off the board
mint(81, addr(0xc4), addr(0), 1);
const head = days(40);
let logCalls = 0;
const held = new Map<string, bigint>();
const chain: Chain = {
  head: async () => head,
  blockTime: async (n) => timeAt(n) / 1000,
  logs: async (q) => {
    logCalls++;
    const src = q.address === FLYAI ? money : q.address === TRADER_FLY ? flies : q.address === DIST ? desk : q.address === CONTRACT ? minted : locks;
    return src.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= q.from && b <= q.to; });
  },
  batch: async (calls) => calls.map((c) => {
    const sel = c.data.slice(0, 10);
    if (sel === selector("balanceOf(address,uint256)")) return `0x${(held.get(`0x${c.data.slice(34, 74)}:${BigInt(`0x${c.data.slice(74)}`)}`) ?? 0n).toString(16).padStart(64, "0")}`;
    if (sel === selector("revoked(address,uint256)")) return `0x${"0".repeat(64)}`;
    return `0x${"0".repeat(63)}7`;
  }),
};

const PG = await startPg(5551);
try {
  const { pg } = PG;
  const sent: { status: number; body: any }[] = [];
  const res = {} as ServerResponse;
  let session = A;
  const badges = createBadges({ pg, chain, cfg, HttpError, now: () => timeAt(head),
    send: (_r, status, body) => { sent.push({ status, body }); }, sessionWallet: async () => session });
  const states = async (w: string) => Object.fromEntries((await badges.standing(w)).badges.map((b) => [b.key, b.state]));

  // real referrals: REF1 has 1, REF10 has 10, REF0 has 3 that never qualified, a team wallet has 1
  const REF1 = addr(0xd1), REF10 = addr(0xd2), REF0 = addr(0xd3);
  const refer = (wallet: string, referrer: string, real: boolean) => pg.run(`insert into mine.referrals (wallet, referrer, via, qualified_at) values (?, ?, 'link', ?)`,
    wallet, referrer, real ? new Date(timeAt(head)).toISOString() : null);
  await refer(addr(0xd100), REF1, true);
  for (let i = 0; i < 10; i++) await refer(addr(0xd200 + i), REF10, true);
  for (let i = 0; i < 3; i++) await refer(addr(0xd300 + i), REF0, false);
  await refer(addr(0xd400), DEV, true);

  await badges.tick();
  const balance = async (w: string) => BigInt((await pg.one<{ balance: string }>("select balance from mine.badge_holders where wallet = ?", w))?.balance ?? "0") / E18;

  let s = await states(A);
  check("holding 100k for 40 days: larva yes, diamond not yet", s.larva === "claimable" && s.diamond === "working", JSON.stringify(s));
  s = await states(B);
  check("sold after 8 days: larva stays claimable", s.larva === "claimable", JSON.stringify(s));
  s = await states(W);
  check("10M for 30+ days: lord", s.lord === "claimable", JSON.stringify(s));
  s = await states(C);
  check("staked counts as held", s.larva === "claimable" && (await balance(C)) === 200_000n, JSON.stringify(s));
  s = await states(S);
  check("moved away after 3 days: nothing", s.larva === "working", JSON.stringify(s));
  s = await states(L);
  check("locked for a wallet counts, its withdrawal changes nothing", s.larva === "claimable" && (await balance(L)) === 150_000n, JSON.stringify(s));
  s = await states(OG);
  check("OG: had 10k+ at the close and still does", s.og === "claimable", JSON.stringify(s));
  s = await states(OG2);
  check("OG: sold below that amount: no", s.og === "closed", JSON.stringify(s));
  s = await states(F);
  check("a fly for 30+ days: fly owner", s.flyowner === "claimable", JSON.stringify(s));
  s = await states(B);
  check("a fly sold after 2 days: no fly owner", s.flyowner === "working", JSON.stringify(s));
  s = await states(addr(0xad));
  check("10 flies for 30+ days: swarm and fly owner, not queen", s.swarm === "claimable" && s.flyowner === "claimable" && s.queen === "working", JSON.stringify(s));
  s = await states(addr(0xae));
  check("down to 9 flies after 5 days: no swarm, fly owner stays", s.swarm === "working" && s.flyowner === "claimable", JSON.stringify(s));
  s = await states(P4);
  check("4 payouts claimed: payday, not payroll", s.payday === "claimable" && s.payroll === "working", JSON.stringify(s));
  s = await states(P3);
  check("3 payouts claimed: not yet", s.payday === "working", JSON.stringify(s));
  const pay = (await badges.standing(P3)).badges.find((b) => b.key === "payday")!.progress as { payouts: number; need: number };
  check("payout progress counts payouts", pay.payouts === 3 && pay.need === 4, JSON.stringify(pay));
  s = await states(REF1);
  check("1 real referral: recruiter, not pied piper", s.recruiter === "claimable" && s.piedpiper === "working", JSON.stringify(s));
  s = await states(REF10);
  check("10 real referrals: both", s.recruiter === "claimable" && s.piedpiper === "claimable", JSON.stringify(s));
  s = await states(REF0);
  check("referrals that never qualified don't count", s.recruiter === "working", JSON.stringify(s));
  const refs = (await badges.standing(REF1)).badges.find((b) => b.key === "piedpiper")!.progress as { referrals: number; need: number };
  check("referral progress counts real referrals", refs.referrals === 1 && refs.need === 10, JSON.stringify(refs));
  check("team wallets can't claim referral badges", (await states(DEV)).recruiter === "team");
  await pg.run("insert into mine.profiles (wallet, nickname, updated_at_ms) values (?, 'first', 1)", R3);
  const lb: any = await badges.leaderboard(R1);
  check("leaderboard: most badges first, then who got there first", lb.rows.map((r: any) => r.wallet).join() === [R3, R2, R1].join(), JSON.stringify(lb.rows.map((r: any) => [r.rank, r.badges])));
  check("leaderboard: nickname and which badges", lb.rows[0].nickname === "first" && lb.rows[0].ids.join() === "1,2,3");
  check("leaderboard: team and revoked wallets aren't on it", lb.total === 3);
  check("leaderboard: a wallet gets its own row", lb.me?.rank === 3 && lb.me?.badges === 2, JSON.stringify(lb.me));
  check("leaderboard: a wallet with none has no row", (await badges.leaderboard(addr(0xfff)) as any).me === null);
  s = await states(DEV);
  check("team wallets can't claim", s.larva === "team", JSON.stringify(s));
  const progress = (await badges.standing(A)).badges.find((b) => b.key === "diamond")!.progress as { days: number; need: number };
  check("progress counts the days", progress.days === 39 && progress.need === 90, JSON.stringify(progress));

  const calls = logCalls, bal = await balance(A);
  await badges.tick();
  check("a second tick books nothing twice", (await balance(A)) === bal);
  check("a second tick reads nothing new", logCalls === calls, `${logCalls - calls} calls`);
  check("the first full read leaves no notices", !(await pg.one("select 1 from mine.notices where href = '/badges' limit 1")));

  // a later tick, with a clock that has just run out: a note in the bell
  send_(head + 1, POOL, addr(0xac), 200_000n);
  const later = createBadges({ pg, chain: { ...chain, head: async () => head + 1000 }, cfg, HttpError, now: () => timeAt(head + 1000),
    send: () => {}, sessionWallet: async () => session });
  await later.tick();
  await later.tick();
  check("a badge earned later leaves a note", !!(await pg.one("select 1 from mine.notices where wallet = ? and href = '/badges'", addr(0xac))));

  // vouchers
  session = A;
  await badges.route({ method: "POST", headers: {} } as any, res, new URL("http://x/api/badges/vouchers"));
  const v = sent.at(-1)!.body;
  check("voucher for what it can claim, to the contract", v.to === CONTRACT && v.badges.join() === "1,4", JSON.stringify(v.badges));
  const sig = signVoucher({ chainId: cfg.chainId, contract: CONTRACT, signerKey: cfg.signerKey! }, A, 1, v.deadline);
  check("the calldata carries that signature", v.data.includes(sig));

  session = S;
  let threw: any = null;
  try { await badges.route({ method: "POST", headers: {} } as any, res, new URL("http://x/api/badges/vouchers")); } catch (e) { threw = e; }
  check("nothing earned: no voucher", threw?.status === 409);

  held.set(`${A}:1`, 1n);
  s = await states(A);
  check("a claimed badge shows as held", s.larva === "held", JSON.stringify(s));

  await badges.route({ method: "GET", headers: {} } as any, res, new URL("http://x/api/badges"));
  check("the public view has all eleven and their claim counts", sent.at(-1)!.body.badges.length === 11 && sent.at(-1)!.body.badges[0].claimed === 7);

  const off = createBadges({ pg, chain, cfg: badgeConfig({}), HttpError, send: (_r, status, body) => { sent.push({ status, body }); }, sessionWallet: async () => session });
  await off.route({ method: "GET", headers: {} } as any, res, new URL("http://x/api/badges/me"));
  check("without a contract and key it's off", sent.at(-1)!.body.on === false);
} finally {
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "all good");
process.exit(failed ? 1 : 0);
