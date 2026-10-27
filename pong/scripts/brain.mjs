// Copies the web export of the connectome (world/public/connectome, written by `flybrain export --web`) into
// public/connectome, where the brain worker loads it. Skips files that are already there with the same size.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "..", "world", "public", "connectome");
const to = join(here, "..", "public", "connectome");
if (!existsSync(join(from, "brain.json"))) {
  console.error(`no brain at ${from}: run \`flybrain export --web\` (see world/README.md)`);
  process.exit(1);
}
mkdirSync(to, { recursive: true });
let copied = 0;
for (const f of readdirSync(from)) {
  const dst = join(to, f);
  if (existsSync(dst) && statSync(dst).size === statSync(join(from, f)).size) continue;
  copyFileSync(join(from, f), dst);
  copied++;
}
console.log(copied ? `brain: copied ${copied} file(s) into public/connectome` : "brain: up to date");
