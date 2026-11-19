// One machine, three programs (2026-11-18, to save a machine): the Discord bot (src/index.ts) and fly.ai's Virtuals ACP
// provider agent (acp/provider.mjs, source in flytrade/acp, staged into the image by deploy.sh). Each runs as its own
// child; when one dies it alone restarts after 10 s, the other keeps running.
// The agent keeps its state in its own folder on the volume (ACP_DATA, default /data/acp-agent), so its files never
// mix with the bot's. ACP=0 turns the agent off (its kill switch; open jobs expire, nobody is charged).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACP_DATA = process.env.ACP_DATA || "/data/acp-agent";
const log = (...a) => console.log(new Date().toISOString(), "[start]", ...a);

const children = new Map();
let stopping = false;
function run(name, file, env) {
  const child = spawn(process.execPath, [file], { cwd: dirname(file), env: { ...process.env, ...env }, stdio: "inherit" });
  children.set(name, child);
  child.on("exit", (code, sig) => {
    children.delete(name);
    if (stopping) return;
    log(`${name} exited (${sig || code}) - restarting in 10 s`);
    setTimeout(() => run(name, file, env), 10_000);
  });
}

// a machine stop / deploy: pass it on so both shut down cleanly, then go
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    for (const c of children.values()) c.kill(sig);
    setTimeout(() => process.exit(0), 5_000).unref();
    const done = setInterval(() => { if (!children.size) process.exit(0); }, 100);
    done.unref();
  });
}

run("bot", join(HERE, "src", "index.ts"), {});

const provider = join(HERE, "acp", "provider.mjs");
if (process.env.ACP === "0") log("ACP=0: the Virtuals agent is off");
else if (!existsSync(provider)) log("no acp/provider.mjs in this image: the Virtuals agent is off");
else {
  mkdirSync(ACP_DATA, { recursive: true });
  // DATA_DIR/HOME only for the agent: the bot keeps DATA_DIR=/data. ACP_CONFIG_DIR and XDG_* are image-wide (Dockerfile)
  // so `fly ssh console` runs of the acp CLI see the same sign-in.
  run("acp", provider, { DATA_DIR: ACP_DATA, HOME: ACP_DATA });
}

// Fly Desk for agents (acp/agentdesk.mjs, 2026-11-19): answers Agent ID holders' asks on BNB Chain. Off unless its
// secrets AGENTDESK_ADDRESS + AGENTDESK_OPERATOR_KEY are set; AGENTDESK=0 turns it off. State in /data/agentdesk.json.
const desk = join(HERE, "acp", "agentdesk.mjs");
if (process.env.AGENTDESK === "0") log("AGENTDESK=0: the agent desk is off");
else if (!process.env.AGENTDESK_ADDRESS || !process.env.AGENTDESK_OPERATOR_KEY) log("agent desk not set up (AGENTDESK_ADDRESS / AGENTDESK_OPERATOR_KEY): off");
else if (existsSync(desk)) run("agentdesk", desk, {});
