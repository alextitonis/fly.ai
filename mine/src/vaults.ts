/**
 * Fly Wallets (flytrade/FLYWALLET-PLAN.md): each Trader Fly's own on-chain vault, or a pot several of one holder's
 * flies share, traded by the fly's brain and the options its owner switched on (the vault desk, flytrade/vaults).
 * The money lives in the contracts (FlyVaultFactory / FlyVault); this module is the site's side:
 *
 * - settings: the owner's document per vault (mine.vault_settings). Only the vault's holder may save it - or, before
 *   the fly's vault was ever funded, the fly's owner. The vault desk validates every document it reads
 *   (flytrade/vaults/wsettings.py), so here it only has to be a JSON object of sane size.
 * - stats and the leaderboard: what the vault desk publishes each bar (mine.vault_public).
 * - FlightPass burns into a fly (FlyVaultFactory.PassBurned): the pass's whole balance here plus the house grant
 *   (VAULT_GRANT_USD of FLYAI, $10) are paid into the fly's vault by the granter wallet with factory.grant(..., locked
 *   = true). The pass's ledger is emptied first (one row, tx "vault-grant:<pass>"), so it is paid once; a grant that
 *   provably never left is retried, one that may have left waits for the operator (status 'error').
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg, Q } from "./pg.ts";
import { rpc } from "./orders.ts";
import { selector } from "./staking.ts";
import { checksumAddress } from "./wallet.ts";

export interface VaultsDeps {
  pg: Pg;
  book: (q: Q, wallet: string, orderId: string | null, kind: string, amount: bigint, extra?: { tx?: string }) => Promise<void>;
  balanceOf: (q: Q, wallet: string) => Promise<bigint>;
  sessionWallet: (req: IncomingMessage) => Promise<string>;
  adminOnly: (req: IncomingMessage) => void;
  HttpError: new (status: number, message: string) => Error;
  fromWei: (w: bigint) => string;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  readJson: (req: IncomingMessage) => Promise<any>;
  rpcUrl: string;
  env: NodeJS.ProcessEnv;
  /** the FLYAI token */
  token: string;
  /** the wallet that pays grants into vaults (the factory's granter key) */
  granter: { address: string; send: (to: string, data: string) => Promise<string> } | null;
}

const word = (v: bigint | number | string) =>
  typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : BigInt(v).toString(16).padStart(64, "0");
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_DOC = 16_000;
const PASS_BURNED_SIG = "PassBurned(uint256,uint256,address,address)";

export function createVaults(d: VaultsDeps) {
  const { pg, HttpError, fromWei } = d;
  const CFG = {
    factory: d.env.VAULT_FACTORY ? checksumAddress(d.env.VAULT_FACTORY) : null,
    deployBlock: Number(d.env.VAULT_DEPLOY_BLOCK ?? "0"),
    traderFly: checksumAddress(d.env.ARENA_TRADERFLY ?? "0x18d4D831cA89672126172B73bA05f5A318ad5A72"),
    grantUsd: Number(d.env.VAULT_GRANT_USD ?? "10"),
    tickMs: Number(d.env.VAULT_TICK_SEC ?? "60") * 1000,
  };
  const on = d.env.VAULT_ON === "1" && !!CFG.factory;
  const call = (to: string, data: string) => rpc(d.rpcUrl, "eth_call", [{ to, data }, "latest"]) as Promise<string>;
  const addr = (ret: string) => checksumAddress(`0x${ret.slice(-40)}`);
  const isOn = () => { if (!on) throw new HttpError(503, "Fly Wallets aren't open yet"); };

  async function vaultOf(fly: number): Promise<string> {
    return addr(await call(CFG.factory!, `0x${selector("vaultOf(uint256)")}${word(fly)}`));
  }
  async function potOf(fly: number): Promise<string | null> {
    const a = addr(await call(CFG.factory!, `0x${selector("potOf(uint256)")}${word(fly)}`));
    return /^0x0{40}$/i.test(a) ? null : a;
  }
  async function ownerOfFly(fly: number): Promise<string | null> {
    try { return addr(await call(CFG.traderFly, `0x${selector("ownerOf(uint256)")}${word(fly)}`)); } catch { return null; }
  }
  /** The vault's holder, 0x0 if it has none, null if the vault isn't made yet. */
  async function holderOf(vault: string): Promise<string | null> {
    const code = await rpc(d.rpcUrl, "eth_getCode", [vault, "latest"]) as string;
    if (!code || code === "0x") return null;
    return addr(await call(vault, `0x${selector("holder()")}`));
  }
  const publicOf = async (key: string) =>
    (await pg.one<{ value: any }>("select value from mine.vault_public where key = ?", key))?.value ?? null;
  const settingsOf = async (vault: string) =>
    (await pg.one<{ doc: any; updated_at_ms: number }>("select doc, updated_at_ms from mine.vault_settings where vault = ?", vault)) ?? null;

  // ---- views -------------------------------------------------------------------------------------------------
  async function config() {
    return { on, factory: CFG.factory, grant_usd: CFG.grantUsd, starters: await publicOf("starters") };
  }

  async function flyView(fly: number) {
    isOn();
    const [vault, pot, owner] = await Promise.all([vaultOf(fly), potOf(fly), ownerOfFly(fly)]);
    const s = await settingsOf(vault);
    return { fly, owner, vault, pot, stats: await publicOf(`vault:${vault}`), settings: s?.doc ?? null,
             pot_stats: pot ? await publicOf(`vault:${pot}`) : null };
  }

  async function vaultView(vault: string) {
    isOn();
    const s = await settingsOf(vault);
    return { vault, stats: await publicOf(`vault:${vault}`), settings: s?.doc ?? null };
  }

  // ---- the owner's settings ---------------------------------------------------------------------------------
  async function saveSettings(req: IncomingMessage, vault: string, body: any) {
    isOn();
    const wallet = await d.sessionWallet(req);
    const doc = body?.settings;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new HttpError(400, "settings must be an object");
    const text = JSON.stringify(doc);
    if (text.length > MAX_DOC) throw new HttpError(400, "settings are too long");
    const holder = await holderOf(vault);
    if (holder && !/^0x0{40}$/i.test(holder)) {
      if (holder.toLowerCase() !== wallet.toLowerCase()) throw new HttpError(403, "only the vault's holder can change its settings");
    } else {
      // not funded yet: the fly's owner sets it up first (a fly's own vault only; pots always have their holder)
      const fly = Number(body?.fly);
      if (!Number.isInteger(fly) || fly < 1) throw new HttpError(400, "fly is the vault's fly id");
      if ((await vaultOf(fly)).toLowerCase() !== vault.toLowerCase()) throw new HttpError(400, "that isn't this fly's vault");
      if ((await ownerOfFly(fly))?.toLowerCase() !== wallet.toLowerCase()) throw new HttpError(403, "only the fly's owner can set up its wallet");
    }
    const version = (await import("node:crypto")).createHash("sha1").update(text).digest("hex").slice(0, 12);
    await pg.run(`insert into mine.vault_settings (vault, doc, version, updated_by, updated_at_ms) values (?, ?::jsonb, ?, ?, ?)
      on conflict (vault) do update set doc = excluded.doc, version = excluded.version, updated_by = excluded.updated_by,
      updated_at_ms = excluded.updated_at_ms`, vault, text, version, wallet, Date.now());
    return { vault, version, settings: doc };
  }

  // ---- FlightPass burns: the pass's balance and the grant into the vault ----------------------------------------
  let topic: string | null = null;
  const burnedTopic = async () => {
    if (!topic) {
      const { keccak_256 } = await import("@noble/hashes/sha3.js");
      topic = "0x" + Buffer.from(keccak_256(new TextEncoder().encode(PASS_BURNED_SIG))).toString("hex");
    }
    return topic;
  };

  /** New PassBurned events since the last read become grant rows (status 'new'). */
  async function scanBurns(): Promise<void> {
    const cur = await pg.one<{ value: any }>("select value from mine.vault_state where key = 'grant_cursor'");
    const head = Number(BigInt(await rpc(d.rpcUrl, "eth_blockNumber", []) as string));
    let from = Number(cur?.value?.block ?? CFG.deployBlock) + 1;
    while (from <= head) {
      const to = Math.min(head, from + 9_000_000);
      const logs = await rpc(d.rpcUrl, "eth_getLogs", [{ address: CFG.factory, fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`, topics: [await burnedTopic()] }]) as any[];
      for (const l of logs) {
        const pass = Number(BigInt(l.topics[1])), fly = Number(BigInt(l.topics[2]));
        const holder = addr(l.topics[3]), vault = addr(l.data);
        await pg.run(`insert into mine.vault_grants (pass_id, fly_id, holder, vault, burn_tx, status, created_at_ms)
          values (?, ?, ?, ?, ?, 'new', ?) on conflict (pass_id) do nothing`, pass, fly, holder, vault, l.transactionHash, Date.now());
      }
      from = to + 1;
    }
    await pg.run(`insert into mine.vault_state (key, value) values ('grant_cursor', ?::jsonb)
      on conflict (key) do update set value = excluded.value, updated_at = now()`, JSON.stringify({ block: head }));
  }

  /** FLYAI base units for $usd at TraderFly's posted price. */
  async function flyaiFor(usd: number): Promise<bigint> {
    const perDollar = BigInt(await call(CFG.traderFly, `0x${selector("flyaiPerDollar()")}`));
    return perDollar * BigInt(Math.round(usd * 100)) / 100n;
  }

  async function ensureAllowance(need: bigint): Promise<void> {
    const allowed = BigInt(await call(d.token, `0x${selector("allowance(address,address)")}${word(d.granter!.address)}${word(CFG.factory!)}`));
    if (allowed >= need) return;
    await d.granter!.send(d.token, `0x${selector("approve(address,uint256)")}${word(CFG.factory!)}${word((1n << 256n) - 1n)}`);
  }

  async function payGrants(): Promise<void> {
    if (!d.granter) return;
    // empty each new burn's pass first (claimed once: the ledger row's tx is unique per pass)
    for (const g of await pg.all<{ pass_id: number }>("select pass_id from mine.vault_grants where status = 'new' order by pass_id")) {
      const grant = await flyaiFor(CFG.grantUsd);
      await pg.tx(async (q) => {
        const row = await q.one<{ status: string }>("select status from mine.vault_grants where pass_id = ?", g.pass_id);
        if (row?.status !== "new") return;
        const key = `pass:${g.pass_id}`;
        const bal = await d.balanceOf(q, key);
        if (bal > 0n) await d.book(q, key, null, "withdraw", bal, { tx: `vault-grant:${g.pass_id}` });
        await q.run("update mine.vault_grants set status = 'claimed', pass_wei = ?, grant_wei = ? where pass_id = ?",
          (bal > 0n ? bal : 0n).toString(), grant.toString(), g.pass_id);
      }, `pass:${g.pass_id}`);
    }
    for (const g of await pg.all<{ pass_id: number; fly_id: number; pass_wei: string; grant_wei: string }>(
      "select pass_id, fly_id, pass_wei, grant_wei from mine.vault_grants where status = 'claimed' order by pass_id")) {
      const amount = BigInt(g.pass_wei) + BigInt(g.grant_wei);
      if (await pg.run("update mine.vault_grants set status = 'sending' where pass_id = ? and status = 'claimed'", g.pass_id) !== 1) continue;
      try {
        await ensureAllowance(amount);
        const tx = await d.granter.send(CFG.factory!, `0x${selector("grant(uint256,address,uint256,bool)")}${word(g.fly_id)}${word(d.token)}${word(amount)}${word(1)}`);
        await pg.run("update mine.vault_grants set status = 'paid', grant_tx = ?, done_at_ms = ? where pass_id = ?", tx.toLowerCase(), Date.now(), g.pass_id);
        console.log(`vault grant: pass #${g.pass_id} -> fly #${g.fly_id}: ${fromWei(amount)} FLYAI (${tx})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const unsent = (err as { unsent?: boolean }).unsent;
        await pg.run("update mine.vault_grants set status = ?, error = ? where pass_id = ?", unsent ? "claimed" : "error", msg, g.pass_id);
        console.error(`vault grant for pass #${g.pass_id} ${unsent ? "not sent, retried later" : "may have been sent; the operator settles it"}: ${msg}`);
        return;
      }
    }
  }

  let ticking = false;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      await scanBurns();
      await payGrants();
    } catch (err) {
      console.error("vaults tick:", (err as Error)?.message ?? err);
    } finally {
      ticking = false;
    }
  }
  function start(): void {
    if (!on) return;
    void tick();
    setInterval(() => void tick(), CFG.tickMs).unref();
  }

  async function admin() {
    return {
      on, factory: CFG.factory, granter: d.granter?.address ?? null,
      grants: await pg.all("select * from mine.vault_grants order by pass_id desc limit 100"),
    };
  }

  // ---- routes ------------------------------------------------------------------------------------------------
  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (req.method === "GET") {
      if (p === "/api/vaults/config") return d.send(res, 200, await config()), true;
      if (p === "/api/vaults/leaderboard") { isOn(); return d.send(res, 200, (await publicOf("leaderboard")) ?? { all: [], d7: [], h24: [] }), true; }
      if ((m = /^\/api\/vaults\/fly\/(\d{1,6})$/.exec(p))) return d.send(res, 200, await flyView(Number(m[1]))), true;
      if ((m = /^\/api\/vaults\/(0x[0-9a-fA-F]{40})$/.exec(p))) return d.send(res, 200, await vaultView(checksumAddress(m[1]))), true;
      if (p === "/api/admin/vaults") { d.adminOnly(req); return d.send(res, 200, await admin()), true; }
    }
    if (req.method === "POST") {
      if ((m = /^\/api\/vaults\/(0x[0-9a-fA-F]{40})\/settings$/.exec(p))) {
        if (!ADDRESS.test(m[1])) throw new HttpError(400, "bad vault address");
        return d.send(res, 200, await saveSettings(req, checksumAddress(m[1]), await d.readJson(req))), true;
      }
    }
    return false;
  }

  return { route, start, on, CFG };
}
