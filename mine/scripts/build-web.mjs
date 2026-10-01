#!/usr/bin/env node
/**
 * Builds the compute pages for Vercel: node mine/scripts/build-web.mjs <out>  (scripts/vercel-build.sh passes
 * .vercel-out/compute). Pages land at <out>/*.html, so the site serves /compute/, /compute/stake, ...; scripts
 * keep the repo layout under <out> (mine/web, mine/src, world/src) with types stripped by Node's own stripper
 * and relative .ts imports renamed to .js. config.js points the pages at the API on fly.io and the brain files
 * the Simulation already serves. The site's CSS and logo come from /assets/.
 *
 * The wallet kit (wagmi, mine/wallet/) is bundled by esbuild into <out>/mine/web/wallet/: `npm ci` in mine/wallet first.
 *
 * Env: MINE_API (https://flyai-mine.fly.dev) · MINE_CONNECTOME (/simulation/connectome) · MINE_WC_PROJECT_ID (Reown; defaults to the site's project)
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { stripTypeScriptTypes } = nodeModule;
if (typeof stripTypeScriptTypes !== "function") {
  console.error(`build-web needs Node 22.13+ (module.stripTypeScriptTypes); this is ${process.version}`);
  process.exit(1);
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(process.argv[2] ?? join(REPO, ".vercel-out/compute"));
const API = process.env.MINE_API ?? "https://flyai-mine.fly.dev";
const CONNECTOME = process.env.MINE_CONNECTOME ?? "/simulation/connectome";
// Reown (WalletConnect) project id: public, it ships in the page anyway; only listed domains can use it
const WC_PROJECT_ID = process.env.MINE_WC_PROJECT_ID ?? "330e75825d85bf92782cfe559e12bd63";

const SCRIPTS = [
  "world/src/connectome.ts", "world/src/rng.ts", "world/src/sim.ts", "world/src/brain.ts", "world/src/eyes.ts", "world/src/senses.ts", "world/src/wiring.ts", "world/src/genome.ts", "world/src/social.ts", "world/src/datalog.ts",
  "mine/src/model.ts", "mine/src/runner.ts", "mine/src/fixed.ts", "mine/src/wasmcheck.ts", "mine/src/probe.ts",
  // Fly Colosseum fight jobs (mine/src/fightjob.ts) run the game's own code
  "mine/src/fightjob.ts", "world/src/arena/game.ts", "world/src/arena/readout.ts", "world/src/roulette/game.ts",
  "mine/web/i18n.ts", "mine/web/mine-core.ts", "mine/web/format.ts", "mine/web/download.ts", "mine/web/wallet.ts", "mine/web/account.ts", "mine/web/gpu.ts",
  "mine/web/gpu.worker.ts", "mine/web/miner.worker.ts", "mine/web/openjob.ts", "mine/web/open.worker.ts", "mine/web/embed.worker.ts", "mine/web/worldjob.ts",
  "mine/web/app.ts", "mine/web/jobs.ts", "mine/web/stake.ts", "mine/web/claim.ts", "mine/web/leaderboard.ts", "mine/web/results.ts", "mine/web/connect.ts", "mine/web/bench.ts",
];
const PAGES = ["index", "jobs", "stake", "claim", "leaderboard", "results", "connect", "bench"];
const RELATIVE_TS = /(["'])(\.{1,2}\/[^"'\n]*?)\.ts\1/g;

const write = (to, data) => {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, data);
};

rmSync(OUT, { recursive: true, force: true });
for (const file of SCRIPTS) {
  const code = stripTypeScriptTypes(readFileSync(join(REPO, file), "utf8"), { mode: "strip" });
  write(join(OUT, file.replace(/\.ts$/, ".js")), code.replace(RELATIVE_TS, "$1$2.js$1"));
}
// the site's i18n runtime, imported by mine/web/i18n.ts at its repo path; its strings load from /assets/i18n/
write(join(OUT, "docs/assets/i18n/i18n.js"), readFileSync(join(REPO, "docs/assets/i18n/i18n.js")));
write(join(OUT, "mine/web/config.js"),
  `// written by mine/scripts/build-web.mjs\nexport const API = ${JSON.stringify(API)};\nexport const CONNECTOME = ${JSON.stringify(CONNECTOME)};\nexport const WALLETCONNECT_PROJECT_ID = ${JSON.stringify(WC_PROJECT_ID)};\n`);
execFileSync(process.execPath, [join(REPO, "mine/wallet/build.mjs"), join(OUT, "mine/web/wallet")], { stdio: "inherit" });
for (const page of PAGES) copyFileSync(join(REPO, "mine/web", `${page}.html`), join(OUT, `${page}.html`));
copyFileSync(join(REPO, "mine/web/compute.css"), join(OUT, "mine/web/compute.css"));
copyFileSync(join(REPO, "mine/web/compute-api.md"), join(OUT, "compute-api.md")); // the API guide, downloadable from /compute/jobs

// every relative import must resolve, and every page's script must exist
const missing = [];
for (const file of [...SCRIPTS.map((f) => f.replace(/\.ts$/, ".js")), "mine/web/config.js", "docs/assets/i18n/i18n.js"]) {
  const out = join(OUT, file);
  for (const m of readFileSync(out, "utf8").matchAll(/(["'])(\.{1,2}\/[^"'\n]*?\.js)\1/g)) {
    if (!existsSync(resolve(dirname(out), m[2]))) missing.push(`${file} -> ${m[2]}`);
  }
}
for (const page of PAGES) {
  for (const m of readFileSync(join(OUT, `${page}.html`), "utf8").matchAll(/(?:src|href)="\/compute\/([^"#?]+\.(?:js|css))"/g)) {
    if (!existsSync(join(OUT, m[1]))) missing.push(`${page}.html -> /compute/${m[1]}`);
  }
}
if (missing.length) {
  console.error(`unresolved:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log(`built ${relative(REPO, OUT) || OUT}: ${PAGES.length} pages, ${SCRIPTS.length} scripts · API ${API} · brain files ${CONNECTOME} · WalletConnect ${WC_PROJECT_ID ? "on" : "off"}`);
