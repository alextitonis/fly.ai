/**
 * Robot Fights on the FlightPass autopilot (2026-10-08, the user: "add option to bet in the flight pass", "it can use
 * JEV to choose for whom to bet"). FightPools (flytrade/contracts/src/FightPools.sol, flytrade/FIGHTS.md) is on chain;
 * a pass's FLYAI is here, in the ledger. So the pass bets through the FlightPass payout wallet (the same hot wallet and
 * nonce queue as withdrawals):
 *
 * - Every open fight, once per pass, while betting is open for at least FIGHTS_PASS_LEAD_MIN more minutes: the stake
 *   leaves the pass as a `bet` row (tx fight-bet:<fight>:<side>:<by>:<ref>), then the payout wallet bets it on chain.
 *   Nothing left the wallet (an unsent error): the stake is booked back at once (fight-pay:<ref>, kind payout).
 * - The side: Jev (typesafe/jev through OpenRouter's Decisions API, as the desk asks it about tokens: "will <fighter>
 *   win?" for every fighter, the most likely one), the favourite (the bigger FLYAI pot) or the underdog. Without
 *   OPENROUTER_API_KEY, or when Jev doesn't answer, "jev" falls back to the favourite, and the bet records which.
 * - Settled or cancelled on chain: the payout wallet claims, and each pass's bet gets its share of what the payout
 *   wallet's stakes paid (winners pro rata, a refunded or cancelled pot back in full) as a `payout` row
 *   fight-pay:<ref>; a losing bet gets a 0 row, so every bet is closed exactly once (the ledger's tx is unique).
 *   What the wallet's stakes paid is read from the contract (stakes, pots, fee), so it is the same before and after
 *   its claim and after a restart.
 *
 * Off until FIGHTPOOLS is set and the payout wallet exists.
 */
import { randomUUID } from "node:crypto";
import { lockWallet, type Pg, type Q } from "./pg.ts";
import { selector } from "./staking.ts";
import { rpc } from "./orders.ts";
import { checksumAddress } from "./wallet.ts";

export interface FightPayer {
  address: string;
  send: (to: string, data: string) => Promise<string>;
}

export interface PassFightsDeps {
  pg: Pg;
  book: (q: Q, wallet: string, orderId: string | null, kind: string, amount: bigint, extra?: { tx?: string }) => Promise<void>;
  balanceOf: (q: Q, wallet: string) => Promise<bigint>;
  payer: FightPayer | null;
  rpcUrl: string;
  /** the FLYAI token: passes bet FLYAI only */
  token: string;
  env: NodeJS.ProcessEnv;
  toWei: (s: string) => bigint;
  fromWei: (w: bigint) => string;
  /** OpenRouter (tests stub it) */
  fetch?: typeof fetch;
}

export type FightPick = "jev" | "favourite" | "underdog";
export interface FightSettings { on: boolean; stake: string; pick: FightPick }
export const FIGHTS_OFF = (): FightSettings => ({ on: false, stake: "0", pick: "jev" });
export const FIGHT_PICKS: FightPick[] = ["jev", "favourite", "underdog"];

const OPEN = 1, SETTLED = 2, CANCELLED = 3;
const SEL = {
  fightCount: selector("fightCount()"),
  getFight: selector("getFight(uint256)"),
  pools: selector("pools(uint256,address)"),
  stakes: selector("stakes(uint256,address,address)"),
  poolTotal: selector("poolTotal(uint256,address)"),
  feeTaken: selector("feeTaken(uint256,address)"),
  claimed: selector("claimed(uint256,address,address)"),
  bet: selector("bet(uint256,uint256,address,uint256)"),
  claim: selector("claim(uint256)"),
  allowance: selector("allowance(address,address)"),
  approve: selector("approve(address,uint256)"),
  balanceOf: selector("balanceOf(address)"),
};
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const addr = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
const MAX = (1n << 256n) - 1n;

export interface Fight { id: number; title: string; sides: string[]; closeAt: number; status: number; winner: number; feeBps: number; pots: bigint[] }

/** getFight's return: one dynamic tuple (string title, string[] sides, uint64, uint8, uint8, uint16). */
export function decodeFight(hex: string): Omit<Fight, "id" | "pots"> {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const w = (byte: number) => BigInt(`0x${h.slice(byte * 2, byte * 2 + 64)}`);
  const str = (byte: number) => {
    const len = Number(w(byte));
    return Buffer.from(h.slice((byte + 32) * 2, (byte + 32 + len) * 2), "hex").toString("utf8");
  };
  const t = Number(w(0));                       // the tuple's offset
  const title = str(t + Number(w(t)));
  const arr = t + Number(w(t + 32));
  const n = Number(w(arr));
  const sides = Array.from({ length: n }, (_, i) => str(arr + 32 + Number(w(arr + 32 + i * 32))));
  return { title, sides, closeAt: Number(w(t + 64)), status: Number(w(t + 96)), winner: Number(w(t + 128)), feeBps: Number(w(t + 160)) };
}
/** a uint256[] return */
export function decodeUints(hex: string): bigint[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const w = (byte: number) => BigInt(`0x${h.slice(byte * 2, byte * 2 + 64)}`);
  const at = Number(w(0)), n = Number(w(at));
  return Array.from({ length: n }, (_, i) => w(at + 32 + i * 32));
}

/**
 * What each pass bet on fight `f` gets of `paid` (what the payout wallet's stakes returned): a cancelled fight or a
 * refunded pot (nobody on the winner, or nobody against it) gives every bet its share by stake; otherwise only the
 * winner's bets share it, by stake, and the rest get 0. Rounded down: dust stays in the payout wallet.
 */
export function splitPay(bets: { amount: bigint; side: number }[], f: Pick<Fight, "status" | "winner" | "pots">, paid: bigint): bigint[] {
  const total = f.pots.reduce((a, b) => a + b, 0n);
  const refunded = f.status === CANCELLED || f.pots[f.winner] === 0n || f.pots[f.winner] === total;
  const weight = (b: { amount: bigint; side: number }) => refunded || b.side === f.winner ? b.amount : 0n;
  const all = bets.reduce((a, b) => a + weight(b), 0n);
  return bets.map((b) => (all > 0n ? (weight(b) * paid) / all : 0n));
}

export function createPassFights(d: PassFightsDeps) {
  const { pg, book, toWei, fromWei } = d;
  const CFG = {
    contract: d.env.FIGHTPOOLS ? checksumAddress(d.env.FIGHTPOOLS) : null,
    minBet: toWei(d.env.FIGHTS_PASS_MIN ?? "100"),
    maxBet: toWei(d.env.FIGHTS_PASS_MAX ?? "100000"),
    /** no pass bet in a fight's last minutes: the chain could close it before the transaction lands */
    leadMs: Number(d.env.FIGHTS_PASS_LEAD_MIN ?? "5") * 60_000,
    jevKey: d.env.OPENROUTER_API_KEY ?? "",
    jevModel: d.env.FIGHTS_JEV_MODEL ?? "typesafe/jev-1.13",
  };
  const on = !!CFG.contract && !!d.payer;
  const doFetch = d.fetch ?? fetch;
  const call = (data: string, to = CFG.contract!) => rpc(d.rpcUrl, "eth_call", [{ to, data }, "latest"]) as Promise<string>;

  // ---- the chain -----------------------------------------------------------------------------------------
  async function fight(id: number): Promise<Fight> {
    const f = decodeFight(await call(SEL.getFight + word(id)));
    return { id, ...f, pots: decodeUints(await call(SEL.pools + word(id) + addr(d.token))) };
  }
  let cache: { at: number; list: Fight[] } | null = null;
  /** every fight, at most every 30 s */
  async function fights(): Promise<Fight[]> {
    if (cache && Date.now() - cache.at < 30_000) return cache.list;
    const n = Number(BigInt(await call(SEL.fightCount)));
    const list: Fight[] = [];
    for (let i = 0; i < n; i++) list.push(await fight(i));
    cache = { at: Date.now(), list };
    return list;
  }
  const bettable = (f: Fight) => f.status === OPEN && f.closeAt * 1000 - Date.now() > CFG.leadMs;

  // ---- the pick ------------------------------------------------------------------------------------------
  const jevAnswers = new Map<number, { side: number; p: number[]; at: number }>();
  /** Jev's most likely winner of a fight (cached per fight for 6 hours), or null when it can't be asked */
  async function askJev(f: Fight): Promise<{ side: number; p: number[] } | null> {
    if (!CFG.jevKey) return null;
    const had = jevAnswers.get(f.id);
    if (had && Date.now() - had.at < 6 * 3_600_000) return had;
    const total = f.pots.reduce((a, b) => a + b, 0n);
    const state = {
      event: f.title,
      sport: "humanoid robot fighting (REK, San Francisco): human pilots control humanoid robots in real time; three 2-minute rounds, knockouts or points",
      fighters: f.sides,
      crowd_share_of_flyai_pot: f.sides.map((s, i) => ({ fighter: s, share: total > 0n ? Number((f.pots[i] * 10_000n) / total) / 10_000 : null })),
      betting_closes_at: new Date(f.closeAt * 1000).toISOString(),
    };
    const questions = Object.fromEntries(f.sides.map((s, i) => [`win_${i}`, {
      type: "noul", instructions: `Will ${s} win this fight?`, criteria: { true: `${s} wins`, false: `${s} does not win` },
    }]));
    try {
      const r = await doFetch("https://openrouter.ai/api/alpha/decisions", {
        method: "POST", headers: { Authorization: `Bearer ${CFG.jevKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: CFG.jevModel, state, questions }), signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { answers?: Record<string, { noul?: number }> };
      const p = f.sides.map((_, i) => Number(j.answers?.[`win_${i}`]?.noul));
      if (p.some((x) => !Number.isFinite(x))) throw new Error("no probabilities in the answer");
      const side = p.indexOf(Math.max(...p));
      const ans = { side, p, at: Date.now() };
      jevAnswers.set(f.id, ans);
      console.log(`robot fights: Jev picks ${f.sides[side]} in fight ${f.id} (${p.map((x) => x.toFixed(2)).join(" / ")})`);
      return ans;
    } catch (err) {
      console.error(`robot fights: Jev didn't answer for fight ${f.id}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
  /** the favourite (the biggest FLYAI pot; the first fighter while it's even) or the underdog (the smallest) */
  const byPot = (f: Fight, fav: boolean) => f.pots.reduce((best, v, i) => (fav ? v > f.pots[best] : v < f.pots[best]) ? i : best, 0);
  async function pickSide(f: Fight, mode: FightPick): Promise<{ side: number; by: string }> {
    if (mode === "jev") {
      const j = await askJev(f);
      if (j) return { side: j.side, by: "jev" };
      return { side: byPot(f, true), by: "favourite" };
    }
    return { side: byPot(f, mode === "favourite"), by: mode };
  }

  // ---- betting -------------------------------------------------------------------------------------------
  const key = (id: number) => `pass:${id}`;
  const betOf = (pass: number, fightId: number, q: Q = pg) =>
    q.one<{ tx: string }>("select tx from mine.ledger where wallet = ? and tx like ?", key(pass), `fight-bet:${fightId}:%`);
  let approved = false;
  async function ensureApproved(amount: bigint) {
    if (approved) return;
    const have = BigInt(await call(SEL.allowance + addr(d.payer!.address) + addr(CFG.contract!), d.token));
    if (have < amount) await d.payer!.send(d.token, SEL.approve + addr(CFG.contract!) + word(MAX));
    approved = true;
  }

  /**
   * The pass bets on every open fight it hasn't bet on yet. verify(): the owner and listing right before money
   * moves. Returns the fights it bet on.
   */
  async function autoBet(pass: number, s: FightSettings, verify: () => Promise<boolean>): Promise<number[]> {
    if (!on || !s.on) return [];
    const stake = toWei(s.stake);
    if (stake < CFG.minBet || stake > CFG.maxBet) return [];
    const done: number[] = [];
    for (const f of await fights()) {
      if (!bettable(f) || await betOf(pass, f.id)) continue;
      if ((await d.balanceOf(pg, key(pass))) < stake) break;
      // the payout wallet carries the bet: it needs the FLYAI now (it comes back when the fight is settled)
      const float = BigInt(await call(SEL.balanceOf + addr(d.payer!.address), d.token));
      if (float < stake) { console.log(`robot fights: payout wallet has ${fromWei(float)} FLYAI, pass ${pass} waits`); break; }
      if (!(await verify())) break;
      const { side, by } = await pickSide(f, s.pick);
      const ref = randomUUID();
      let booked = false;
      await pg.tx(async (q) => {
        if (await betOf(pass, f.id, q)) return;                       // a tick that overlapped
        if ((await d.balanceOf(q, key(pass))) < stake) return;
        await book(q, key(pass), null, "bet", stake, { tx: `fight-bet:${f.id}:${side}:${by}:${ref}` });
        booked = true;
      }, lockWallet(key(pass)));
      if (!booked) continue;
      try {
        await ensureApproved(stake);
        const tx = await d.payer!.send(CFG.contract!, SEL.bet + word(f.id) + word(side) + addr(d.token) + word(stake));
        console.log(`robot fights: pass ${pass} bet ${fromWei(stake)} FLYAI on ${f.sides[side]} in fight ${f.id} (${by}, ${tx})`);
        cache = null;
        done.push(f.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if ((err as { unsent?: boolean; reverted?: boolean }).unsent || (err as { reverted?: boolean }).reverted) {
          // nothing left the wallet: the stake goes straight back on the pass
          await pg.tx(async (q) => { await book(q, key(pass), null, "payout", stake, { tx: `fight-pay:${ref}` }); }, lockWallet(key(pass)));
          console.error(`robot fights: pass ${pass} bet on fight ${f.id} not sent, stake back: ${msg}`);
        } else {
          // it may be on chain: settle() pays it like any other bet (its share of what the wallet's stakes paid)
          console.error(`robot fights: pass ${pass} bet on fight ${f.id} may have been sent: ${msg}`);
        }
        break;
      }
    }
    return done;
  }

  // ---- settling ------------------------------------------------------------------------------------------
  /** what the payout wallet's stakes in fight `f` pay in FLYAI, from the contract (the same before and after its claim) */
  async function walletReturn(f: Fight): Promise<bigint> {
    const mine = decodeUints(await call(SEL.stakes + word(f.id) + addr(d.token) + addr(d.payer!.address)));
    const all = mine.reduce((a, b) => a + b, 0n);
    if (f.status === CANCELLED) return all;
    const total = BigInt(await call(SEL.poolTotal + word(f.id) + addr(d.token)));
    const won = f.pots[f.winner];
    if (won === 0n || won === total) return all;                       // a refunded pot
    if (mine[f.winner] === 0n) return 0n;
    const fee = BigInt(await call(SEL.feeTaken + word(f.id) + addr(d.token)));
    return (mine[f.winner] * (total - fee)) / won;
  }

  let settling = false;
  /** Every pass bet on a fight that is settled or cancelled gets its share (once); the payout wallet claims first. */
  async function settle(): Promise<void> {
    if (!on || settling) return;
    settling = true;
    try {
      const open = await pg.all<{ wallet: string; amount_wei: string; tx: string }>(`select wallet, amount_wei, tx from mine.ledger l
        where wallet like 'pass:%' and tx like 'fight-bet:%'
        and not exists (select 1 from mine.ledger p where p.tx = 'fight-pay:' || split_part(l.tx, ':', 5))`);
      const byFight = new Map<number, typeof open>();
      for (const r of open) {
        const id = Number(r.tx.split(":")[1]);
        byFight.set(id, [...(byFight.get(id) ?? []), r]);
      }
      for (const [id, bets] of byFight) {
        const f = await fight(id);
        if (f.status !== SETTLED && f.status !== CANCELLED) continue;
        const paid = await walletReturn(f);
        const claimed = BigInt(await call(SEL.claimed + word(id) + addr(d.payer!.address) + addr(d.token))) !== 0n;
        if (paid > 0n && !claimed) {
          try {
            await d.payer!.send(CFG.contract!, SEL.claim + word(id));
            console.log(`robot fights: claimed fight ${id} for the passes (${fromWei(paid)} FLYAI)`);
          } catch (err) {
            console.error(`robot fights: claim of fight ${id} failed, retrying next tick: ${err instanceof Error ? err.message : err}`);
            continue;
          }
        }
        const shares = splitPay(bets.map((b) => ({ amount: BigInt(b.amount_wei), side: Number(b.tx.split(":")[2]) })), f, paid);
        for (const [i, b] of bets.entries()) {
          const share = shares[i];
          const ref = b.tx.split(":")[4];
          await pg.tx(async (q) => {
            if (await q.one("select 1 from mine.ledger where tx = ?", `fight-pay:${ref}`)) return;
            await book(q, b.wallet, null, "payout", share, { tx: `fight-pay:${ref}` });
          }, lockWallet(b.wallet));
        }
        console.log(`robot fights: fight ${id} ${f.status === CANCELLED ? "cancelled" : `won by ${f.sides[f.winner]}`}: ${bets.length} pass bets settled`);
      }
    } finally {
      settling = false;
    }
  }

  // ---- the pass page -------------------------------------------------------------------------------------
  /** Why the autopilot is or isn't betting on fights, and the pass's fight bets (newest first). */
  async function status(pass: number, s: FightSettings, isListed: boolean) {
    const bets = (await pg.all<{ amount_wei: string; tx: string; at: number }>(
      "select amount_wei, tx, at from mine.ledger where wallet = ? and tx like 'fight-bet:%' order by id desc limit 20", key(pass)));
    const pays = new Map((await pg.all<{ amount_wei: string; tx: string }>(
      "select amount_wei, tx from mine.ledger where wallet = ? and tx like 'fight-pay:%'", key(pass))).map((r) => [r.tx.slice(10), BigInt(r.amount_wei)]));
    const list = await fights().catch(() => [] as Fight[]);
    const history = bets.map((b) => {
      const [, fid, side, by, ref] = b.tx.split(":");
      const f = list.find((x) => x.id === Number(fid));
      const pay = pays.get(ref);
      return { fight: Number(fid), title: f?.title ?? null, side: f?.sides[Number(side)] ?? `#${side}`, by, stake: fromWei(BigInt(b.amount_wei)),
               payout: pay === undefined ? null : fromWei(pay), at: b.at };
    });
    const openNow = list.filter(bettable);
    let state: string;
    if (!on) state = "unavailable";
    else if (!s.on) state = "off";
    else if (isListed) state = "listed";
    else {
      const stake = toWei(s.stake);
      if (stake < CFG.minBet || stake > CFG.maxBet) state = "stake";
      else if (!openNow.length) state = "no_fights";
      else if ((await d.balanceOf(pg, key(pass))) < stake) state = "low_balance";
      else state = "waiting";
    }
    return { state, min: fromWei(CFG.minBet), max: fromWei(CFG.maxBet), open_fights: openNow.length, jev: !!CFG.jevKey, bets: history };
  }

  return { on, CFG, fights, autoBet, settle, status, pickSide, decodeFight };
}
