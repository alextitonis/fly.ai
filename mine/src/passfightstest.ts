/**
 * Robot Fights on the FlightPass (src/passfights.ts): the fight decoder against the live FightPools on Robinhood Chain,
 * the payout split for every outcome, and the pick (Jev with a stubbed OpenRouter, its fallback, favourite, underdog).
 *
 *   npm run test:passfights          (reads the live contract; FIGHTS_TEST_OFFLINE=1 skips that part)
 */
import assert from "node:assert/strict";
import { createPassFights, decodeFight, decodeUints, payoutMult, splitPay, valuePick, type Fight } from "./passfights.ts";
import { rpc } from "./orders.ts";
import { selector } from "./staking.ts";

const POOLS = "0xB0622a9500c00dE5F9978732146F08F85001651b";
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const e18 = 10n ** 18n;
let n = 0;
const test = async (name: string, fn: () => unknown) => { await fn(); n++; console.log(`ok ${name}`); };

// ---- the split -------------------------------------------------------------------------------------------
const SETTLED = 2, CANCELLED = 3;
await test("winners share by stake, losers get 0", () => {
  // pots 600 on side 0, 400 on side 1; the wallet's 300 on side 0 paid 300 * 950 / 600 = 475
  const got = splitPay([{ amount: 100n * e18, side: 0 }, { amount: 200n * e18, side: 0 }, { amount: 50n * e18, side: 1 }],
    { status: SETTLED, winner: 0, pots: [600n * e18, 400n * e18] }, 475n * e18);
  assert.deepEqual(got, [475n * e18 / 3n, 475n * e18 * 2n / 3n, 0n]);
  assert.ok(got[0] + got[1] <= 475n * e18);
});
await test("a refunded pot (nobody against the winner) gives everyone their stake share", () => {
  const got = splitPay([{ amount: 100n, side: 0 }, { amount: 300n, side: 0 }], { status: SETTLED, winner: 0, pots: [400n, 0n] }, 400n);
  assert.deepEqual(got, [100n, 300n]);
});
await test("a refunded pot (nobody on the winner) refunds the losers too", () => {
  const got = splitPay([{ amount: 100n, side: 0 }], { status: SETTLED, winner: 1, pots: [100n, 0n] }, 100n);
  assert.deepEqual(got, [100n]);
});
await test("a cancelled fight refunds every bet", () => {
  const got = splitPay([{ amount: 70n, side: 0 }, { amount: 30n, side: 1 }], { status: CANCELLED, winner: 0, pots: [70n, 30n] }, 100n);
  assert.deepEqual(got, [70n, 30n]);
});
await test("all passes on the loser: everyone 0", () => {
  assert.deepEqual(splitPay([{ amount: 5n, side: 1 }], { status: SETTLED, winner: 0, pots: [10n, 5n] }, 0n), [0n]);
});

// ---- the pick ---------------------------------------------------------------------------------------------
const fight: Fight = { id: 7, title: "REK test: A vs B", sides: ["A", "B"], closeAt: Math.floor(Date.now() / 1000) + 3600, status: 1, winner: 0, feeBps: 500, pots: [300n * e18, 100n * e18] };
const stake = 10n * e18;
let lastState: any = null;
const make = (env: Record<string, string>, answers?: Record<string, { noul: number }>, fail = false) => createPassFights({
  pg: null as never, book: null as never, balanceOf: null as never, payer: { address: "0x" + "11".repeat(20), send: async () => "0x" },
  rpcUrl: RPC, token: FLYAI, env: { FIGHTPOOLS: POOLS, ...env } as NodeJS.ProcessEnv,
  toWei: (s) => BigInt(Math.round(Number(s) * 1e6)) * 10n ** 12n, fromWei: (w) => String(Number(w) / 1e18),
  fetch: (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    lastState = body.state;
    assert.equal(body.model, "typesafe/jev-1.13");
    assert.deepEqual(Object.keys(body.questions), ["win_0", "win_1"]);
    assert.deepEqual(body.state.fighters, ["A", "B"]);
    if (fail) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify({ answers }), { status: 200 });
  }) as never,
});
await test("payout after our stake, and none while nobody is against us", () => {
  // 300 vs 100, +10 on B: (410 x 0.95) / 110 = 3.54x; +10 on A: 410 x 0.95 / 310 = 1.256x
  assert.ok(Math.abs(payoutMult(fight, 1, stake)! - 3.5409) < 1e-3);
  assert.ok(Math.abs(payoutMult(fight, 0, stake)! - 1.2565) < 1e-3);
  assert.equal(payoutMult({ pots: [100n, 0n], feeBps: 500 }, 0, 10n), null);
});
await test("value pick: equal chances back the better price; a sub-1.1x side is never picked", () => {
  assert.deepEqual(valuePick(fight, [0.5, 0.5], stake, 1.1, 1.05)?.side, 1);
  // the crowd's 0.96x favourite of 2026-10-08: 1,000 vs 10, +10 on it pays 0.959x
  assert.equal(valuePick({ pots: [1000n * e18, 10n * e18], feeBps: 500 }, [1, 0], stake, 1.1, 1.05), null);
  // a strong view wins over a better price only when chance x payout says so
  assert.deepEqual(valuePick(fight, [0.95, 0.05], stake, 1.1, 1.05)?.side, 0);
});
await test("AI pick: Jev's own chances (no pot shares sent), by value", async () => {
  const pf = make({ OPENROUTER_API_KEY: "k" }, { win_0: { noul: 0.31 }, win_1: { noul: 0.69 } });
  assert.deepEqual(await pf.pickSide(fight, "jev", stake), { side: 1, by: "jev" });
  assert.equal(JSON.stringify(lastState).includes("crowd"), false);
});
await test("AI pick with Jev failing or no key: equal chances, by value", async () => {
  assert.deepEqual(await make({ OPENROUTER_API_KEY: "k" }, undefined, true).pickSide({ ...fight, id: 8 }, "jev", stake), { side: 1, by: "value" });
  assert.deepEqual(await make({}).pickSide(fight, "jev", stake), { side: 1, by: "value" });
});
await test("AI pick skips a fight with nothing worth backing", async () => {
  const pf = make({ OPENROUTER_API_KEY: "k" }, { win_0: { noul: 1 }, win_1: { noul: 0 } });
  assert.equal(await pf.pickSide({ ...fight, id: 9, pots: [100n * e18, 0n] }, "jev", stake), null);
});
await test("favourite and underdog by the FLYAI pot, never under 1.1x", async () => {
  const pf = make({});
  assert.deepEqual(await pf.pickSide(fight, "favourite", stake), { side: 0, by: "favourite" });
  assert.deepEqual(await pf.pickSide(fight, "underdog", stake), { side: 1, by: "underdog" });
  assert.equal(await pf.pickSide({ ...fight, pots: [1000n * e18, 10n * e18] }, "favourite", stake), null);
});

// ---- the live contract -----------------------------------------------------------------------------------
if (!process.env.FIGHTS_TEST_OFFLINE) {
  await test("decodes the live fights", async () => {
    const word = (x: number) => x.toString(16).padStart(64, "0");
    const count = Number(BigInt(await rpc(RPC, "eth_call", [{ to: POOLS, data: selector("fightCount()") }, "latest"]) as string));
    assert.ok(count >= 3);
    const f0 = decodeFight(await rpc(RPC, "eth_call", [{ to: POOLS, data: selector("getFight(uint256)") + word(0) }, "latest"]) as string);
    assert.equal(f0.title, "REK Deathmatch · Main event: Rektile vs T-REK");
    assert.deepEqual(f0.sides, ["Rektile", "T-REK"]);
    assert.equal(f0.closeAt, 1791601200);
    assert.equal(f0.feeBps, 500);
    const f1 = decodeFight(await rpc(RPC, "eth_call", [{ to: POOLS, data: selector("getFight(uint256)") + word(1) }, "latest"]) as string);
    assert.deepEqual(f1.sides, ["Red corner", "Blue corner"]);
    const pots = decodeUints(await rpc(RPC, "eth_call", [{ to: POOLS, data: selector("pools(uint256,address)") + word(0) + FLYAI.slice(2).toLowerCase().padStart(64, "0") }, "latest"]) as string);
    assert.equal(pots.length, 2);
    const all = await make({}).fights();
    assert.equal(all.length, count);
    assert.deepEqual(all[0].pots, pots.length ? all[0].pots : pots);
  });
}
console.log(`${n} passed`);
