/**
 * Fly Boxes prize sender (src/boxprizes.ts) against a real Postgres, with a fake chain: Opened events are scanned
 * once, other-chain NFTs go to the box's holder in load order, WL spots are recorded, nothing is sent twice, and a
 * contract holder / a prize the wallet doesn't hold / a failed send are handled.
 *   npm run test:boxprizes
 */
import { startPg } from "./pgtest.ts";
import { createBoxPrizes, decodeOpened, OPENED } from "./boxprizes.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const BOXES = "0x" + "b0".repeat(20), PRIZE = "0x" + "e1".repeat(20), RUYUI = "0x" + "a1".repeat(20);
const ALICE = "0x" + "a".repeat(40), BOB = "0x" + "b".repeat(40), SAFE = "0x" + "5".repeat(40), FLY = "0x" + "f".repeat(40);
const w = (v: bigint | string) => (typeof v === "bigint" ? v.toString(16) : v.replace(/^0x/, "")).padStart(64, "0");

function openedLog(id: number, tier: number, holder: string, to: string, offchain: string, block: number) {
  const s = Buffer.from(offchain, "utf8").toString("hex");
  const padded = s.length ? s.padEnd(Math.ceil(s.length / 64) * 64, "0") : "";
  const data = "0x" + [BigInt(tier), 0n, 0n, 0n, 0n, 0n, 224n].map((x) => w(x)).join("") + w(BigInt(s.length / 2)) + padded;
  return { topics: [OPENED, "0x" + w(BigInt(id)), "0x" + w(holder), "0x" + w(to)], data,
    transactionHash: "0x" + w(BigInt(id)), blockNumber: "0x" + block.toString(16) };
}

const o = decodeOpened(openedLog(42, 2, ALICE, FLY, "Ruyui NFT (sent on Ethereum)", 100));
check("decodeOpened reads id, tier, holder, to and the label",
  o.box_id === 42 && o.tier === 2 && o.holder === ALICE && o.sent_to === FLY && o.offchain === "Ruyui NFT (sent on Ethereum)", JSON.stringify(o));

// the fake chains
let head = 200;
const logs = [
  openedLog(1, 9, BOB, BOB, "", 110),                                       // a tier with no items (paid on chain): ignored
  openedLog(2, 2, ALICE, FLY, "Ruyui NFT (sent on Ethereum)", 120),         // -> ruyui #7 to ALICE (the holder, not the fly)
  openedLog(3, 5, BOB, BOB, "Bad Bunnz mint WL", 130),                      // -> WL spot
  openedLog(4, 2, SAFE, SAFE, "Ruyui NFT (sent on Ethereum)", 140),         // -> ruyui #9, but SAFE is a contract: failed
];
const owners = new Map<string, string>([["7", PRIZE], ["9", PRIZE], ["11", BOB]]);
const rh = async (method: string, params: any[]) => {
  if (method === "eth_blockNumber") return "0x" + head.toString(16);
  if (method === "eth_getLogs") {
    const f = Number(params[0].fromBlock), t = Number(params[0].toBlock);
    return logs.filter((l) => Number(l.blockNumber) >= f && Number(l.blockNumber) <= t);
  }
  throw new Error(method);
};
const eth = async (method: string, params: any[]) => {
  if (method === "eth_getCode") return params[0] === SAFE ? "0x6080" : "0x";
  if (method === "eth_call") return "0x" + w(owners.get(BigInt("0x" + params[0].data.slice(10)).toString()) ?? "0x" + "0".repeat(40));
  throw new Error(method);
};
const sends: { to: string; data: string }[] = [];
let failNext: "unsent" | "maybe" | null = null;
const sender = {
  address: PRIZE,
  async send(to: string, data: string) {
    if (failNext === "unsent") { failNext = null; throw Object.assign(new Error("nonce too low"), { unsent: true }); }
    if (failNext === "maybe") { failNext = null; throw new Error("connection dropped"); }
    sends.push({ to, data });
    owners.set(BigInt("0x" + data.slice(-64)).toString(), "0x" + data.slice(-104, -64));
    return "0x" + w(BigInt(sends.length));
  },
};

const { pg, stop } = await startPg(8851);
try {
  const bp = createBoxPrizes({
    pg, send: () => {}, readJson: async () => ({}), isAdmin: () => true,
    boxes: BOXES, fromBlock: 100, rh, chains: { ethereum: eth }, senders: { ethereum: sender, berachain: null },
  });
  const add = await bp.addItems({ tier: 2, chain: "ethereum", collection: RUYUI, ids: [7, 9, 11], label: "Ruyui" });
  check("items load; one the prize wallet doesn't hold is warned about",
    add.added === 3 && add.warnings.length === 1 && add.warnings[0].includes("#11"), JSON.stringify(add));
  await bp.addItems({ tier: 5, wl: "Bad Bunnz mint WL", count: 5 });

  check("scan finds the 4 opened boxes", (await bp.scan()) === 4);
  check("a second scan finds nothing new", (await bp.scan()) === 0);
  check("assign: the 3 boxes of tiers with items", (await bp.assign()) === 3);
  const items = await pg.all<any>("select box_id::text, token_id, recipient, status, kind from mine.box_prize_items where box_id is not null order by box_id");
  check("the first Ruyui (in load order) goes to box #2's holder, not the fly", items[0].token_id === "7" && items[0].recipient === ALICE);
  check("the WL spot is recorded at once", items[1].kind === "wl" && items[1].recipient === BOB && items[1].status === "sent");

  await bp.deliver();
  const after = await pg.all<any>("select box_id::text, status, error, tx from mine.box_prize_items where box_id is not null order by box_id");
  check("Ruyui #7 sent to ALICE", sends.length === 1 && owners.get("7") === ALICE && after[0].status === "sent" && !!after[0].tx);
  check("a holder that is a contract on Ethereum is not sent to", after[2].status === "failed" && /contract/.test(after[2].error));
  check("deliver again sends nothing twice", (await bp.deliver()) === 0 && sends.length === 1);

  // box #5 wins the last Ruyui (#11), which the prize wallet doesn't hold
  logs.push(openedLog(5, 2, BOB, BOB, "Ruyui NFT (sent on Ethereum)", 210)); head = 220;
  await bp.tick();
  const r5 = await pg.one<any>("select status, error from mine.box_prize_items where box_id = 5");
  check("a prize the wallet doesn't hold: failed, named", r5.status === "failed" && /doesn't hold/.test(r5.error), JSON.stringify(r5));

  // the team moves it to the prize wallet and retries; the first try never leaves the server, the second may have
  owners.set("11", PRIZE);
  await pg.run("update mine.box_prize_items set status = 'pending', error = null where box_id = 5");
  failNext = "unsent";
  await bp.deliver();
  check("a send that never left goes back to pending", (await pg.one<any>("select status from mine.box_prize_items where box_id = 5")).status === "pending");
  failNext = "maybe";
  await bp.deliver();
  check("a send that may have left stays 'sending' (never resent blind)", (await pg.one<any>("select status from mine.box_prize_items where box_id = 5")).status === "sending");
  await bp.deliver();
  check("...and is not resent while it is fresh", sends.length === 1);
  await pg.run("update mine.box_prize_items set updated_at = now() - interval '10 minutes' where box_id = 5");
  await bp.deliver();
  check("a stale 'sending' whose NFT is still ours is sent again, once", sends.length === 2 && owners.get("11") === BOB
    && (await pg.one<any>("select status from mine.box_prize_items where box_id = 5")).status === "sent");

  // no free item left in a tier: the box waits, nothing breaks
  logs.push(openedLog(6, 2, ALICE, ALICE, "Ruyui NFT (sent on Ethereum)", 230)); head = 240;
  await bp.tick();
  check("no free item left: the box waits without an item", !(await pg.one<any>("select 1 from mine.box_prize_items where box_id = 6")));

  // badges: everyone who opened one; nobody opened 10; tier 0 (the jackpot) wasn't opened, so nobody has #19
  await bp.badges();
  const earned = await pg.all<any>("select wallet, badge from mine.badge_earned order by wallet, badge");
  check("box badges: boxopener for each opener, no hoarder, no jackpot yet",
    earned.filter((e: any) => e.badge === "boxopener").length === 3 && !earned.some((e: any) => e.badge !== "boxopener"), JSON.stringify(earned));
  logs.push(openedLog(7, 0, BOB, BOB, "", 250)); head = 260;
  await bp.tick();
  check("opening the jackpot tier earns #19", !!(await pg.one<any>("select 1 from mine.badge_earned where wallet = ? and badge = 'jackpot'", BOB)));

  // the page's view
  let body: any;
  const bp2 = createBoxPrizes({ pg, send: (_r, _s, b) => { body = b; }, readJson: async () => ({}), isAdmin: () => false,
    boxes: BOXES, fromBlock: 100, rh, chains: { ethereum: eth }, senders: { ethereum: sender, berachain: null } });
  await bp2.route({ method: "GET" } as any, {} as any, new URL("http://x/api/boxes/prize/2"));
  check("GET /api/boxes/prize/2: sent on Ethereum with a link", body.prize?.status === "sent" && body.prize.chain_name === "Ethereum"
    && body.prize.tx_url.startsWith("https://etherscan.io/tx/"), JSON.stringify(body.prize));
  await bp2.route({ method: "GET" } as any, {} as any, new URL(`http://x/api/boxes/prizes/${BOB}`));
  check("a wallet's boxes list their prizes", body.boxes.length === 4 && body.boxes.some((b: any) => b.prize?.kind === "wl")
    && body.boxes.some((b: any) => b.box_id === 1 && b.tier === 9 && b.prize === null), JSON.stringify(body.boxes));
  await bp2.route({ method: "GET" } as any, {} as any, new URL("http://x/api/boxes/recent?skip=9"));
  check("recent openings, newest first, a skipped tier left out", body.opens[0].box_id === 7 && !body.opens.some((o: any) => o.tier === 9)
    && body.opens.length === 6, JSON.stringify(body.opens.map((o: any) => o.box_id)));
  await bp2.route({ method: "GET" } as any, {} as any, new URL("http://x/api/admin/boxes/items"));
  check("admin routes refuse a non-admin", body.error === "admin only");
} finally {
  await stop();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
