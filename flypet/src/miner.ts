// The hidden mining page: the same Miner as the site and the extension. The native side opens this window only while mining
// is on and allowed (electron/main.ts) and closes it to stop, so nothing runs or holds memory otherwise.
// Only the brain jobs and our own world runs: no buyers' programs (some mine coins) and no code from a CDN.
import { Miner, probeGpu } from "../../mine/web/mine-core.ts";
import { MINER_SERVER, prefs, setPrefs } from "./store.ts";

const CONNECTOME = "https://www.flyaiworld.com/simulation/connectome";
const GPU_BATCH = 32, REPORT_MS = 1000;

let phase: "loading" | "running" | "error" = "loading";
let jobs = 0, perMinute = 0, engine = "";
const report = () => window.flyNative?.computeReport({ phase, jobs, perMinute, engine });

const miner = new Miner({
  server: MINER_SERVER,
  connectome: CONNECTOME,
  getToken: () => prefs().minerToken,
  setToken: (minerToken) => { setPrefs({ minerToken }); },
  label: () => "Fly Pet",
  status: (text) => {
    phase = text === "mining" ? "running" : text.startsWith("stopped:") ? "error" : "loading";
    if (phase === "error") console.error(text);
    report();
  },
  lanes: () => {},
  lane: () => {},
  job: () => {},
  session: (s) => { jobs = s.jobs; perMinute = s.perMinute; },
});

async function start() {
  const probe = await probeGpu();
  engine = probe.usable ? "gpu" : "cpu";
  report();
  const threads = Math.max(1, Math.floor(navigator.hardwareConcurrency / 4));
  await miner.start({ engine: probe.usable ? "gpu" : "cpu", batch: GPU_BATCH, threads, programs: true, embed: false, buyerPrograms: false });
}
setInterval(report, REPORT_MS);

if (window.flyNative) void start();
else Object.assign(window, { flypetMiner: { start, stop: () => miner.stop(), state: () => ({ phase, jobs, perMinute, engine }) } });   // a plain browser, for testing
