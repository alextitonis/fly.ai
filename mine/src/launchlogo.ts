/**
 * Launch logos (2026-10-30, the user: "drag and drop a png to go to pinata"): docs/launch.html sends the image's bytes
 * here and gets back an ipfs:// link for the token's uri. The Pinata key stays on this server (PINATA_JWT, the same key
 * flytrade/desk/pinata.py and nft/publish.py pin with).
 *
 *   POST /api/launchpad/logo   body: the image itself (PNG, JPEG, WebP or GIF, at most 1 MB), signed in
 *                              -> { uri: "ipfs://<cid>", url: "<our gateway>/<cid>" }
 *
 * The bytes are checked, not the Content-Type (no SVG: it can carry scripts). Limits: LOGOS_PER_WALLET a wallet and
 * LOGOS_PER_DAY in all, a rolling day in memory; a restart only forgives them.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export const MAX_BYTES = 1_048_576;
export const LOGOS_PER_WALLET = 10;
export const LOGOS_PER_DAY = 300;
const DAY = 86_400_000;
const PIN = "https://api.pinata.cloud/pinning/pinFileToIPFS";
export const GATEWAY = "https://salmon-elaborate-eel-413.mypinata.cloud/ipfs/";

/** What the bytes are, from their first bytes; null for anything that isn't one of the four. */
export function imageKind(b: Buffer): { ext: string; mime: string } | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (b.length > 6 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6))) return { ext: "gif", mime: "image/gif" };
  return null;
}

/** Pin through Pinata (the legacy pinning endpoint, CID v1, as pinata.py); returns the CID. */
export function pinataPin(jwt: string, doFetch: typeof fetch = fetch) {
  return async (name: string, bytes: Buffer, mime: string): Promise<string> => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
    form.append("pinataMetadata", JSON.stringify({ name }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    const r = await doFetch(PIN, { method: "POST", headers: { authorization: `Bearer ${jwt}` }, body: form, signal: AbortSignal.timeout(60_000) });
    const j = (await r.json().catch(() => ({}))) as { IpfsHash?: string };
    if (!r.ok || !j.IpfsHash) throw new Error(`pinata ${r.status}`);
    return j.IpfsHash;
  };
}

export function createLaunchLogo(d: {
  pin: ((name: string, bytes: Buffer, mime: string) => Promise<string>) | null;   // null: no PINATA_JWT
  sessionWallet: (req: IncomingMessage) => Promise<string>;                         // throws 401 when not signed in
  HttpError: new (status: number, message: string) => Error;
  send: (res: ServerResponse, status: number, body: unknown) => void;
  now?: () => number;
}) {
  const { HttpError } = d;
  const now = d.now ?? Date.now;
  const byWallet = new Map<string, number[]>();
  let all: number[] = [];
  const recent = (xs: number[]) => xs.filter((t) => now() - t < DAY);

  async function body(req: IncomingMessage): Promise<Buffer> {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > MAX_BYTES) throw new HttpError(413, "the image is over 1 MB");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new HttpError(413, "the image is over 1 MB");
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async function upload(req: IncomingMessage) {
    if (!d.pin) throw new HttpError(503, "logo uploads aren't set up");
    const wallet = (await d.sessionWallet(req)).toLowerCase();
    const mine = recent(byWallet.get(wallet) ?? []);
    all = recent(all);
    if (mine.length >= LOGOS_PER_WALLET) throw new HttpError(429, "that's a lot of logos today: try again tomorrow");
    if (all.length >= LOGOS_PER_DAY) throw new HttpError(429, "logo uploads are busy: try again later");
    const bytes = await body(req);
    const kind = imageKind(bytes);
    if (!kind) throw new HttpError(415, "a logo is a PNG, JPEG, WebP or GIF image");
    const cid = await d.pin(`launch-${wallet.slice(2, 10)}-${now()}.${kind.ext}`, bytes, kind.mime).catch((err) => {
      console.error(`launch logo: ${err instanceof Error ? err.message : err}`);
      throw new HttpError(502, "the upload didn't go through: try again");
    });
    byWallet.set(wallet, [...mine, now()]);
    all.push(now());
    return { uri: `ipfs://${cid}`, url: GATEWAY + cid };
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== "POST" || url.pathname !== "/api/launchpad/logo") return false;
    d.send(res, 200, await upload(req));
    return true;
  }

  return { route, upload };
}
