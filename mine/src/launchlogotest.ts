/**
 * Launch logo uploads (src/launchlogo.ts) with a fake Pinata and fake sign-ins: what's accepted, what's refused, the
 * limits, and the exact request Pinata gets.
 *   npm run test:launchlogo
 */
import { Readable } from "node:stream";
import { createLaunchLogo, imageKind, pinataPin, LOGOS_PER_WALLET, MAX_BYTES, GATEWAY } from "./launchlogo.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(50)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(50)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

check("kinds from the bytes", imageKind(PNG)?.ext === "png" && imageKind(JPG)?.ext === "jpg" && imageKind(WEBP)?.ext === "webp" && imageKind(GIF)?.ext === "gif");
check("SVG and text are not images", imageKind(SVG) === null && imageKind(Buffer.from("hello world")) === null);

// the request Pinata gets
let sentTo = "", sentAuth = "", sentForm: FormData | null = null;
const fakeFetch = (async (u: string, init: any) => {
  sentTo = u; sentAuth = init.headers.authorization; sentForm = init.body;
  return new Response(JSON.stringify({ IpfsHash: "bafytestcid" }), { status: 200 });
}) as unknown as typeof fetch;
const cid = await pinataPin("jwt-x", fakeFetch)("a.png", PNG, "image/png");
const file = sentForm!.get("file") as File;
check("pinata: endpoint, bearer key, CID v1, the file", cid === "bafytestcid" && sentTo.endsWith("/pinning/pinFileToIPFS") && sentAuth === "Bearer jwt-x"
  && JSON.parse(String(sentForm!.get("pinataOptions"))).cidVersion === 1 && file.size === PNG.length && file.type === "image/png");
const bad = pinataPin("jwt-x", (async () => new Response("no", { status: 401 })) as unknown as typeof fetch);
check("pinata refusing throws", await bad("a.png", PNG, "image/png").then(() => false, () => true));

// the endpoint
let clock = 1_800_000_000_000;
const pinned: string[] = [];
const req = (bytes: Buffer, wallet: string | null, length?: number) => Object.assign(Readable.from([bytes]), {
  method: "POST", headers: { "content-length": String(length ?? bytes.length), ...(wallet ? { "x-wallet": wallet } : {}) },
}) as any;
const logo = createLaunchLogo({
  pin: async (name) => { pinned.push(name); return `cid${pinned.length}`; },
  sessionWallet: async (r: any) => { if (!r.headers["x-wallet"]) throw new HttpError(401, "not signed in"); return r.headers["x-wallet"]; },
  HttpError, send: () => {}, now: () => clock,
});
const status = (p: Promise<unknown>) => p.then(() => 200, (e: any) => e.status ?? 500);
const W = "0xAbC0000000000000000000000000000000000001";

const ok = await logo.upload(req(PNG, W));
check("a PNG: ipfs uri + our gateway", ok.uri === "ipfs://cid1" && ok.url === `${GATEWAY}cid1` && /^launch-abc00000-\d+\.png$/.test(pinned[0]), JSON.stringify(ok));
check("not signed in: 401, nothing pinned", (await status(logo.upload(req(PNG, null)))) === 401 && pinned.length === 1);
check("an SVG: 415", (await status(logo.upload(req(SVG, W)))) === 415);
check("over 1 MB by its header: 413", (await status(logo.upload(req(PNG, W, MAX_BYTES + 1)))) === 413);
check("over 1 MB by its bytes: 413", (await status(logo.upload(req(Buffer.concat([PNG, Buffer.alloc(MAX_BYTES)]), W, 10)))) === 413);
for (let i = 1; i < LOGOS_PER_WALLET; i++) await logo.upload(req(JPG, W));
check(`${LOGOS_PER_WALLET} a wallet a day, then 429`, (await status(logo.upload(req(PNG, W)))) === 429 && pinned.length === LOGOS_PER_WALLET);
check("another wallet still can", (await status(logo.upload(req(GIF, "0x2" + "0".repeat(39))))) === 200);
clock += 86_400_001;
check("a day later the wallet can again", (await status(logo.upload(req(WEBP, W)))) === 200);
const off = createLaunchLogo({ pin: null, sessionWallet: async () => W, HttpError, send: () => {} });
check("no Pinata key: 503", (await status(off.upload(req(PNG, W)))) === 503);
const failing = createLaunchLogo({ pin: async () => { throw new Error("down"); }, sessionWallet: async () => W, HttpError, send: () => {} });
check("Pinata down: 502", (await status(failing.upload(req(PNG, W)))) === 502);
check("GET is not ours", !(await logo.route({ method: "GET" } as any, {} as any, new URL("http://x/api/launchpad/logo"))));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
