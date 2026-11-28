/**
 * Fly Boxes: the other-chain prizes, sent automatically (2026-11-24; plan flytrade/FLYBOXES-PLAN.md).
 *
 * FlyBoxes (Robinhood Chain) pays USDG, $FLYAI, ETH and Robinhood NFTs (Trader Flies, Waifus) itself when a box is
 * opened. Prizes on other chains (Ruyui + Bad Bunnz on Ethereum, Bullas + Booga Bullas on Berachain) and WL spots it
 * can only name: Opened(..., tier, ..., string offchain). The user: "Why not automatic? we have in pool and they are
 * sent automatic, maybe the server tracks?" and "should be in mine or sth not new server". So mine:
 *   1. scans Opened events into mine.box_opens (a cursor in mine.box_state),
 *   2. gives each opened box of a tier that has loaded items the next free item of that tier (mine.box_prize_items,
 *      in id order: the order is fixed when the items are loaded, before opening day, so nobody picks who gets what),
 *   3. sends NFT items from the prize wallet (BOX_PRIZE_KEY: one EOA, the same address on every chain, holding the
 *      prize NFTs and a little gas) to the box's HOLDER (the one who opened it: an address on Robinhood is the same
 *      address on Ethereum / Berachain; Opened.to may be a fly, so it isn't used here); WL items are just recorded.
 * Never twice: an item is claimed (pending -> sending) in one UPDATE, and one left in 'sending' (a crash, a dropped
 * connection) is settled by ownerOf before anything is sent again. A holder that is a contract on the prize's chain
 * (a Safe that may not exist there) is not sent to: the item goes 'failed' for the team to handle.
 *
 * Badges (the user: "and badges"): every tick books #17 boxopener (opened one), #18 boxhoarder (opened 10) and #19
 * jackpot (opened the jackpot tier's box) into mine.badge_earned, the table src/badges.ts signs claims from.
 *
 * Off until FLYBOXES is set. Env: FLYBOXES, FLYBOXES_FROM_BLOCK, BOX_PRIZE_KEY, BOX_RPC_ETHEREUM, BOX_RPC_BERACHAIN,
 * BOXES_JACKPOT_TIER (default 0: the jackpot's index in contracts/tools/boxes-tiers.json).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { Pg } from "./pg.ts";
import { postRpc } from "./rpcpool.ts";

export const OPENED_SIG = "Opened(uint256,address,address,uint256,uint256,uint256,uint256,address,uint256,string)";
export const OPENED = `0x${Buffer.from(keccak_256(new TextEncoder().encode(OPENED_SIG))).toString("hex")}`;
const sel = (sig: string) => Buffer.from(keccak_256(new TextEncoder().encode(sig))).toString("hex").slice(0, 8);
const word = (v: string | bigint) => (typeof v === "bigint" ? v.toString(16) : v.toLowerCase().replace(/^0x/, "")).padStart(64, "0");
const ADDR = /^0x[0-9a-fA-F]{40}$/;

export const CHAINS: Record<string, { name: string; rpc: string; explorer: string }> = {
  ethereum: { name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io" },
  berachain: { name: "Berachain", rpc: "https://rpc.berachain.com", explorer: "https://berascan.com" },
  // 2026-11-27: the 4 Enjoyoors NFTs (the partner's collection is on MegaETH)
  megaeth: { name: "MegaETH", rpc: "https://mainnet.megaeth.com/rpc", explorer: "https://megaeth.blockscout.com" },
};

export type Opened = { box_id: number; tier: number; holder: string; sent_to: string; offchain: string; tx: string; block: number };

/** One Opened log -> its fields (topics: id, holder, to; data: tier, flyai, usd, eth, nftCollection, nftId, offchain). */
export function decodeOpened(l: { topics: string[]; data: string; transactionHash: string; blockNumber: string }): Opened {
  const d = l.data.replace(/^0x/, "");
  const w = (i: number) => d.slice(i * 64, i * 64 + 64);
  const off = Number(BigInt(`0x${w(6)}`)) / 32;
  const len = Number(BigInt(`0x${w(off)}`));
  const offchain = Buffer.from(d.slice((off + 1) * 64, (off + 1) * 64 + len * 2), "hex").toString("utf8");
  const addr = (t: string) => `0x${t.slice(-40)}`.toLowerCase();
  return {
    box_id: Number(BigInt(l.topics[1])), holder: addr(l.topics[2]), sent_to: addr(l.topics[3]),
    tier: Number(BigInt(`0x${w(0)}`)), offchain, tx: l.transactionHash, block: Number(BigInt(l.blockNumber)),
  };
}

/** What sends a transaction: mine's Relayer (src/relay.ts), one per chain, all on BOX_PRIZE_KEY. */
export type Sender = { address: string; send(to: string, data: string): Promise<string> };
type Rpc = (method: string, params: unknown[]) => Promise<any>;

export type BoxPrizesDeps = {
  pg: Pg;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  isAdmin: (req: IncomingMessage) => boolean;
  boxes: string;                         // the FlyBoxes proxy
  fromBlock: number;                     // its deploy block
  rh: Rpc;                               // Robinhood Chain
  chains: Record<string, Rpc>;           // ethereum / berachain reads
  senders: Record<string, Sender | null>;
  jackpotTier?: number;
};

type Item = { id: number; tier: number; kind: "nft" | "wl"; chain: string; collection: string; token_id: string; label: string;
  box_id: number | null; recipient: string | null; status: string; tx: string | null; error: string | null };

export function createBoxPrizes(d: BoxPrizesDeps) {
  const boxes = d.boxes.toLowerCase();

  /** Opened events since the cursor (chunks of 5,000 blocks, halved when an RPC refuses a range). */
  async function scan(): Promise<number> {
    const head = Number(BigInt(await d.rh("eth_blockNumber", [])));
    const st = await d.pg.one<{ last_block: string }>("select last_block::text from mine.box_state where id = 1");
    let from = st ? Number(st.last_block) + 1 : d.fromBlock;
    let found = 0, step = 5_000;
    while (from <= head) {
      const to = Math.min(head, from + step - 1);
      let logs: any[];
      try {
        logs = await d.rh("eth_getLogs", [{ address: boxes, topics: [OPENED], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }]);
      } catch (err) {
        if (step > 100) { step = Math.floor(step / 2); continue; }
        throw err;
      }
      for (const l of logs) {
        const o = decodeOpened(l);
        found += await d.pg.run(`insert into mine.box_opens (box_id, tier, holder, sent_to, offchain, tx, block)
          values (?, ?, ?, ?, ?, ?, ?) on conflict (box_id) do nothing`, o.box_id, o.tier, o.holder, o.sent_to, o.offchain, o.tx, o.block);
      }
      await d.pg.run(`insert into mine.box_state (id, last_block) values (1, ?) on conflict (id) do update set last_block = excluded.last_block`, to);
      from = to + 1;
    }
    return found;
  }

  /** Opened boxes of a tier with items, without one yet, get the next free item (WL: done right there). */
  async function assign(): Promise<number> {
    const waiting = await d.pg.all<{ box_id: string; tier: number; holder: string }>(`select o.box_id::text, o.tier, o.holder
      from mine.box_opens o where not exists (select 1 from mine.box_prize_items i where i.box_id = o.box_id)
        and exists (select 1 from mine.box_prize_items i where i.tier = o.tier) order by o.block, o.box_id`);
    let n = 0;
    for (const w of waiting) {
      const ok = await d.pg.tx(async (q) => {
        const it = await q.one<{ id: string; kind: string }>(`select id::text, kind from mine.box_prize_items
          where tier = ? and status = 'free' order by id limit 1 for update`, w.tier);
        if (!it) return false;
        await q.run(`update mine.box_prize_items set box_id = ?, recipient = ?, status = ?, updated_at = now() where id = ?`,
          w.box_id, w.holder, it.kind === "wl" ? "sent" : "pending", it.id);
        return true;
      }, `boxtier:${w.tier}`);
      if (ok) n++;
      else console.error(`boxes: box #${w.box_id} won tier ${w.tier} but no free item is left for it`);
    }
    return n;
  }

  const ownerOf = async (chain: string, collection: string, id: string): Promise<string | null> => {
    const r = await d.chains[chain]("eth_call", [{ to: collection, data: `0x${sel("ownerOf(uint256)")}${word(BigInt(id))}` }, "latest"]);
    return typeof r === "string" && r.length >= 66 ? `0x${r.slice(-40)}`.toLowerCase() : null;
  };

  /** A plain wallet (or a 7702 one) can take the NFT; a contract on that chain may not exist for the holder there. */
  async function plainWallet(chain: string, a: string): Promise<boolean> {
    const code = String(await d.chains[chain]("eth_getCode", [a, "latest"]));
    return code === "0x" || code.startsWith("0xef0100");
  }

  /** Sends what is pending; settles anything left 'sending' (a crash mid-send) by who owns the NFT now. */
  async function deliver(): Promise<number> {
    let sent = 0;
    const stuck = await d.pg.all<Item>(`select * from mine.box_prize_items where status = 'sending' and updated_at < now() - interval '5 minutes'`);
    for (const it of stuck) {
      const s = d.senders[it.chain];
      if (!s) continue;
      const owner = await ownerOf(it.chain, it.collection, it.token_id).catch(() => null);
      if (owner === it.recipient) await d.pg.run(`update mine.box_prize_items set status = 'sent', updated_at = now() where id = ?`, it.id);
      else if (owner === s.address.toLowerCase()) await d.pg.run(`update mine.box_prize_items set status = 'pending', updated_at = now() where id = ?`, it.id);
    }
    const pending = await d.pg.all<Item>(`select * from mine.box_prize_items where status = 'pending' order by id limit 20`);
    for (const it of pending) {
      const s = d.senders[it.chain];
      if (!s || !d.chains[it.chain]) continue;          // that chain's sender isn't set up: waits
      const fail = (why: string) => d.pg.run(`update mine.box_prize_items set status = 'failed', error = ?, updated_at = now() where id = ?`, why, it.id);
      if (!(await plainWallet(it.chain, it.recipient!).catch(() => true))) { await fail("the holder is a contract on this chain"); continue; }
      const owner = await ownerOf(it.chain, it.collection, it.token_id).catch(() => null);
      if (owner !== s.address.toLowerCase()) { await fail(`the prize wallet doesn't hold it (owner ${owner})`); continue; }
      const claimed = await d.pg.run(`update mine.box_prize_items set status = 'sending', updated_at = now() where id = ? and status = 'pending'`, it.id);
      if (!claimed) continue;
      const data = `0x${sel("transferFrom(address,address,uint256)")}${word(s.address)}${word(it.recipient!)}${word(BigInt(it.token_id))}`;
      try {
        const tx = await s.send(it.collection, data);
        await d.pg.run(`update mine.box_prize_items set status = 'sent', tx = ?, error = null, updated_at = now() where id = ?`, tx, it.id);
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // nothing left the server: try again next round; otherwise leave it 'sending' for the ownerOf check above
        if ((err as { unsent?: boolean }).unsent) await d.pg.run(`update mine.box_prize_items set status = 'pending', error = ?, updated_at = now() where id = ?`, msg, it.id);
        else await d.pg.run(`update mine.box_prize_items set error = ?, updated_at = now() where id = ?`, msg, it.id);
        console.error(`boxes: sending item ${it.id} (box #${it.box_id}): ${msg}`);
      }
    }
    return sent;
  }

  /** The box badges, from the openings so far (re-running is harmless: a badge is earned once). */
  async function badges(): Promise<number> {
    const book = (sql: string, badge: string, ...args: (string | number)[]) => d.pg.run(`insert into mine.badge_earned (wallet, badge, earned_at)
      select holder, '${badge}', min(at) from mine.box_opens ${sql} on conflict do nothing`, ...args);
    return await book("group by holder", "boxopener") + await book("group by holder having count(*) >= 10", "boxhoarder")
      + await book("where tier = ? group by holder", "jackpot", d.jackpotTier ?? 0);
  }

  let running = false;
  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      await scan();
      await assign();
      await badges();
      await deliver();
    } finally {
      running = false;
    }
  }

  const view = (it: Item | undefined) => it && {
    kind: it.kind, label: it.label, chain: it.chain || null, chain_name: CHAINS[it.chain]?.name ?? null,
    collection: it.collection || null, token_id: it.token_id || null, recipient: it.recipient, status: it.status,
    tx: it.tx, tx_url: it.tx && CHAINS[it.chain] ? `${CHAINS[it.chain].explorer}/tx/${it.tx}` : null,
  };

  /** Loads prize items for a tier: { tier, chain, collection, ids: [...] } or { tier, wl: "label", count }. */
  async function addItems(b: any): Promise<{ added: number; warnings: string[] }> {
    const tier = Number(b?.tier);
    if (!Number.isInteger(tier) || tier < 0 || tier > 15) throw new Error("tier 0-15");
    const warnings: string[] = [];
    let added = 0;
    if (b.wl) {
      const count = Number(b.count);
      if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("count 1-500");
      const have = await d.pg.one<{ n: string }>("select count(*)::text as n from mine.box_prize_items where kind = 'wl' and label = ?", String(b.wl));
      for (let i = 0; i < count; i++) {
        added += await d.pg.run(`insert into mine.box_prize_items (tier, kind, label, token_id) values (?, 'wl', ?, ?) on conflict do nothing`,
          tier, String(b.wl), String(Number(have?.n ?? 0) + i + 1));
      }
      return { added, warnings };
    }
    if (!CHAINS[b.chain]) throw new Error(`chain: ${Object.keys(CHAINS).join(" | ")}`);
    if (!ADDR.test(b.collection ?? "")) throw new Error("collection: an address");
    const ids: string[] = (b.ids ?? []).map((x: unknown) => BigInt(String(x)).toString());
    if (!ids.length) throw new Error("ids: the token ids");
    const prize = d.senders[b.chain]?.address.toLowerCase();
    for (const id of ids) {
      const owner = await ownerOf(b.chain, b.collection, id).catch(() => null);
      if (prize && owner !== prize) warnings.push(`#${id} is held by ${owner}, not the prize wallet ${prize}: move it there before opening day`);
      added += await d.pg.run(`insert into mine.box_prize_items (tier, kind, chain, collection, token_id, label) values (?, 'nft', ?, ?, ?, ?)
        on conflict do nothing`, tier, b.chain, String(b.collection).toLowerCase(), id, String(b.label ?? ""));
    }
    return { added, warnings };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    // one box's other-chain prize (the page asks after an opening): { open, prize } (prize null = none for this tier)
    let m = p.match(/^\/api\/boxes\/prize\/(\d{1,9})$/);
    if (req.method === "GET" && m) {
      const open = await d.pg.one<Opened>("select box_id, tier, holder, sent_to, offchain, tx, block from mine.box_opens where box_id = ?", m[1]);
      const it = await d.pg.one<Item>("select * from mine.box_prize_items where box_id = ?", m[1]);
      return d.send(res, 200, { open: open ?? null, prize: view(it) ?? null }), true;
    }
    // the latest openings, for the page's live feed (?skip=0,13 leaves out tiers by index, e.g. the near-empty Common)
    if (req.method === "GET" && p === "/api/boxes/recent") {
      const skip = (url.searchParams.get("skip") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 16);
      const rows = await d.pg.all<{ box_id: string; tier: number; holder: string; at: Date }>(`select box_id::text, tier, holder, at
        from mine.box_opens where not (tier = any(?::int[])) order by block desc, box_id desc limit 30`, `{${skip.join(",")}}`);
      return d.send(res, 200, { opens: rows.map((r) => ({ box_id: Number(r.box_id), tier: r.tier, holder: r.holder, at: new Date(r.at).getTime() })) }), true;
    }
    // a wallet's opened boxes with their other-chain prizes
    m = p.match(/^\/api\/boxes\/prizes\/(0x[0-9a-fA-F]{40})$/);
    if (req.method === "GET" && m) {
      // i.* first, the box's own columns after it (a box without an item would otherwise read box_id / tier as null)
      const rows = await d.pg.all<Item & { o_box: string; o_tier: number; o_label: string }>(`select i.*, o.box_id::text as o_box,
        o.tier as o_tier, o.offchain as o_label from mine.box_opens o left join mine.box_prize_items i on i.box_id = o.box_id
        where o.holder = ? order by o.block desc limit 200`, m[1].toLowerCase());
      return d.send(res, 200, { boxes: rows.map((r) => ({ box_id: Number(r.o_box), tier: r.o_tier, offchain: r.o_label, prize: r.kind ? view(r) : null })) }), true;
    }
    if (p.startsWith("/api/admin/boxes/")) {
      if (!d.isAdmin(req)) return d.send(res, 401, { error: "admin only" }), true;
      if (req.method === "POST" && p === "/api/admin/boxes/items") {
        try {
          return d.send(res, 200, await addItems(await d.readJson(req))), true;
        } catch (err) {
          return d.send(res, 400, { error: err instanceof Error ? err.message : String(err) }), true;
        }
      }
      if (req.method === "GET" && p === "/api/admin/boxes/items") {
        const items = await d.pg.all<Item>("select * from mine.box_prize_items order by tier, id");
        const prize = Object.fromEntries(Object.entries(d.senders).map(([c, s]) => [c, s?.address ?? null]));
        return d.send(res, 200, { prize_wallet: prize, items }), true;
      }
      // the WL winners, to hand to the partner: ?label=Bad Bunnz mint WL
      if (req.method === "GET" && p === "/api/admin/boxes/wl") {
        const rows = await d.pg.all<{ label: string; recipient: string; box_id: string }>(`select label, recipient, box_id::text from mine.box_prize_items
          where kind = 'wl' and status = 'sent' and (? = '' or label = ?) order by label, id`, url.searchParams.get("label") ?? "", url.searchParams.get("label") ?? "");
        return d.send(res, 200, { wl: rows }), true;
      }
      // a failed item, retried after the team fixed it (moved the NFT, topped up gas): { id }
      if (req.method === "POST" && p === "/api/admin/boxes/retry") {
        const b = await d.readJson(req);
        const n = await d.pg.run(`update mine.box_prize_items set status = 'pending', error = null, updated_at = now() where id = ? and status = 'failed'`, Number(b?.id));
        return d.send(res, 200, { retried: n }), true;
      }
    }
    return false;
  }

  function start(everyMs = 20_000) {
    const run = () => void tick().catch((err) => console.error("boxes:", err instanceof Error ? err.message : err));
    setTimeout(run, 30_000).unref();
    setInterval(run, everyMs).unref();
  }

  return { scan, assign, deliver, badges, tick, route, start, addItems };
}

/** JSON-RPC on one chain through mine's failover pool. */
export const rpcOn = (url: string): Rpc => async (method, params) => {
  const body = await postRpc(url, { jsonrpc: "2.0", id: 1, method, params }, 15_000);
  if (body.error) throw new Error(body.error.message ?? JSON.stringify(body.error));
  return body.result;
};
