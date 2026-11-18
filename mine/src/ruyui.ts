/**
 * RUYUI's own API (/api/ruyui/*), kept for Ruyui's site (hub.ruyui.com calls it through its proxy, flytrade/ruyui/
 * INTEGRATION.md). Since 2026-11-18 (the user: "combine the ruyui separate app to the partners ... so it's one") RUYUI
 * is a row in mine.partners like every other collection, and this is only an alias over src/partners.ts:
 *
 * - /api/ruyui/<rest>  ->  /api/partners/ruyui/<rest>  (token, wallet, holder, leaderboard, setup, settings, withdraw,
 *   elysium, zero, perps): the partners' code on RUYUI's own records (book "ruyui", partners.ts parsePartner)
 * - /api/ruyui/config keeps its old shape (collection / features / hold / pool beside the partner config)
 * - /api/ruyui/requests/<id> reads its request as before; the old RUYUI pool is gone (the Partners pot replaced it):
 *   /api/ruyui/pool says "off"
 * Sign-in is the site-wide session; PARTNER_ORIGINS lets Ruyui's origin be the domain the SIWE message names.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pg } from "./pg.ts";

export interface RuyuiDeps {
  pg: Pg;
  adminOnly: (req: IncomingMessage) => void;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  /** src/partners.ts: its routes and RUYUI's config (the partner config shape) */
  partners: { route: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>; configOf: (id: string) => Promise<any> };
}

const ID = "ruyui";
const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";

export function createRuyui(d: RuyuiDeps) {
  const { pg, HttpError } = d;

  /** the old /api/ruyui/config: the partner config plus the fields Ruyui's site reads */
  async function config() {
    const c = await d.partners.configOf(ID);
    const p = c.partner;
    return {
      ...c,
      collection: { name: p.name, chain: p.collection.chain, chain_id: p.collection.chain_id, contract: p.collection.contract,
                    first_id: p.collection.first_id, last_id: p.collection.last_id },
      features: { perps: !!c.perps, elysium: true, zero: true },
      // staked and locked $FLYAI count as for every partner since the merge (partners.ts flyaiOf)
      hold: { symbol: "FLYAI", address: FLYAI, chain: "robinhood", amount: p.hold_flyai, staked_counts: true },
      pool: { fee_bps: p.fee_bps, epoch_days: 7, mode: "off", on: false },
    };
  }

  async function requestView(id: number) {
    const r = await pg.one<any>(`select id, wallet, kind, status, result, extract(epoch from at)::float8 as at, extract(epoch from done_at)::float8 as done_at
      from mine.vault_requests where id = ? and chain = 'ruyui'`, id);
    if (!r) throw new HttpError(404, "no such request");
    if (r.kind === "register") r.wallet = r.result?.wallet ?? null;
    return r;
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    let m: RegExpExecArray | null;
    if (p === "/api/ruyui/link" || p.startsWith("/api/ruyui/link/")) {
      throw new HttpError(410, "RUYUI is on Ethereum now: sign in with the wallet that holds it, no link needed");
    }
    if (req.method === "GET") {
      if (p === "/api/ruyui/config") return d.send(res, 200, await config()), true;
      if ((m = /^\/api\/ruyui\/requests\/(\d{1,12})$/.exec(p))) return d.send(res, 200, await requestView(Number(m[1]))), true;
      if (p === "/api/ruyui/pool") return d.send(res, 200, { mode: "off", on: false, epochs: [], curve: [] }), true;
      if (/^\/api\/ruyui\/pool\/epochs\/\d{1,5}$/.test(p)) throw new HttpError(404, "no such epoch");
      if (p === "/api/admin/ruyui") {
        d.adminOnly(req);
        return d.send(res, 200, {
          wallets: (await pg.one<{ n: number }>("select count(*)::int as n from mine.vault_wallets where id like 'ruyui:%'"))?.n ?? 0,
          funded: await pg.all("select * from mine.vault_ledger where chain = 'ruyui' and holder is not null order by principal_usd desc limit 100"),
          requests: await pg.all("select * from mine.vault_requests where chain = 'ruyui' order by id desc limit 100"),
        }), true;
      }
    }
    if (p.startsWith("/api/ruyui/")) {
      const to = new URL(url.toString());
      to.pathname = `/api/partners/${ID}/${p.slice("/api/ruyui/".length)}`;
      return d.partners.route(req, res, to);
    }
    return false;
  }

  return { route };
}
