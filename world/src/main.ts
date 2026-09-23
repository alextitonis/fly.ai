/**
 * Wiring of the page: fixed-timestep simulation, rendering, and the overlay.
 *
 * By default the page watches the shared world that runs on the server (live.ts): every visitor sees the same flies,
 * and nothing is simulated here. ?local runs a private field in this tab instead, with the sliders; so does a page that
 * cannot reach the server.
 *
 * The simulation runs at a fixed 50 Hz (flybrain.dt = 20 ms) in its own
 * accumulator loop, so the network step is decoupled from the frame rate.
 * Every label and bar on screen is a readout of population firing rates.
 */
import "./style.css";
import * as THREE from "three";
import { BrainView, MODALITY_COLOR, POP_COLOR } from "./brainview.ts";
import { Renderer } from "./scene.ts";
import { ECOLOGY, MOTOR, World, type Fly } from "./sim.ts";
import { ORN_AVERSIVE, ORN_CVA, ORN_FOOD, POPULATIONS, type Modality } from "./wiring.ts";
import { Wiz } from "./wiz.ts";
import { WizView } from "./wizview.ts";
import { PuppeteerView } from "./puppeteer.ts";
import { DataPanel } from "./datapanel.ts";
import { LIVE_URL, LiveWorld } from "./live.ts";
import { keyOf, progress, setupSim, t, tx } from "./i18n.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// the page's language first: everything below writes text. The language menu sits in the header, by the back link.
{
  const menu = document.createElement("span");
  menu.id = "langmenu";
  $("back").after(menu);
  await setupSim(menu);
}

const START_FLIES = 36;
// brains start frozen: with learning on the flies forage worse and the population dies out (world/README, tools/lifedata.ts).
// Switch either rule on in the Data card to watch them rewire.
const world = new World(START_FLIES, 1234, { learning: { hebbian: false, reward: false, mb: true } });
const dataPanel = new DataPanel(world);
const renderer = new Renderer($<HTMLCanvasElement>("view"), world);
const wiz = new Wiz(world);
const wizView = new WizView(renderer.scene, `${import.meta.env.BASE_URL}models/wiz.glb`);
const puppeteer = new PuppeteerView(renderer.scene);

// ---- shared world or a private one ---------------------------------------------------------------------------------
let live: LiveWorld | null = null;
const LIVE_ONLY = ["sliders", "threat", "gust", "reset"];         // world-changing controls, hidden while watching
if (!new URLSearchParams(location.search).has("local")) {
  world.flies.length = 0;                                         // nothing until the server's flies arrive
  live = new LiveWorld(world, () => dataPanel.update());
  dataPanel.remote = LIVE_URL;
  for (const id of LIVE_ONLY) $(id).style.display = "none";
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = t("sim.shared.note");
  $("wizbars").before(note);
  setTimeout(() => {
    if (!live || live.status !== "connecting") return;
    // the server is unreachable: run a private field here rather than show an empty one
    live.close();
    live = null;
    dataPanel.remote = null;
    for (const id of LIVE_ONLY) $(id).style.display = "";
    note.textContent = t("sim.shared.unreachable");
    for (const id of ["learnReward", "learnHebb", "learnMemory"]) $<HTMLInputElement>(id).disabled = false;
    world.setFlyCount(START_FLIES);
  }, 10_000);
}
const replay = { fired: new Int32Array(world.wiring.n), firedCount: 0 };
let wizCam = false;
let wizFrame = 0;
const brainView = new BrainView($<HTMLCanvasElement>("brain"), world.wiring, $<HTMLCanvasElement>("raster"));

// ---------------------------------------------------------------- overlay ---
interface Bars { L: HTMLElement; R: HTMLElement }

function makeRow(host: HTMLElement, label: string, sub: string, color: string, solo = false): Bars {
  const row = document.createElement("div");
  row.className = solo ? "row solo" : "row";
  row.innerHTML =
    `<span title="${sub}">${label}</span>` +
    `<div class="bar"><i style="background:${color}"></i></div>` +
    (solo ? "" : `<div class="bar"><i style="background:${color}"></i></div>`);
  host.appendChild(row);
  const bars = row.querySelectorAll<HTMLElement>(".bar i");
  return { L: bars[0], R: bars[solo ? 0 : 1] };
}

function heading(host: HTMLElement, text: string, color: string): void {
  const h = document.createElement("div");
  h.className = "group";
  h.textContent = text;
  h.style.color = color;
  host.appendChild(h);
}

const LIGAND = (type: string) => tx(`sim.ligand.${type}`, type);

heading($("eyes"), t("sim.modality.vision"), MODALITY_COLOR.vision);
const eyeRows = {
  loom: makeRow($("eyes"), "LPLC2", t("sim.senses.loom"), POP_COLOR.LPLC2),
  threat: makeRow($("eyes"), "LC4", t("sim.senses.threat"), POP_COLOR.LC4),
  small: makeRow($("eyes"), "LPLC1", t("sim.senses.small"), POP_COLOR.LPLC1),
  chase: makeRow($("eyes"), "LC10a", t("sim.senses.chase"), POP_COLOR.LC10a),
};
heading($("eyes"), t("sim.senses.food"), MODALITY_COLOR.olfaction);
const ornRows = ORN_FOOD.map((o) => ({ type: o, bars: makeRow($("eyes"), o.replace("ORN_", ""), LIGAND(o), POP_COLOR[o]) }));
heading($("eyes"), t("sim.senses.cva"), MODALITY_COLOR.olfaction);
ornRows.push(...ORN_CVA.map((o) => ({ type: o, bars: makeRow($("eyes"), o.replace("ORN_", ""), LIGAND(o), POP_COLOR[o]) })));
heading($("eyes"), t("sim.senses.aversive"), "#ff7a7a");
ornRows.push(...ORN_AVERSIVE.map((o) => ({ type: o, bars: makeRow($("eyes"), o, LIGAND(o), POP_COLOR[o] ?? "#ff7a7a") })));
heading($("eyes"), t("sim.modality.mechanosensory"), MODALITY_COLOR.mechanosensory);
const mechRows = {
  jo: makeRow($("eyes"), "JO", t("sim.senses.jo"), POP_COLOR.JO),
  leg: makeRow($("eyes"), "SNta", t("sim.senses.leg"), POP_COLOR.SNta),
  load: makeRow($("eyes"), "LgLG", t("sim.senses.load"), POP_COLOR.LgLG),
  taste: makeRow($("eyes"), "LB3", t("sim.senses.taste"), POP_COLOR.LB3, true),
  flow: makeRow($("eyes"), "VS", t("sim.senses.flow"), POP_COLOR.VS ?? "#7fc8ff", true),
};

const rateRows: { bars: Bars; iL: number; iR: number }[] = [];
let lastModality: Modality | null = null;
for (const p of POPULATIONS) {
  if (p.modality !== lastModality) {
    heading($("rates"), tx(`sim.modality.${p.modality}`, p.modality), MODALITY_COLOR[p.modality]);
    lastModality = p.modality;
  }
  rateRows.push({
    bars: makeRow($("rates"), p.name, tx(`sim.pop.${keyOf(p.name)}`, p.note), POP_COLOR[p.name] ?? "#9aa7b5"),
    iL: world.wiring.pops.findIndex((q) => q.name === p.name && q.side === "L"),
    iR: world.wiring.pops.findIndex((q) => q.name === p.name && q.side === "R"),
  });
}

const dnRows = {
  turn: makeRow($("dn"), "DNa02", t("sim.body.turn"), MODALITY_COLOR.descending),
  thrust: makeRow($("dn"), "DNg100", t("sim.body.thrust"), MODALITY_COLOR.descending, true),
  back: makeRow($("dn"), "MDN", t("sim.body.back"), MODALITY_COLOR.descending, true),
  escape: makeRow($("dn"), "DNp01", t("sim.body.escape"), MODALITY_COLOR.descending, true),
};
const mnRows = {
  dlm: makeRow($("motor"), "DLM", t("sim.body.dlm"), MODALITY_COLOR.motor, true),
  b1: makeRow($("motor"), "b1/b2", t("sim.body.b1"), MODALITY_COLOR.motor),
  jump: makeRow($("motor"), "TiExt+St", t("sim.body.jump"), MODALITY_COLOR.motor),
  flex: makeRow($("motor"), t("sim.body.flexLabel"), t("sim.body.flex"), MODALITY_COLOR.motor, true),
};
const motorText = document.createElement("div");
motorText.className = "note";
$("motor").appendChild(motorText);

const wizRows = {
  arms: makeRow($("wizbars"), t("sim.wiz.rows.arms.label"), t("sim.wiz.rows.arms.tip"), MODALITY_COLOR.descending),
  legs: makeRow($("wizbars"), t("sim.wiz.rows.legs.label"), t("sim.wiz.rows.legs.tip"), MODALITY_COLOR.descending),
  head: makeRow($("wizbars"), t("sim.wiz.rows.head.label"), t("sim.wiz.rows.head.tip"), MODALITY_COLOR.descending),
  steer: makeRow($("wizbars"), "DNa02", t("sim.wiz.rows.steer"), MODALITY_COLOR.descending),
  escape: makeRow($("wizbars"), "DNp01", t("sim.wiz.rows.escape"), MODALITY_COLOR.descending),
};
const wizText = document.createElement("div");
wizText.className = "note";
$("wizbars").appendChild(wizText);

// world legend
const LEGEND_COLOR: Record<string, string> = {
  fruit: "#c2493d", mould: "#6f7d63", carrion: "#9b7d76", dung: "#5b4630",
  compost: "#3b3024", plant: "#4b7a54", poop: "#e8e4d8", obstacle: "#3c4756",
  spider: "#15171b", egg: "#f2eddc", larva: "#f2eddc",
};
for (const [kind, color] of Object.entries(LEGEND_COLOR)) {
  const s = document.createElement("span");
  s.innerHTML = `<i style="background:${color}"></i>`;
  s.append(tx(`sim.ecology.${kind}`, ECOLOGY[kind].label));
  $("worldlegend").appendChild(s);
}

// --- sliders ----------------------------------------------------------------
interface SliderSpec {
  label: string; min: number; max: number; step: number; value: number;
  apply: (v: number) => void; fmt?: (v: number) => string;
}

const sliders: SliderSpec[] = [
  { label: t("sim.controls.slider.flies"), min: 1, max: 80, step: 1, value: START_FLIES, apply: (v) => world.setFlyCount(v) },
  { label: t("sim.controls.slider.wind"), min: 0, max: 3, step: 0.05, value: world.wind.strength, apply: (v) => (world.wind.strength = v), fmt: (v) => v.toFixed(2) },
  { label: t("sim.controls.slider.odour"), min: 0, max: 3, step: 0.05, value: 1, apply: (v) => (world.odourStrength = v), fmt: (v) => v.toFixed(2) },
  { label: t("sim.controls.slider.tonic"), min: 0, max: 0.2, step: 0.005, value: world.params.tonic, apply: (v) => (world.params.tonic = v) },
  { label: t("sim.controls.slider.gain"), min: 0.2, max: 4, step: 0.05, value: world.params.gain, apply: (v) => (world.params.gain = v) },
  { label: t("sim.controls.slider.noise"), min: 0, max: 8, step: 0.1, value: world.params.noiseHz, apply: (v) => (world.params.noiseHz = v) },
  { label: t("sim.controls.slider.speed"), min: 0, max: 3, step: 0.05, value: 1, apply: (v) => (world.speedScale = v), fmt: (v) => v.toFixed(2) + "x" },
];

for (const s of sliders) {
  const el = document.createElement("label");
  el.className = "slider";
  const fmt = s.fmt ?? ((v: number) => String(v));
  el.innerHTML = `<span>${s.label}</span><output>${fmt(s.value)}</output>` +
    `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}">`;
  const input = el.querySelector("input")!;
  const out = el.querySelector("output")!;
  input.addEventListener("input", () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    s.apply(v);
  });
  $("sliders").appendChild(el);
}

$("wiz").addEventListener("click", () => {
  wiz.summon(new URL(`${import.meta.env.BASE_URL}connectome/`, document.baseURI).href);
  $("wiz").setAttribute("disabled", "");
});
$("wizcam").addEventListener("click", () => {
  wizCam = !wizCam;
  $("wizcam").classList.toggle("on", wizCam);
  if (wizCam) renderer.camMode = "orbit";
});
$("threat").addEventListener("click", () => world.dropThreat());
$("gust").addEventListener("click", () => {
  world.wind.strength = Math.min(3, world.wind.strength + 1.2);
  world.wind.angle += 1.1;
  setTimeout(() => (world.wind.strength = Math.max(0, world.wind.strength - 1.2)), 4000);
});
$("next").addEventListener("click", () => {
  world.selected = (world.selected + 1) % world.flies.length;
  brainView.clear();
});
$("flycam").addEventListener("click", () => {
  renderer.camMode = renderer.camMode === "follow" ? "orbit" : "follow";
  $("flycam").classList.toggle("on", renderer.camMode === "follow");
});
let drama = false;
$("drama").addEventListener("click", () => {
  drama = !drama;
  $("drama").classList.toggle("on", drama);
  if (drama) {
    renderer.camMode = "follow";
    $("flycam").classList.add("on");
  }
});
$("follow").addEventListener("click", () => {
  renderer.camMode = renderer.camMode === "orbit" ? "follow" : "orbit";
  $("follow").textContent = t(renderer.camMode === "follow" ? "sim.controls.followOn" : "sim.controls.followOff");
  $("follow").classList.toggle("on", renderer.camMode === "follow");
});
// the "what this is" card: open by default, collapsible, remembered per browser
const aboutCard = document.querySelector<HTMLElement>(".card.about")!;
const aboutToggle = $("abouttoggle");
let aboutOpen = true;
try {
  aboutOpen = localStorage.getItem("fly.about") !== "closed";
} catch { /* private window: just leave it open */ }
function setAbout(open: boolean): void {
  aboutOpen = open;
  aboutCard.classList.toggle("folded", !open);
  aboutToggle.textContent = t(open ? "sim.about.hide" : "sim.about.show");
  try {
    localStorage.setItem("fly.about", open ? "open" : "closed");
  } catch { /* ignore */ }
}
setAbout(aboutOpen);
aboutToggle.addEventListener("click", () => setAbout(!aboutOpen));

$("reset").addEventListener("click", () => location.reload());
$("toggle").addEventListener("click", () => $("panel").classList.toggle("hidden"));

// --- labels above the flies --------------------------------------------------
const labelHost = $("labels");
const tags: HTMLElement[] = [];
const ndc = new THREE.Vector3();
const here = new THREE.Vector3();
let labelFrame = 0;

// ------------------------------------------------------------------- loop ---
const DT = world.params.dt;
let acc = 0;
let last = performance.now();
let fps = 60;
let simMs = 0;
let lastSelected = -1;
let dramaTimer = 0;

function tick(now: number): void {
  requestAnimationFrame(tick);
  const wall = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += ((1 / Math.max(wall, 1e-4)) - fps) * 0.08;

  acc += wall * (live ? 1 : world.speedScale);
  let steps = 0;
  const t0 = performance.now();
  if (live) {
    // watching: the server stepped the flies; replay the watched fly's spikes at 50 a second, and step Wiz locally
    live.update(wall);
    if (world.selected !== lastSelected) {
      brainView.clear();
      lastSelected = world.selected;
    }
    if (live.spikes.length > 10) live.spikes.splice(0, live.spikes.length - 10);
    while (acc >= DT && steps < 6) {
      wiz.step(world, DT);
      const fired = live.spikes.shift();
      if (fired) {
        replay.fired.set(fired);
        replay.firedCount = fired.length;
        brainView.record(replay as unknown as Fly["brain"]);
      }
      acc -= DT;
      steps++;
    }
  }
  while (!live && acc >= DT && steps < 6) {
    world.step();
    wiz.step(world, DT);
    const sel = world.flies[world.selected];
    if (sel) {
      if (world.selected !== lastSelected) {
        brainView.clear();
        lastSelected = world.selected;
      }
      brainView.record(sel.brain);
    }
    acc -= DT;
    steps++;
  }
  if (acc > DT * 8) acc = 0;
  if (steps && !live) simMs += ((performance.now() - t0) / steps - simMs) * 0.1;

  // drama cam: whoever is panicking hardest, else whoever has eaten most
  dramaTimer -= wall;
  if (drama && dramaTimer <= 0) {
    dramaTimer = 3;
    let best = world.flies[0], score = -1;
    for (const f of world.flies) {
      const s = f.dn.escape * 100 + (f.feeding ? 3 : 0) + f.motor.jump * 20;
      if (s > score) { score = s; best = f; }
    }
    const idx = world.flies.indexOf(best);
    if (idx >= 0 && idx !== world.selected) {
      world.selected = idx;
      brainView.clear();
    }
  }

  brainView.draw();
  wizView.update(wiz, wall, wizCam, renderer.camera, renderer.controls);
  puppeteer.update(wiz, wizView, wall);
  if (wizFrame++ % 4 === 0) updateWiz();
  renderer.render(wall);
  updateLabels();
  updateEvents();
  updatePanel();
}

// --- event markers: what just happened, floating where it happened ----------
const EVENT_FACE: Record<string, string> = {
  mate: "♥",      // heart
  egg: "●",       // egg laid
  hatch: "✻",     // something new
  feed: "◆",      // a meal started
  attack: "✖",    // a spider strike
  death: "☠",     // a fly died
  poop: "○",      // a dropping: amines for everybody else
  arrive: "➤",    // a newcomer flies in (the always-on world never runs empty)
};
const eventEls: HTMLElement[] = [];
const seenEvents = new WeakSet<object>();

function updateEvents(): void {
  const evs = world.events;
  while (eventEls.length < 40) {
    const el = document.createElement("div");
    el.className = "ev";
    el.style.display = "none";
    labelHost.appendChild(el);
    eventEls.push(el);
  }
  const w = innerWidth, h = innerHeight;
  for (let i = 0; i < eventEls.length; i++) {
    const el = eventEls[i];
    const e = evs[i];
    if (!e) { el.style.display = "none"; continue; }
    if (!seenEvents.has(e)) {
      seenEvents.add(e);
      el.className = "ev " + e.kind;
      el.innerHTML = `<i>${EVENT_FACE[e.kind]}</i>${e.text}`; // what happened is the world's own log line: English
    }
    // it rises and fades over its 6 s life
    const k = Math.min(1, e.age / 6);
    const visible = renderer.project(e.x, e.y + 0.5 + k * 1.4, e.z, ndc);
    if (!visible) { el.style.display = "none"; continue; }
    el.style.display = "";
    el.style.opacity = String(Math.max(0, 1 - k * k));
    el.style.transform = `translate(${(ndc.x * 0.5 + 0.5) * w}px, ${(-ndc.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  }
}

function updateLabels(): void {
  if (labelFrame++ % 2) return;
  const flies = world.flies;
  while (tags.length < flies.length) {
    const el = document.createElement("div");
    el.className = "tag";
    labelHost.appendChild(el);
    tags.push(el);
  }
  const w = innerWidth, h = innerHeight;
  for (let i = 0; i < tags.length; i++) {
    const el = tags[i];
    const f = flies[i];
    if (!f) { el.style.display = "none"; continue; }
    const visible = renderer.project(f.x, f.y + 0.45, f.z, ndc);
    const dist = renderer.camera.position.distanceTo(here.set(f.x, f.y, f.z));
    if (!visible || dist > 26) { el.style.display = "none"; continue; }
    el.style.display = "";
    el.style.transform = `translate(${(ndc.x * 0.5 + 0.5) * w}px, ${(-ndc.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    const cls = "tag " + f.state + (i === world.selected ? " sel" : "");
    if (el.className !== cls) {
      el.className = cls;
      el.innerHTML = `<b>${f.name}</b> ${STATE(f.state)}`;
    }
  }
}

/** what to call the current hour, for the header */
const PHASE = (d: number): string => {
  const phase = d < 0.21 ? "night" : d < 0.3 ? "dawn" : d < 0.46 ? "morning"
    : d < 0.56 ? "midday" : d < 0.72 ? "afternoon" : d < 0.82 ? "dusk" : "night";
  return tx(`sim.phase.${phase}`, phase);
};
/** a fly's state (FLYING, PANIC, ...), in the page's language */
const STATE = (state: string): string => tx(`sim.state.${state}`, state);

let frame = 0;
const set = (b: HTMLElement, v: number) => (b.style.width = Math.max(0, Math.min(100, v * 100)) + "%");

function updatePanel(): void {
  const fly = world.flies[world.selected];
  const n = frame++; // read once: checking frame after the ++ only ever saw odd numbers
  if (!fly && live && n % 30 === 0) $("stats").textContent = t(live.status === "live" ? "sim.stats.empty" : "sim.stats.connecting");
  if (!fly || n % 2) return;

  const d = fly.vision.drive;
  set(eyeRows.loom.L, d.loomL / 0.8); set(eyeRows.loom.R, d.loomR / 0.8);
  set(eyeRows.threat.L, d.threatL / 0.8); set(eyeRows.threat.R, d.threatR / 0.8);
  set(eyeRows.small.L, d.smallL / 0.8); set(eyeRows.small.R, d.smallR / 0.8);
  set(eyeRows.chase.L, d.chaseL / 0.8); set(eyeRows.chase.R, d.chaseR / 0.8);

  for (const r of ornRows) {
    const [l, right] = fly.smell.drive[r.type];
    set(r.bars.L, l / 0.5);
    set(r.bars.R, right / 0.5);
  }
  set(mechRows.jo.L, fly.mech.jo[0] / 0.8); set(mechRows.jo.R, fly.mech.jo[1] / 0.8);
  set(mechRows.leg.L, fly.mech.leg[0] / 0.8); set(mechRows.leg.R, fly.mech.leg[1] / 0.8);
  set(mechRows.load.L, fly.mech.load[0] / 0.8); set(mechRows.load.R, fly.mech.load[1] / 0.8);
  set(mechRows.taste.L, fly.mech.taste / 0.8);
  set(mechRows.flow.L, fly.mech.flow / 0.8);

  for (const r of rateRows) {
    set(r.bars.L, fly.brain.rate[r.iL] / 25);
    set(r.bars.R, fly.brain.rate[r.iR] / 25);
  }

  const dn = fly.dn;
  set(dnRows.turn.L, Math.max(0, -dn.turn) * 6);
  set(dnRows.turn.R, Math.max(0, dn.turn) * 6);
  set(dnRows.thrust.L, dn.thrust * 4);
  set(dnRows.back.L, dn.back * 4);
  set(dnRows.escape.L, dn.escape * 4);

  const m = fly.motor;
  set(mnRows.dlm.L, world.pair("DLM MN", fly) * 3);
  set(mnRows.b1.L, (world.rate("b1 MN", "L", fly) + world.rate("b2 MN", "L", fly)) * 1.6);
  set(mnRows.b1.R, (world.rate("b1 MN", "R", fly) + world.rate("b2 MN", "R", fly)) * 1.6);
  set(mnRows.jump.L, (world.rate("Ti extensor MN", "L", fly) + world.rate("Sternotrochanter MN", "L", fly)) * 1.6);
  set(mnRows.jump.R, (world.rate("Ti extensor MN", "R", fly) + world.rate("Sternotrochanter MN", "R", fly)) * 1.6);
  set(mnRows.flex.L, m.back * 4);

  motorText.textContent = t("sim.body.motor", {
    dlm: (m.thrust * MOTOR.maxRate).toFixed(1), lift: (MOTOR.lift * m.thrust).toFixed(1), gravity: MOTOR.gravity,
    turn: (m.turn * MOTOR.turn).toFixed(2), speed: fly.speed.toFixed(1), height: fly.y.toFixed(1), state: STATE(fly.state),
  });

  const parents = fly.mother !== null
    ? t("sim.brain.childOf", { mother: String(world.log.lineage.get(fly.mother)?.name ?? "?"), father: String(world.log.lineage.get(fly.father ?? -1)?.name ?? "?") })
    : t("sim.brain.founder");
  $("flyid").textContent = t("sim.brain.fly", {
    name: fly.name, sex: fly.sex, gen: fly.generation, parents, age: fly.age.toFixed(0),
    mated: fly.mated ? t("sim.brain.mated") : "", drift: (fly.brain.drift() * 100).toFixed(1),
    courting: fly.courting > 4 ? t("sim.brain.courting", { hz: fly.courting.toFixed(0) }) : "",
  });
  const where = live
    ? t("sim.stats.whereLive", { status: tx(`sim.status.${live.status}`, live.status), viewers: live.viewers })
    : t("sim.stats.wherePrivate", { ms: simMs.toFixed(2) });
  $("stats").textContent = t("sim.stats.line", {
    clock: world.clock, phase: PHASE(world.timeOfDay), flies: world.flies.length, neurons: world.wiring.n,
    synapses: world.wiring.nnz, fps: fps.toFixed(0), where, puffs: live ? live.puffs : world.field.puffCount,
    wind: world.wind.strength.toFixed(1), matings: world.matings, eggs: world.eggsLaid, hatched: world.hatched,
    old: world.deaths.age, starved: world.deaths.starved, eaten: world.deaths.eaten, swatted: world.deaths.swatted,
  });

  if (n % 30 === 0) updateBoard();
  if (n % 60 === 0) updatePopulation();
  if (n % 60 === 30) dataPanel.update();
  if (n % 10 === 0) updateFeed();
}

function updateWiz(): void {
  $("wizstatus").textContent = wizStatus(wiz.status);
  if (!wiz.ready) return;
  const hz = (name: string) => wiz.rate(name) / 25;
  const p = wiz.pull;
  set(wizRows.arms.L, p.armL / 1.5); set(wizRows.arms.R, p.armR / 1.5);
  set(wizRows.legs.L, p.legL / 1.5); set(wizRows.legs.R, p.legR / 1.5);
  set(wizRows.head.L, Math.max(0, p.head)); set(wizRows.head.R, Math.max(0, -p.head));
  set(wizRows.steer.L, hz("DNa02 L")); set(wizRows.steer.R, hz("DNa02 R"));
  set(wizRows.escape.L, hz("DNp01 L")); set(wizRows.escape.R, hz("DNp01 R"));
  const realtime = Math.min(1, 20 / Math.max(20, wiz.ms));
  wizText.textContent = t("sim.wiz.line", {
    doing: tx(`sim.wiz.doing.${wiz.mode}`, wiz.mode), falls: wiz.falls, fired: wiz.fired.toLocaleString(),
    ms: wiz.ms.toFixed(1), rt: (realtime * 100).toFixed(0),
  });
}

/** Wiz's status line (wiz.ts keeps it in English: asleep, loading, the worker's progress, failed: ..., the brain's size) */
function wizStatus(status: string): string {
  if (status === "asleep" || status === "loading") return tx(`sim.wiz.status.${status}`, status);
  if (status.startsWith("failed: ")) return t("sim.wiz.status.failed", { error: status.slice(8) });
  const ready = /^([\d.,\s\u00a0\u202f]+) neurons · ([\d.]+) M synapses$/.exec(status);
  if (ready) return t("sim.wiz.status.ready", { n: ready[1], m: ready[2] });
  return progress("sim.wiz.status", status);
}

// --- population graph: the ecology over the last 5 minutes -------------------
// world.history is [adults, eggs+larvae], one sample per second, capped at 300.
const POP_W = 470;
const POP_H = 120;
const popCanvas = $<HTMLCanvasElement>("popgraph");
popCanvas.width = POP_W;
popCanvas.height = POP_H;
const popCtx = popCanvas.getContext("2d")!;

function drawPopulation(): void {
  const h = world.history;
  const g = popCtx;
  g.fillStyle = "#060707";
  g.fillRect(0, 0, POP_W, POP_H);

  let peak = 4;
  for (const [a, l] of h) peak = Math.max(peak, a, l);
  const top = Math.ceil(peak / 5) * 5;

  // gridlines, one per 5 flies
  g.strokeStyle = "#161b23";
  g.fillStyle = "#4a5666";
  g.font = "9px ui-monospace, monospace";
  g.lineWidth = 1;
  for (let v = 0; v <= top; v += 5) {
    const y = Math.round(POP_H - 12 - (POP_H - 20) * (v / top)) + 0.5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(POP_W, y);
    g.stroke();
    if (v > 0) g.fillText(String(v), 2, y - 2);
  }

  if (h.length < 2) {
    g.fillStyle = "#4a5666";
    g.fillText(t("sim.population.waiting"), 8, POP_H / 2);
    return;
  }

  const x = (i: number) => (POP_W * i) / Math.max(1, h.length - 1);
  const y = (v: number) => POP_H - 12 - (POP_H - 20) * (v / top);

  const series = (pick: (s: [number, number]) => number, color: string, fill: string) => {
    g.beginPath();
    g.moveTo(x(0), y(pick(h[0])));
    for (let i = 1; i < h.length; i++) g.lineTo(x(i), y(pick(h[i])));
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.stroke();
    g.lineTo(x(h.length - 1), POP_H - 12);
    g.lineTo(x(0), POP_H - 12);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  series((s) => s[1], "#ffb23e", "rgba(255,178,62,0.10)");
  series((s) => s[0], "#6cf08a", "rgba(108,240,138,0.12)");

  // time axis: the window is history.length seconds, oldest on the left
  g.fillStyle = "#4a5666";
  g.fillText(`-${h.length}s`, 2, POP_H - 2);
  const nowLabel = t("sim.population.axisNow");
  g.fillText(nowLabel, POP_W - g.measureText(nowLabel).width - 2, POP_H - 2);
}

function updateFeed(): void {
  $("clock").textContent = `${world.clock} · ${PHASE(world.timeOfDay)}`;
  const recent = world.events.slice(-6).reverse();
  if (!recent.length) {
    $("feed").innerHTML = `<div class="feed-empty">${t("sim.feed.empty")}</div>`;
    return;
  }
  $("feed").innerHTML = recent.map((e) =>
    `<div class="feed-row ${e.kind}"><i>${EVENT_FACE[e.kind]}</i><span>${e.text}</span>` +
    `<span>${e.age < 1 ? t("sim.feed.now") : t("sim.feed.ago", { s: e.age.toFixed(0) })}</span></div>`).join("");
}

function updatePopulation(): void {
  drawPopulation();
  const males = world.flies.filter((f) => f.sex === "M").length;
  const brood = world.props.filter((p) => p.kind === "egg" || p.kind === "larva").length;
  const meanAge = world.flies.reduce((s, f) => s + f.age, 0) / Math.max(1, world.flies.length);
  const d = world.deaths;
  $("popnow").textContent = t("sim.population.now", { adults: world.flies.length, brood });
  $("popstats").innerHTML = t("sim.population.stats", {
    adults: world.flies.length, males, females: world.flies.length - males, age: meanAge.toFixed(0),
    matings: world.matings, eggs: world.eggsLaid, hatched: world.hatched,
    old: d.age, starved: d.starved, eaten: d.eaten, swatted: d.swatted,
  });
}

function updateBoard(): void {
  const best = [...world.flies].sort((a, b) => b.stats.fed - a.stats.fed).slice(0, 5);
  const row = (i: number, f: Fly) =>
    `<div class="board-row"><span>${i + 1}</span><b>${f.name}</b>` +
    `<span>${t("sim.board.fed", { s: (f.stats.fed * DT).toFixed(0), m: f.stats.distance.toFixed(0) })}</span>` +
    `<span>${t("sim.board.panics", { n: f.stats.panics })}${f.stats.swatted ? t("sim.board.swatted") : ""}</span></div>`;
  $("board").innerHTML = best.map((f, i) => row(i, f)).join("");
}

if (import.meta.env.DEV) {
  (window as unknown as { __fly: unknown }).__fly = { world, renderer, brainView, wiz, wizView };
}

requestAnimationFrame(tick);
