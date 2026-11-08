/**
 * XP (src/xp.ts) against a real Postgres and a fake chain: holding by amount, staked and locked at 1.25x, active flies
 * only at 200k, the streak stepping up weekly and a sell restarting it, market trades both sides, swap-box buys,
 * feeding, claim-and-stake, breeding, pass burns, deposits with withdrawals, badges by rarity, referrals, X, a rerun
 * not booking twice, the board leaving team wallets off.
 *   npm run test:xp
 */
import type { ServerResponse } from "node:http";
import { accrue, badgeXp, boostResult, createXp, dailyGains, depositXp, levelOf, newHolder, saleXp, sharesFrom, streakMult, xpConfig, type Chain, type Log } from "./xp.ts";
import { FLYAI } from "./gta.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const E18 = 10n ** 18n;
const HOUR = 3_600_000, DAY = 24 * HOUR;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const num = (v: bigint | number) => BigInt(v).toString(16).padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LOCKED = "0x904a8aa9ab681d45182d3583ae57e3cbc0ba1fcb72f9811ec8feee917bdbffe5";
const CLAIMED = "0x9cdcf2f7714cca3508c7f0110b04a90a80a3a8dd0e35de99689db74d28c5383e";
const FED = "0x000cb2d9be8c81fea2148aedbe249d365ec8682f80a9cfef62bb4c15b4220d73";
const SOLD = "0xa70b1a854695e7921b122988e216d3a6cd10ed799017c67b1ff231967e6bf56d";
const MERGE = "0x2e644e10158aafb1c3e7f06b92d5a111375494e5a0fc9d2ab65775e2414f708d";
const POOL = "0x8366a39cc670b4001a1121b8f6a443a643e40951";

// pure parts
{
  check("streak: x1 in week 1, x1.1 in week 2, capped at x2", streakMult(0, 3 * DAY) === 1 && streakMult(0, 8 * DAY) === 1.1 && streakMult(0, 400 * DAY) === 2);
  const h = newHolder();
  h.liquid = 200_000n * E18; h.flies = 1; h.at = 0; h.streak = 0;
  accrue(h, 14 * DAY, Infinity);
  check("200k for 14 days: 70 + 77 holding (week 2 at x1.1)", near(h.hold, 147), String(h.hold));
  check("an active fly earns the same", near(h.fly, 147), String(h.fly));
  const s = newHolder();
  s.staked = 200_000n * E18; s.at = 0;
  accrue(s, 2 * DAY, Infinity);
  check("staked earns 1.25x", near(s.hold, 25), String(s.hold));
  const small = newHolder();
  small.liquid = 100_000n * E18; small.flies = 3; small.at = 0;
  accrue(small, DAY, Infinity);
  check("under 200k: holding counts by amount, flies don't", near(small.hold, 5) && small.fly === 0, `${small.hold} ${small.fly}`);
  const clip = newHolder();
  clip.liquid = 200_000n * E18; clip.at = 0;
  accrue(clip, 10 * DAY, 2 * DAY);
  check("nothing after the season ends", near(clip.hold, 20), String(clip.hold));
  check("sale XP: 200k FLYAI = 20, $10 USDG = 5, other = 20", saleXp(FLYAI, 200_000n * E18) === 20
    && saleXp("0x5fc5360d0400a0fd4f2af552add042d716f1d168", 10_000_000n) === 5 && saleXp(addr(9), 1n) === 20);
  const held = new Map([[1, 50], [2, 15], [3, 5], [4, 1]]);
  check("badges by rarity: 25 + 100 + 250 + 500", badgeXp([1, 2, 3, 4], held, 100) === 875);
  check("deposits: capped by principal still in", depositXp(50, 30) === 300 && depositXp(50, 80) === 500 && depositXp(50, 0) === 0);
  check("levels: 49 -> 0, 50 -> 1, 200 -> 2, 5000 -> 10", levelOf(49) === 0 && levelOf(50) === 1 && levelOf(200) === 2 && levelOf(5000) === 10);
  const links = [{ wallet: "0xa", username: "Alice", linked_at_ms: 10 * DAY }];
  const ev = sharesFrom([
    { id: "100001", author: "alice", at: 11 * DAY + 5, reply: false },          // counts (any case)
    { id: "100002", author: "alice", at: 11 * DAY + 9, reply: false },          // same day: no
    { id: "100003", author: "alice", at: 12 * DAY + 1, reply: true },           // a reply: no
    { id: "100004", author: "alice", at: 9 * DAY, reply: false },               // before linking: no
    { id: "100005", author: "bob", at: 12 * DAY, reply: false },                // not linked: no
    { id: "100006", author: "alice", at: 12 * DAY + 2, reply: false },          // next day: counts
  ], links, new Set(), Infinity);
  check("shares: one a day per linked account, no replies, nothing before linking", ev.map((e) => e.ref).join() === "x:100001,x:100006" && ev.every((e) => e.xp === 20), ev.map((e) => e.ref).join());
  check("shares: a day already paid stays paid", sharesFrom([{ id: "100007", author: "alice", at: 11 * DAY, reply: false }], links, new Set(["0xa:1970-01-12"]), Infinity).length === 0);
  const g = dailyGains([{ day: "2026-11-01", sources: { hold: 100, market: 20 } }, { day: "2026-11-02", sources: { hold: 130, market: 40, x: 50 } }, { day: "2026-11-03", sources: { hold: 130 } }]);
  check("daily gains: day minus the day before, events left out, quiet days dropped",
    g.length === 2 && g[0].first && g[0].sources.hold === 100 && !("market" in g[0].sources) && g[1].sources.hold === 30 && g[1].sources.x === 50, JSON.stringify(g));
}

// the chain: one block an hour from T0
const T0 = Date.parse("2026-10-01T00:00:00Z");
const timeAt = (n: number) => T0 + n * HOUR;
const blockAt = (day: number, hour = 0) => day * 24 + hour;
const cfg = { ...xpConfig({}), fromBlock: 0, end: T0 + 60 * DAY };
const A = addr(0xa1), B = addr(0xb1), C = addr(0xc1), D = addr(0xd1), E = addr(0xe1), TEAM = cfg.exclude[0];
const logs: Log[] = [];
let ix = 0;
const log = (address: string, n: number, topics: string[], data: string, tx = `0x${(++ix).toString(16).padStart(64, "0")}`) =>
  logs.push({ address, blockNumber: `0x${n.toString(16)}`, transactionHash: tx, logIndex: `0x${(ix++).toString(16)}`, topics, data: `0x${data}` } as Log);
const send = (n: number, from: string, to: string, amount: bigint, tx?: string) => log(FLYAI, n, [TRANSFER, topic(from), topic(to)], num(amount), tx);
const fly = (n: number, from: string, to: string, id: number) => log(cfg.fly, n, [TRANSFER, topic(from), topic(to), `0x${num(id)}`], "");

const K200 = 200_000n * E18;
send(0, addr(7), A, K200);                  fly(0, addr(0), A, 1);          // A: 200k + a fly, never sells
send(0, addr(7), B, K200);                  send(1, B, cfg.staking, K200);   // B: stakes it all
send(0, addr(7), TEAM, 10n * K200);                                         // team: tracked, off the board
// C buys through the box at day 1: the pool pays C, C's buy pays our fee leg
const BOX = `0x${"b0".repeat(32)}`;
send(blockAt(1), POOL, C, 1_000_000n * E18, BOX); send(blockAt(1), C, cfg.feeTo, 2_500n * E18, BOX);
// RB buys 300k through the box's Relay route (no fee leg in the tx; the box logged a success): counts. NB buys 300k
// elsewhere (no log): not a box buy (2026-11-06, xp.ts boxBuys)
const RB = addr(0xf8), NB = addr(0xf9);
send(blockAt(9), POOL, RB, 300_000n * E18);
send(blockAt(9), POOL, NB, 300_000n * E18);
// C sells half into the pool at day 10: the streak restarts
send(blockAt(10), C, POOL, 500_000n * E18);
// D locks 400k for E
send(blockAt(2), addr(7), D, 2n * K200); send(blockAt(2, 1), D, cfg.lock, 2n * K200);
log(cfg.lock, blockAt(2, 1), [LOCKED, `0x${num(1)}`, topic(E), topic(D)], num(2n * K200) + num(0));
// a market sale of fly 2 for 200k between C and D
fly(blockAt(3), addr(0), C, 2);
log(cfg.market, blockAt(4), [SOLD, `0x${num(2)}`, topic(C), topic(D)], num(K200) + num(K200 / 200n));
fly(blockAt(4), C, D, 2);
// A's fly 1 is fed $5
log(cfg.fly, blockAt(5), [FED, `0x${num(1)}`], num(5_000_000n) + num(5_000_000n) + num(1));
// A claims a payout and stakes it 20 minutes later (blocks are an hour, so the same block)
log(cfg.distributor, blockAt(6), [CLAIMED, topic(A), `0x${num(1)}`], num(50_000n * E18) + num(50_000n * E18));
send(blockAt(6), A, cfg.staking, 50_000n * E18);
// B claims and stakes 3 hours later: too late
log(cfg.distributor, blockAt(7), [CLAIMED, topic(B), `0x${num(3)}`], num(50_000n * E18) + num(50_000n * E18));
send(blockAt(7, 3), addr(7), B, 50_000n * E18); send(blockAt(7, 3), B, cfg.staking, 50_000n * E18);
// D breeds; E burns a FlightPass
log(cfg.breeder, blockAt(8), [MERGE, `0x${num(2)}`, `0x${num(9)}`, topic(D)], num(0) + num(0) + num(0));
log(cfg.pass, blockAt(8), [TRANSFER, topic(E), topic("0x000000000000000000000000000000000000dEaD".toLowerCase()), `0x${num(4)}`], "");

let head = blockAt(20) + 100;
const chain: Chain = {
  head: async () => head,
  blockTime: async (n) => timeAt(n) / 1000,
  isContract: async (w) => w === E,   // E stands in for a contract below
  logs: async (q) => logs.filter((l) => {
    const b = parseInt(l.blockNumber, 16);
    return l.address === q.address && b >= q.from && b <= q.to && (!q.topics[0] || l.topics[0] === q.topics[0]);
  }).map(({ address: _a, ...l }) => l),
};

const PG = await startPg(5553);
try {
  const { pg } = PG;
  const sent: { status: number; body: any }[] = [];
  let clock = timeAt(blockAt(20));
  let session = A;
  let posts: { id: string; author: string; at: number; reply: boolean }[] = [];
  let searches = 0;
  const xp = createXp({ pg, chain, cfg, HttpError, now: () => clock, readJson: async () => ({}),
    send: (_r, status, body) => { sent.push({ status, body }); }, sessionWallet: async () => session,
    search: async () => { searches++; return posts; } });
  await pg.run(`insert into mine.swap_events (session, step, wallet, route, at) values ('testsession1', 'success', ?, 'relay', ?)`,
    RB, new Date(timeAt(blockAt(9)) + 20 * 60_000).toISOString());
  await xp.tick();
  const prof = async (w: string) => xp.profile(w) as Promise<any>;
  let a = await prof(A), b = await prof(B), c = await prof(C), dd = await prof(D), e = await prof(E);

  check("A: 20 days of 200k with a weekly streak, the staked 50k at 1.25x from day 6", near(a.sources.hold, 10 * (7 + 7 * 1.1 + 6 * 1.2) + 50_000 / 200_000 * 2.5 * (1 + 7 * 1.1 + 6 * 1.2), 1), String(a.sources.hold));
  check("A: the active fly earns alongside", near(a.sources.flies, 10 * (7 + 7 * 1.1 + 6 * 1.2), 1), String(a.sources.flies));
  check("A: feeding $5 = 50", a.sources.feed === 50, String(a.sources.feed));
  check("A: claim staked within the hour = 50", a.sources.claimstake === 50, String(a.sources.claimstake));
  check("B: staked at 1.25x and no claim-stake bonus (3 h late)", !b.sources.claimstake && b.sources.hold > 300, JSON.stringify(b.sources));
  check("C: box buy of 1M = 100", c.sources.buy === 100, String(c.sources.buy));
  const pf = await prof(RB), pgx = await prof(NB);
  check("F: a Relay-route box buy (no fee leg, the box logged it) = 30", pf.sources.buy === 30, JSON.stringify(pf.sources));
  check("G: the same buy without the box's log isn't a box buy", !pgx.sources.buy, JSON.stringify(pgx.sources));
  check("C: the sell restarted the streak", c.streak_weeks === 1, String(c.streak_weeks));
  check("C and D: the market sale earns both sides 20", c.sources.market === 20 && dd.sources.market === 20);
  check("D: breeding = 500", dd.sources.breed === 500);
  check("E: the lock counts for the beneficiary at 1.25x", near(e.sources.hold, 400_000 / 200_000 * 10 * 1.25 * 18 * 1.1, 60) && e.sources.hold > 0, String(e.sources.hold));
  check("E: a pass burn = 100", e.sources.passburn === 100);
  check("D: what went into the lock earns nothing for D (an hour before it, ~1)", !dd.sources.hold || dd.sources.hold <= 1, String(dd.sources.hold));
  check("A: one active fly", a.flies === 1 && a.active === true);

  // the rest comes from tables
  await pg.run("insert into mine.vault_moves (wallet, chain, kind, holder, usd) values ('0xw', 'robinhood', 'deposit', ?, 50), ('0xw', 'robinhood', 'deposit', ?, 5)", B, B);
  await pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values ('0xw', 'robinhood', ?, 30)", B);
  await pg.run("insert into mine.referrals (wallet, referrer, via, qualified_at) values (?, ?, 'link', now())", B, A);
  await pg.run("insert into mine.x_links (wallet, x_id, username, linked_at_ms) values (?, '1', 'alice', ?)", A, timeAt(blockAt(19)));
  await pg.run("insert into mine.badge_claims (wallet, badge, at) values (?, 1, now()), (?, 1, now()), (?, 2, now())", A, C, A);
  clock += 1;
  await xp.tick();
  a = await prof(A); b = await prof(B);
  check("B: $50 deposit counts up to the $30 principal still in; the $5 one doesn't", b.sources.deposits === 300, String(b.sources.deposits));
  const bBase = Object.entries(b.sources).reduce((s, [k, v]) => (k === "referrals" ? s : s + (v as number)), 0);
  check("A: +10% of B's XP for the real referral", near(a.sources.referrals, bBase * 0.1, 1), `${a.sources.referrals} vs ${bBase}`);
  check("A: X linked = 50", a.sources.x === 50);
  check("A: badges by rarity (2 of 2 wallets hold #1, 1 of 2 hold #2: common 25 + common 25)", a.sources.badges === 50, String(a.sources.badges));

  // a rerun books nothing twice
  const before = (await pg.one<{ n: number }>("select count(*)::int as n from mine.xp_events"))!.n;
  await pg.run("update mine.xp_state set value = '0'::jsonb where key = 'cursor'");
  await pg.run("delete from mine.xp_holders");
  await pg.run("delete from mine.xp_flies");
  await xp.tick();
  const after = (await pg.one<{ n: number }>("select count(*)::int as n from mine.xp_events"))!.n;
  check("a full rescan books no event twice", before === after, `${before} -> ${after}`);

  // the board
  await xp.tick();
  const board = await xp.leaderboard(TEAM) as any;
  check("the season's end stays off the API, and without the secret there is none", !("end" in board.season) && xpConfig({}).end === Infinity);
  check("a contract is left off the board", !board.rows.some((r: any) => r.wallet === E));
  check("the team wallet is off the board", !board.rows.some((r: any) => r.wallet === TEAM) && board.me === null);
  check("board is sorted by XP", board.rows.every((r: any, i: number) => i === 0 || board.rows[i - 1].xp >= r.xp));
  check("A shows its X handle", board.rows.find((r: any) => r.wallet === A)?.x === "alice");

  // X shares: found by the nightly search, nothing pasted
  posts = [{ id: "111111", author: "Alice", at: clock - HOUR, reply: false }, { id: "222222", author: "alice", at: clock - 30_000, reply: false },
    { id: "333333", author: "bob", at: clock - HOUR, reply: false }];
  clock = Math.floor(clock / DAY) * DAY + 3 * HOUR;   // after 02:00 UTC
  await xp.shares();
  await xp.shares();
  check("the search runs once a day", searches === 1, String(searches));
  a = await prof(A);
  check("the linked account's post counts once: +20", a.sources.share === 20, JSON.stringify(a.sources));

  // the log
  await xp.snapshot();
  const lg = await xp.log(A) as any;
  const feed = lg.items.find((i: any) => i.source === "feed");
  check("log: the feed event with its tx", feed?.xp === 50 && /^0x[0-9a-f]{64}$/.test(feed.tx ?? ""), JSON.stringify(feed));
  check("log: the share with its post id", lg.items.some((i: any) => i.source === "share" && i.post === "111111"));
  check("log: holding as a daily row, marked as the history before the log", lg.items.some((i: any) => i.source === "hold" && i.before === true && i.xp > 0));
  check("log: newest first", lg.items.every((i: any, k: number) => k === 0 || lg.items[k - 1].at >= i.at));

  // the bell: the first run only remembers, later ones note level-ups and new one-off XP
  const notes = async (w: string) => (await pg.all<{ text: string }>("select text from mine.notices where wallet = ? order by id", w)).map((n) => n.text);
  check("no notes from the backfill", (await notes(A)).length === 0 && (await notes(D)).length === 0);
  log(cfg.breeder, blockAt(20, 1), [MERGE, `0x${num(5)}`, `0x${num(6)}`, topic(A)], num(0) + num(0) + num(0));
  await pg.run("update mine.xp_state set value = to_jsonb((select max(id) from mine.xp_events)) where key = 'notified_event'");
  head = blockAt(21) + 100;
  clock = timeAt(blockAt(21));
  await xp.tick();
  const an = await notes(A);
  check("a new breed: +500 XP note, and the level-up it caused", an.some((t) => /\+500 XP from breeding/.test(t)) && an.some((t) => /reached XP level/.test(t)), JSON.stringify(an));
  await xp.tick();
  check("nothing twice on the next tick", (await notes(A)).length === an.length);

  // giveaway rounds: the first opened on the first tick; XP earned since then ranks it
  const r1 = await xp.round(A) as any;
  check("round 1 is open and ranks XP earned in it", r1.round?.id === 1 && r1.rows.length > 0 && r1.rows.every((r: any, i: number) => i === 0 || r1.rows[i - 1].gain >= r.gain), JSON.stringify(r1.round));
  check("the team wallet isn't in the round", !r1.rows.some((r: any) => r.wallet === TEAM));
  clock = Date.parse("2026-11-08T17:05:00Z");
  await xp.rounds();
  const h = await xp.history() as any;
  check("Sunday: round 1 frozen with its standings", h.rounds.length === 1 && h.rounds[0].id === 1 && h.rounds[0].top.length > 0 && h.rounds[0].winners.length === 0);
  const r2 = await xp.round(null) as any;
  check("round 2 opens where round 1 ended, for 2 weeks", r2.round?.id === 2 && r2.round.starts === "2026-11-08T17:00:00.000Z" && r2.round.ends === "2026-11-22T17:00:00.000Z", JSON.stringify(r2.round));
  await xp.setRewards({ id: 1, winners: [{ wallet: A, reward: "500,000 $FLYAI" }], note: "First round" });
  const h2 = await xp.history() as any;
  check("the team's rewards show in the history", h2.rounds[0].winners[0]?.wallet === A && h2.rounds[0].winners[0].reward === "500,000 $FLYAI" && h2.rounds[0].note === "First round");
  let refused = 0;
  try { await xp.setRewards({ id: 2, winners: [{ wallet: A, reward: "x" }] }); } catch (e) { refused = (e as HttpError).status; }
  check("rewards only for an ended round", refused === 404);
  await xp.rounds();
  check("an open round isn't frozen twice", ((await xp.history()) as any).rounds.length === 1);

  // routes
  const res = {} as ServerResponse;
  sent.length = 0;
  await xp.route({ method: "GET" } as any, res, new URL(`http://x/api/xp/leaderboard?wallet=${A}`));
  check("GET /api/xp/leaderboard answers with my row", sent[0]?.status === 200 && sent[0].body.me?.wallet === A);
  sent.length = 0;
  await xp.route({ method: "GET" } as any, res, new URL(`http://x/api/xp/profile?wallet=${C}`));
  check("GET /api/xp/profile answers", sent[0]?.status === 200 && sent[0].body.wallet === C && typeof sent[0].body.level === "number");

  // ---- 2x windows: set by an admin, gains and losses doubled, a sell takes the bonus back ----
  {
    const pureB = { id: 1, from: 0, to: 1, mult: 2 };
    const r = boostResult(pureB, { gained: 100, deposited: 30, sold: 0, soldAfter: false, withdrawn: 0, depositsAll: 30 });
    check("pure: 2x doubles actions and deposits", r.bonus === 400 && r.penalty === 0 && !r.forfeited, JSON.stringify(r));
    const s = boostResult(pureB, { gained: 100, deposited: 0, sold: 50, soldAfter: false, withdrawn: 20, depositsAll: 10 });
    check("pure: a sell forfeits the bonus and costs 2x; a withdrawal costs 1x more deposit XP (capped at deposits)",
      s.bonus === 0 && s.forfeited && s.penalty === 2 * 50 + 10 * 10, JSON.stringify(s));
  }
  let body: any = {};
  const ADMIN = addr(0xad);
  const xp2 = createXp({ pg, chain, cfg, HttpError, now: () => clock, readJson: async () => body, admins: [ADMIN],
    adminOnly: () => { throw new HttpError(403, "no token"); }, send: (_r, status, b) => { sent.push({ status, body: b }); },
    sessionWallet: async () => session, search: null });
  const W0 = timeAt(blockAt(40)), W1 = timeAt(blockAt(41));
  const post = async (b: any) => { body = b; sent.length = 0; try { await xp2.route({ method: "POST" } as any, res, new URL("http://x/api/admin/xp/boost")); } catch (e) { return (e as HttpError).status; } return sent[0]?.status; };
  session = A;
  check("only admins set windows", await post({ from: new Date(W0).toISOString(), to: new Date(W1).toISOString(), mult: 2 }) === 403);
  session = ADMIN;
  check("a window can't start in the past", await post({ from: new Date(clock - DAY).toISOString(), to: new Date(clock).toISOString() }) === 400);
  check("mult is bounded", await post({ from: new Date(W0).toISOString(), to: new Date(W1).toISOString(), mult: 10 }) === 400);
  check("an admin wallet sets one", await post({ from: new Date(W0).toISOString(), to: new Date(W1).toISOString(), mult: 2, note: "Sunday" }) === 200
    && sent[0].body.next?.mult === 2);
  check("windows can't crowd each other", await post({ from: new Date(W1 + HOUR).toISOString(), to: new Date(W1 + 2 * HOUR).toISOString() }) === 400);
  sent.length = 0;
  await xp2.route({ method: "GET" } as any, res, new URL("http://x/api/xp/boost"));
  check("public: the next window, without the full list", sent[0]?.body.next?.from === new Date(W0).toISOString() && !("all" in sent[0].body));

  const F = addr(0xf1), G = addr(0xf2), H = addr(0xf3), I = addr(0xf4);
  const box = (n: number, w: string, amount: bigint) => { const tx = `0x${(++ix).toString(16).padStart(64, "0")}`; send(n, POOL, w, amount, tx); send(n, w, cfg.feeTo, amount / 400n, tx); };
  box(blockAt(39), F, 1_000_000n * E18);                  // before the window: 1x
  box(blockAt(40, 2), F, 1_000_000n * E18);               // in it: +100 bonus
  box(blockAt(40, 3), G, 1_000_000n * E18);
  send(blockAt(42), G, POOL, 500_000n * E18);             // G sells a day after: bonus gone, no extra cost
  box(blockAt(40, 4), H, 1_000_000n * E18);
  send(blockAt(40, 5), H, POOL, 500_000n * E18);          // H sells inside: bonus gone, and 2 x 50 XP
  send(blockAt(44), F, POOL, 1n * E18);                   // F sells after the 3 days: keeps it
  await pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, usd, at) values ('0xw2', 'robinhood', 'deposit', ?, 30, ?),
    ('0xw', 'robinhood', 'withdraw', ?, 20, ?)`, I, new Date(W0 + HOUR).toISOString(), B, new Date(W0 + 2 * HOUR).toISOString());
  await pg.run("insert into mine.vault_ledger (wallet, chain, holder, principal_usd) values ('0xw2', 'robinhood', ?, 30)", I);
  const bBefore = (await prof(B)).sources;
  head = blockAt(40, 6) + 100;
  clock = timeAt(blockAt(40, 6));
  await xp2.tick();
  const live = (await xp2.boostsNow()).live;
  check("live now", live?.mult === 2);
  check("a bell note when it opens", (await notes(A)).some((t) => /2x XP is on/.test(t)));
  head = blockAt(45) + 100;
  clock = timeAt(blockAt(45));
  await xp2.tick();
  const f = await prof(F), g = await prof(G), hh = await prof(H), i = await prof(I), bb = await prof(B);
  check("F: the buy in the window earned 2x (+100 bonus); a sell 3+ days later keeps it", f.sources.buy === 200 && f.sources.boost === 100, JSON.stringify(f.sources));
  check("G: a sell within 3 days after takes the bonus back", g.sources.buy === 100 && !g.sources.boost && !g.sources.penalty, JSON.stringify(g.sources));
  check("H: a sell inside loses the bonus and costs 2x (2 x 50)", !hh.sources.boost && hh.sources.penalty === -100, JSON.stringify(hh.sources));
  check("I: a deposit in the window counts 2x", i.sources.deposits === 300 && i.sources.boost === 300, JSON.stringify(i.sources));
  check("B: a withdrawal in the window costs 10 XP per $ more", bb.sources.penalty === -200 && (bb.sources.deposits ?? 0) <= (bBefore.deposits ?? 0), JSON.stringify(bb.sources));
  check("the profile lists the window's result", f.boosts?.[0]?.bonus === 100 && hh.boosts?.[0]?.forfeited === true, JSON.stringify(hh.boosts));
  const flog = await xp2.log(F) as any;
  check("log: the buy inside is marked 2x, the one before isn't", flog.items.filter((x: any) => x.source === "buy").map((x: any) => x.boost).sort().join() === "2,", JSON.stringify(flog.items.filter((x: any) => x.source === "buy")));
  check("XP never below zero", (await xp2.compute()).ranked.every((r) => r.xp >= 0));
  session = ADMIN;
  check("a started window can't be deleted", await post({ id: 1, delete: true }) === 400);

  // ---- XP for bug finds (2026-11-08): an admin gives it by hand; not daily, not boosted ----
  const bug = async (b: any, method = "POST") => { body = b; sent.length = 0;
    try { await xp2.route({ method } as any, res, new URL("http://x/api/admin/xp/bug")); } catch (e) { return (e as HttpError).status; } return sent[0]?.status; };
  const J = addr(0xb7);
  session = A;
  check("bug XP: admins only", await bug({ wallet: J, xp: 500 }) === 403);
  session = ADMIN;
  check("bug XP: a bad wallet or amount is refused", await bug({ wallet: "0x12", xp: 500 }) === 400 && await bug({ wallet: J, xp: 0 }) === 400
    && await bug({ wallet: J, xp: 1_000_000 }) === 400);
  check("bug XP: given", await bug({ wallet: J, xp: 500, note: "sold-fly perps holder" }) === 200
    && sent[0].body.grants[0].wallet === J && sent[0].body.grants[0].note === "sold-fly perps holder" && sent[0].body.grants[0].by_wallet === ADMIN);
  const bugId = sent[0].body.grants[0].id;
  await bug({ wallet: J, xp: 250 });
  const jp = async () => (await xp2.profile(J) as any).sources;
  check("bug XP: counts as its own source", (await jp()).bug === 750, JSON.stringify(await jp()));
  const jlog = await xp2.log(J) as any;
  check("bug XP: one line per find in the log, no note there", jlog.items.filter((x: any) => x.source === "bug").length === 2
    && !JSON.stringify(jlog).includes("sold-fly"), JSON.stringify(jlog.items));
  check("bug XP: removable", await bug({ remove: bugId }) === 200 && (await jp()).bug === 250);
  check("bug XP: the list", await bug(null, "GET") === 200 && sent[0].body.grants.length === 1);

  // ---- a fly funded only on Solana (2026-11-08): its 'sol_deposit' counts, kept by its Solana principal ----
  const K = addr(0xb8);
  await pg.run(`insert into mine.vault_moves (wallet, chain, kind, holder, usd, at) values ('0xw9', 'solana', 'sol_deposit', ?, 50, ?)`, K, new Date(clock - HOUR).toISOString());
  await pg.run(`insert into mine.vault_public (key, value) values ('vault:solana:0xw9', ?::text::jsonb)`, JSON.stringify({ holder: K, principal: 50 }));
  clock += 120_000;                                       // (past the 60 s board cache)
  const kp = await xp2.profile(K) as any;
  check("Solana-only fly: its deposit earns deposit XP", kp.sources?.deposits === 500, JSON.stringify(kp.sources));
} finally {
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
