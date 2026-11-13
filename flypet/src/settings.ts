// The settings window: the fly's name, the wallet link, which flies to follow, alerts.
import { drawCard } from "./card.ts";
import { LANGS, t, type Key, type Lang } from "./i18n.ts";
import { daysTogether, type Fly } from "./mood.ts";
import { applyLang, minerLinkUrl, minerWallet, prefs, setPrefs, walletFeed } from "./store.ts";

const native = window.flyNative;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const nameBox = $<HTMLInputElement>("name"), minUsd = $<HTMLInputElement>("minUsd");
const bubbles = $<HTMLInputElement>("bubbles"), notifications = $<HTMLInputElement>("notifications"), autostart = $<HTMLInputElement>("autostart");
const connect = $<HTMLButtonElement>("connect"), note = $("connectNote");
const langBox = $<HTMLSelectElement>("lang");
langBox.replaceChildren(...Object.entries(LANGS).map(([code, name]) => new Option(name, code)));

/** all the fixed words, again whenever the language changes */
function fillWords() {
  langBox.value = applyLang();
  document.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t as Key); });
  note.textContent = t("set.connectNote");
  $("days").textContent = t("set.days", { day: daysTogether(prefs().born, Date.now()) + 1 });
  void fillCard();
  void fillMining();
}
langBox.addEventListener("change", () => {
  setPrefs({ lang: langBox.value as Lang });
  fillWords();
  void fillWallet();
});

function fillBasics() {
  const p = prefs();
  nameBox.value = p.name;
  minUsd.value = String(p.minUsd);
  bubbles.checked = p.bubbles;
  notifications.checked = p.notifications;
}
nameBox.addEventListener("input", () => {
  setPrefs({ name: nameBox.value.trim() || "Fly" });
  void fillCard();
});
minUsd.addEventListener("input", () => setPrefs({ minUsd: Math.max(0, Number(minUsd.value) || 0) }));
bubbles.addEventListener("change", () => setPrefs({ bubbles: bubbles.checked }));
notifications.addEventListener("change", () => setPrefs({ notifications: notifications.checked }));

const signed = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
async function fillWallet() {
  const { wallet, flies: chosen } = prefs();
  $("out").hidden = !!wallet;
  $("in").hidden = !wallet;
  if (!wallet) return;
  $("who").textContent = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  const box = $("flies");
  try {
    const { flies } = await walletFeed(wallet);
    cardFlies = flies;
    void fillCard();
    const funded = flies.some((f) => f.funded);
    $("noFlies").hidden = funded;
    $("noFlies").textContent = t(flies.length ? "set.fundHint" : "set.none");
    box.replaceChildren(...flies.map((f) => {
      const row = document.createElement("label"), left = document.createElement("span"), pick = document.createElement("input"), pnl = document.createElement("span");
      pick.type = "checkbox";
      pick.checked = !chosen || chosen.includes(f.id);
      pick.disabled = !f.funded;
      pick.addEventListener("change", () => {
        const now = prefs().flies ?? flies.map((x) => x.id);
        const next = pick.checked ? [...new Set([...now, f.id])] : now.filter((id) => id !== f.id);
        setPrefs({ flies: next.length === flies.length ? null : next });
        void fillCard();
      });
      left.append(pick, ` #${f.id}`);
      pnl.textContent = f.funded ? t("set.pnl", { all: signed(f.profit), today: signed(f.profit_24h) }) : t("set.noMoney");
      pnl.className = !f.funded ? "hint" : f.profit >= 0 ? "up" : "down";
      row.append(left, pnl);
      return row;
    }));
  } catch (err) {
    box.textContent = t("set.readFailed");
  }
}

// connecting is the pet's window now (src/panel.ts, 2026-11-13): it signs in with the pet token and picks the fly
connect.addEventListener("click", () => { if (native) native.openPanel(); });
window.addEventListener("focus", () => { void fillWallet(); });
$("disconnect").addEventListener("click", () => {
  setPrefs({ wallet: null, flies: null, petToken: null, petTokenUntil: 0, fly: null });
  cardFlies = [];
  void fillCard();
  void fillWallet();
});

void (native?.autostart() ?? Promise.resolve(null)).then((on) => {
  if (on == null) { $("autostartRow").hidden = true; return; }
  autostart.checked = on;
  autostart.addEventListener("change", () => native?.setAutostart(autostart.checked));
});

$("quit").addEventListener("click", () => native?.quit());

// ---- the share card ---------------------------------------------------------------------------------------------
const card = $<HTMLCanvasElement>("card"), shareNote = $("shareNote");
let cardFlies: Fly[] = [];
async function fillCard() {
  const p = prefs();
  const flies = cardFlies.filter((f) => f.funded && (!p.flies || p.flies.includes(f.id)));
  const { moods } = await (await fetch("avatars/default/avatar.json")).json();
  await drawCard(card, {
    name: p.name, day: daysTogether(p.born, Date.now()) + 1, flies: flies.map((f) => f.id),
    today: flies.reduce((s, f) => s + f.profit_24h, 0), all: flies.reduce((s, f) => s + f.profit, 0), value: flies.reduce((s, f) => s + f.value, 0),
  }, moods, "avatars/default/");
}
async function copyCard() {
  const png = await new Promise<Blob>((resolve) => card.toBlob((b) => resolve(b!), "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  shareNote.textContent = t("set.copied");
  shareNote.hidden = false;
}
$("copy").addEventListener("click", () => { void copyCard(); });
$("saveCard").addEventListener("click", () => { void native?.saveImage(card.toDataURL("image/png")); });
// X can't take a picture through a link, so it goes to the clipboard to paste into the post
$("post").addEventListener("click", () => {
  void copyCard();
  const text = encodeURIComponent(t("card.post", { name: prefs().name }));
  const url = `https://x.com/intent/post?text=${text}&url=${encodeURIComponent("https://www.flyaiworld.com")}`;
  if (native) void native.openUrl(url); else window.open(url);
});
const showShare = () => $("shareSection").scrollIntoView();
native?.onShare(showShare);

// ---- mining: off until turned on; the pet's window tells the native side, which runs it ---------------------------------
const mineOn = $<HTMLInputElement>("mineOn"), mineAnyTime = $<HTMLInputElement>("mineAnyTime");
function fillMineState(s: ComputeState) {
  const rate = s.perMinute >= 10 ? s.perMinute.toFixed(0) : s.perMinute.toFixed(1);
  $("mineStatus").textContent = s.phase === "running" ? t("set.mineRunning", { jobs: s.jobs, rate })
    : s.phase === "loading" ? t("set.mineLoading") : s.phase === "waiting" ? t("set.mineWaiting") : s.phase === "error" ? t("set.mineError") : t("set.mineOff");
}
async function fillMining() {
  const p = prefs();
  mineOn.checked = p.mineOn;
  mineAnyTime.checked = p.mineAnyTime;
  $("mineAnyRow").hidden = !p.mineOn;
  $("mineBox").hidden = !p.mineOn;
  if (!p.mineOn) return;
  void native?.computeState().then(fillMineState);
  try {
    const wallet = await minerWallet();
    $("mineWallet").textContent = wallet ? t("set.mineLinked", { wallet: `${wallet.slice(0, 6)}…${wallet.slice(-4)}` }) : t("set.mineUnlinked");
  } catch { $("mineWallet").textContent = ""; }
}
const saveMining = () => {
  setPrefs({ mineOn: mineOn.checked, mineAnyTime: mineOn.checked && mineAnyTime.checked });
  void fillMining();
};
mineOn.addEventListener("change", saveMining);
mineAnyTime.addEventListener("change", saveMining);
native?.onComputeState(fillMineState);
$("mineLink").addEventListener("click", async () => {
  try {
    const url = await minerLinkUrl();
    if (native) await native.openUrl(url); else window.open(url);
  } catch { $("mineWallet").textContent = t("set.failed"); }
});
window.addEventListener("focus", () => { void fillMining(); });   // back from linking in the browser

fillWords();
fillBasics();
if (location.hash === "#share") setTimeout(showShare, 100);
void fillWallet();
