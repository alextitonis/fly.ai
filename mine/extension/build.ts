/**
 * Builds the unpacked extension into extension/dist. Chrome extensions may not load code from a server, so
 * the engine ships inside: every .ts file the extension reaches is type-stripped (Node's own stripper, as the
 * server does) and its relative .ts imports rewritten to .js, keeping the repo's layout under dist/ so the
 * same relative paths resolve. Also draws the icons.
 *
 *   npm run build:extension    then load extension/dist at chrome://extensions (Developer mode → Load unpacked)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const DIST = join(HERE, "dist");

/** repo-relative sources; each lands at the same path under dist/ with .ts -> .js */
const SCRIPTS = [
  "world/src/connectome.ts", "world/src/rng.ts", "world/src/sim.ts", "world/src/brain.ts", "world/src/eyes.ts", "world/src/senses.ts", "world/src/wiring.ts", "world/src/genome.ts", "world/src/social.ts", "world/src/datalog.ts",
  "mine/src/model.ts", "mine/src/runner.ts", "mine/src/fixed.ts", "mine/src/wasmcheck.ts", "mine/src/probe.ts",
  // fight and replay jobs (2026-10-01 / 10-07; the extension couldn't build without them until 2026-10-17)
  "mine/src/fightjob.ts", "mine/src/replay.ts", "world/src/arena/game.ts", "world/src/arena/readout.ts", "world/src/roulette/game.ts",
  "mine/web/download.ts", "mine/web/wallet.ts", "mine/web/gpu.ts", "mine/web/gpu.worker.ts", "mine/web/miner.worker.ts", "mine/web/mine-core.ts", "mine/web/openjob.ts", "mine/web/open.worker.ts", "mine/web/worldjob.ts",
  "mine/extension/settings.ts", "mine/extension/background.ts", "mine/extension/offscreen.ts", "mine/extension/popup.ts",
];
const STATIC: [string, string][] = [
  ["mine/extension/manifest.json", "manifest.json"],
  ["mine/extension/popup.html", "mine/extension/popup.html"],
  ["mine/extension/popup.css", "mine/extension/popup.css"],
  ["mine/extension/offscreen.html", "mine/extension/offscreen.html"],
  ["mine/web/compute.css", "mine/web/compute.css"],
  ["docs/assets/site.css", "assets/site.css"],
  ["docs/assets/logo.webp", "assets/logo.webp"],
];

/** "./x.ts" and "../y/z.ts" string literals: imports and new URL("./worker.ts", import.meta.url) */
const RELATIVE_TS = /(["'])(\.{1,2}\/[^"'\n]*?)\.ts\1/g;

rmSync(DIST, { recursive: true, force: true });
const write = (to: string, data: string | Buffer) => {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, data);
};

for (const file of SCRIPTS) {
  const code = stripTypeScriptTypes(readFileSync(join(REPO, file), "utf8"), { mode: "strip" });
  write(join(DIST, file.replace(/\.ts$/, ".js")), code.replace(RELATIVE_TS, "$1$2.js$1"));
}
// embeddings load their model code from a CDN, which extensions may not do: the extension never asks for embed jobs
// (offscreen.ts), and ships a worker that refuses, so no remote code is in the package at all
write(join(DIST, "mine/web/embed.worker.js"),
  `// the extension doesn't run embedding jobs (their model code comes from a CDN); see mine/extension/build.ts
self.onmessage = () => self.postMessage({ type: "error", text: "embeddings run on the website only" });
`);
for (const [from, to] of STATIC) {
  mkdirSync(dirname(join(DIST, to)), { recursive: true });
  copyFileSync(join(REPO, from), join(DIST, to));
}

// every relative reference in the built scripts must point at a file that exists
const missing: string[] = [];
for (const file of SCRIPTS) {
  const out = join(DIST, file.replace(/\.ts$/, ".js"));
  for (const m of readFileSync(out, "utf8").matchAll(/(["'])(\.{1,2}\/[^"'\n]*?\.js)\1/g)) {
    if (!existsSync(resolve(dirname(out), m[2]))) missing.push(`${relative(DIST, out)} -> ${m[2]}`);
  }
}
if (missing.length) {
  console.error(`unresolved imports:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

// ---- icons: a fly on the accent green, drawn here so the build needs no image files ------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function png(size: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** coverage of the icon's shapes at a point in unit coordinates (-1..1): [r, g, b, a] */
function shade(u: number, v: number): [number, number, number, number] {
  const inEllipse = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const dx = u - cx, dy = v - cy;
    const a = (dx * c + dy * s) / rx, b = (-dx * s + dy * c) / ry;
    return a * a + b * b <= 1;
  };
  if (u * u + v * v > 1) return [0, 0, 0, 0];
  if (inEllipse(0, 0.1, 0.17, 0.46) || inEllipse(0, -0.42, 0.15, 0.13)) return [28, 28, 26, 255]; // body, head
  if (inEllipse(-0.33, -0.02, 0.2, 0.46, 0.5) || inEllipse(0.33, -0.02, 0.2, 0.46, -0.5)) return [236, 244, 238, 255]; // wings
  return [47, 125, 79, 255];
}

for (const size of [16, 48, 128]) {
  const ss = 4; // supersampled for smooth edges
  write(join(DIST, "icons", `${size}.png`), png(size, (x, y) => {
    const acc = [0, 0, 0, 0];
    for (let i = 0; i < ss; i++) {
      for (let j = 0; j < ss; j++) {
        const [r, g, b, a] = shade(((x + (i + 0.5) / ss) / size) * 2 - 1, ((y + (j + 0.5) / ss) / size) * 2 - 1);
        acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a;
      }
    }
    const a = acc[3] / (ss * ss);
    return a ? [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3], a].map(Math.round) as [number, number, number, number] : [0, 0, 0, 0];
  }));
}

console.log(`built ${relative(REPO, DIST)}: ${SCRIPTS.length} scripts, ${STATIC.length} static files, 3 icons`);
