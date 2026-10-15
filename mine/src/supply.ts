/**
 * $FLYAI supply for the coin listings (CoinGecko, CoinMarketCap and the sites that copy them): both ask for an
 * endpoint that answers with the number alone, so a burn shows up there without a resubmission.
 *
 *   GET /api/supply/total        totalSupply() on chain (burns lower it), whole tokens as plain text, e.g. 950000000
 *   GET /api/supply/circulating  total minus the balances that can never move (the Pons locker, 0x…dEaD), whole tokens
 *   GET /api/supply              both, with the excluded wallets and their balances, as JSON
 *
 * One multicall per SUPPLY_TTL_MS at most (RPC cost rules): the listings poll, the chain is read once.
 * SUPPLY_EXCLUDE (comma-separated addresses) replaces the excluded list.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { multicall, word } from "./multicall.ts";
import { selector } from "./staking.ts";

const FLYAI = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C";
const DECIMALS = 18n;
/** Balances that are out of the market for good: the launch locker holds 4/49 of the supply permanently (TOKEN.md). */
const LOCKED: Record<string, string> = {
  "0x267444d099b10fb5ed7c3cc7b7c767adca574952": "Pons launch locker (permanent)",
  "0x000000000000000000000000000000000000dEaD": "dead address",
};

export type SupplyView = {
  token: string; chain: string; decimals: number;
  total: string; circulating: string; burned: string; minted: string;
  excluded: { address: string; label: string; balance: string }[];
  read_at: string;
};

export function createSupply(d: {
  rpcUrl: string; env: NodeJS.ProcessEnv;
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
}) {
  const ttl = Number(d.env.SUPPLY_TTL_MS ?? 300_000);
  const excluded: [string, string][] = d.env.SUPPLY_EXCLUDE
    ? d.env.SUPPLY_EXCLUDE.split(",").map((a) => a.trim()).filter(Boolean).map((a) => [a, LOCKED[a] ?? "excluded"])
    : Object.entries(LOCKED);
  const mc = multicall(d.rpcUrl);
  let cached: { at: number; view: SupplyView } | null = null;
  let pending: Promise<SupplyView> | null = null;

  async function read(): Promise<SupplyView> {
    const rets = await mc.batch([
      { to: FLYAI, data: selector("totalSupply()") },
      ...excluded.map(([a]) => ({ to: FLYAI, data: `${selector("balanceOf(address)")}${word(BigInt(a))}` })),
    ]);
    if (rets.some((r) => !r || r === "0x")) throw new Error("supply read reverted");
    const [total, ...balances] = rets.map((r) => BigInt(r!.slice(0, 66)));
    const out = balances.reduce((a, b) => a + b, 0n);
    const minted = 1_000_000_000n * 10n ** DECIMALS;
    return {
      token: FLYAI, chain: "Robinhood Chain", decimals: Number(DECIMALS),
      total: units(total), circulating: units(total - out), burned: units(minted - total), minted: units(minted),
      excluded: excluded.map(([address, label], i) => ({ address, label, balance: units(balances[i]) })),
      read_at: new Date().toISOString(),
    };
  }

  /** The last read while fresh; a failed refresh serves the last good one rather than an error. */
  async function view(): Promise<SupplyView> {
    if (cached && Date.now() - cached.at < ttl) return cached.view;
    pending ??= read().then((v) => { cached = { at: Date.now(), view: v }; return v; }).finally(() => { pending = null; });
    try {
      return await pending;
    } catch (err) {
      if (cached) return cached.view;
      console.error(`supply: ${err instanceof Error ? err.message : err}`);
      throw new d.HttpError(503, "supply not readable right now, try again shortly");
    }
  }

  function text(res: ServerResponse, body: string): void {
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
      "access-control-allow-origin": "*",
    });
    res.end(body);
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "GET") return false;
    const p = url.pathname.replace(/\/$/, "");
    if (p === "/api/supply") return d.send(res, 200, await view()), true;
    if (p === "/api/supply/total") return text(res, (await view()).total.split(".")[0]), true;
    if (p === "/api/supply/circulating") return text(res, (await view()).circulating.split(".")[0]), true;
    return false;
  }

  return { route, view };
}

/** Whole tokens with up to 18 decimals, trailing zeros dropped: 950000000, 868367347.123 */
export function units(wei: bigint): string {
  const s = wei.toString().padStart(Number(DECIMALS) + 1, "0");
  const whole = s.slice(0, -Number(DECIMALS)), frac = s.slice(-Number(DECIMALS)).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
