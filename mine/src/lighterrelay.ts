/**
 * Lighter relay (2026-11-12). Lighter refuses SIGNED calls (sendTx: 400, code 20558 "restricted jurisdiction") from
 * flyai-vaults' region (arn) while it takes them from this server's (cdg); reads work everywhere. Fly #433's and one
 * other wallet's Perps money sat stuck on Lighter because of it. So the wallets' Lighter SDK points at THIS host and
 * this forwards, byte for byte, to Lighter on Robinhood Chain:
 *
 *   GET  /api/v1/apikeys, /api/v1/nextNonce          open (public reads on Lighter; the SDK's native signer asks them
 *                                                     and sends no headers)
 *   POST /api/v1/sendTx, /api/v1/sendTxBatch         only with header x-relay-key: LIGHTER_RELAY_KEY
 *
 * The SDK keeps only the host of its base URL (checked 11-12: a path prefix was dropped), so the routes sit at the
 * root, where this server has nothing else. Everything is off (falls through) while LIGHTER_RELAY_KEY is unset.
 */
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const UPSTREAM = "https://api.rh.lighter.xyz";
const OPEN_GET = new Set(["/api/v1/apikeys", "/api/v1/nextNonce"]);
const KEYED_POST = new Set(["/api/v1/sendTx", "/api/v1/sendTxBatch"]);
const MAX_BODY = 256 * 1024;
const TIMEOUT_MS = 25_000;

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function readRaw(req: IncomingMessage): Promise<Buffer | null> {
  const parts: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > MAX_BODY) return null;
    parts.push(c as Buffer);
  }
  return Buffer.concat(parts);
}

function answer(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
  return true;
}

/** True when the request was the relay's (answered here); false for every other path. */
export async function lighterRelay(req: IncomingMessage, res: ServerResponse, url: URL,
                                   key = process.env.LIGHTER_RELAY_KEY ?? ""): Promise<boolean> {
  const p = url.pathname;
  if (key.length < 16 || !(OPEN_GET.has(p) || KEYED_POST.has(p))) return false;
  if (OPEN_GET.has(p) && req.method !== "GET") return answer(res, 405, { error: "GET only" });
  if (KEYED_POST.has(p)) {
    if (req.method !== "POST") return answer(res, 405, { error: "POST only" });
    if (!sameKey(String(req.headers["x-relay-key"] ?? ""), key)) return answer(res, 401, { error: "relay key" });
  }
  const body = req.method === "POST" ? await readRaw(req) : undefined;
  if (body === null) return answer(res, 413, { error: "too big" });
  const headers: Record<string, string> = { accept: String(req.headers.accept ?? "application/json") };
  if (req.headers["content-type"]) headers["content-type"] = String(req.headers["content-type"]);
  try {
    const r = await fetch(UPSTREAM + p + url.search, {
      method: req.method, headers, body: body && body.length ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
    res.end(out);
  } catch (err) {
    return answer(res, 502, { error: `lighter: ${(err as Error).message}`.slice(0, 200) });
  }
  return true;
}
