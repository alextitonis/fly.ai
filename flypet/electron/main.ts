// The native side: a small transparent window that only catches the mouse over the character, a tray menu and a settings
// window. Everything else lives in the pages (src/); they reach this file only through preload.ts.
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { setLang, t, type Lang } from "../src/i18n.ts";
import { BrowserWindow, Menu, Notification, Tray, app, desktopCapturer, dialog, globalShortcut, ipcMain, nativeImage, net, powerMonitor, protocol, screen, shell } from "electron";

const PET_SIZE = 300, CURSOR_MS = 50, ON_TOP_MS = 2_000;
const DIST = join(app.getAppPath(), "dist");
const LINKS = /^https:\/\/(www\.flyaiworld\.com|flyai-mine\.fly\.dev)\/|^https:\/\/x\.com\/intent\/|^https:\/\/dexscreener\.com\//;
const IDLE_S = 120, COMPUTE_MS = 5000;

let pet: BrowserWindow, settings: BrowserWindow | null = null, panel: BrowserWindow | null = null, tray: Tray;   // kept here so they aren't garbage collected
let hidden = false, quiet = false, coachOn = false;
const COACH_KEY = "Alt+Shift+C";   // the coach's hotkey (one hint); not Ctrl+Alt, which is AltGr on Turkish and Spanish keyboards
interface ComputeState { phase: "off" | "waiting" | "loading" | "running" | "error"; jobs: number; perMinute: number; engine: string }

// the pages load from app:// rather than file://, which can't fetch avatar.json or read a GIF's pixels
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serveApp() {
  protocol.handle("app", (req) => {
    const file = normalize(join(DIST, decodeURIComponent(new URL(req.url).pathname)));
    if (!file.startsWith(DIST + sep)) return new Response(null, { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function lockDown(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

const webPreferences = { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true };

function createPet() {
  pet = new BrowserWindow({
    width: PET_SIZE, height: PET_SIZE, title: "Fly Pet", transparent: true, frame: false, hasShadow: false, resizable: false, maximizable: false,
    fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, webPreferences,
  });
  // always on top (2026-11-13, the user: Alt+Tab dropped it behind other windows): the highest level, put back whenever it
  // loses the focus (its chat takes the keyboard) and every ON_TOP_MS
  keepOnTop();
  pet.on("blur", () => setTimeout(keepOnTop, 50));
  pet.on("hide", () => setTimeout(keepOnTop, 50));
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lockDown(pet);
  pet.once("ready-to-show", () => pet.showInactive());
  void pet.loadURL("app://fly/index.html");
}

function keepOnTop() {
  if (!pet || pet.isDestroyed() || !pet.isVisible()) return;
  pet.setAlwaysOnTop(true, "screen-saver");
  pet.moveTop();
}

// made when asked for and gone when closed: a second page held open all day costs about 70 MB. The pet keeps running.
function showSettings(section = "") {
  if (settings) {
    settings.show();
    settings.focus();
    if (section === "share") settings.webContents.send("share");
    return;
  }
  settings = new BrowserWindow({ width: 420, height: 660, title: "Fly Pet Settings", icon: join(DIST, "tray.png"), resizable: false, autoHideMenuBar: true, backgroundColor: "#0b0b0b", webPreferences });
  settings.setMenu(null);
  lockDown(settings);
  settings.on("closed", () => { settings = null; });
  void settings.loadURL(`app://fly/settings.html${section ? `#${section}` : ""}`);
}

// the pet's own window (2026-11-13): sign in, pick the fly, then its log, a chat and the alpha calls (src/panel.ts). Made when
// asked for, gone when closed, like settings
function showPanel(what = "") {
  if (panel) {
    panel.show();
    panel.focus();
    panel.webContents.send("panel", what);
    return;
  }
  panel = new BrowserWindow({ width: 440, height: 680, minWidth: 360, minHeight: 480, title: "Fly Pet", icon: join(DIST, "tray.png"), autoHideMenuBar: true, backgroundColor: "#0b0b0b", webPreferences });
  panel.setMenu(null);
  lockDown(panel);
  panel.on("closed", () => { panel = null; });
  if (!app.isPackaged) panel.webContents.openDevTools({ mode: "detach" });   // npm start: the console, for testing
  void panel.loadURL(`app://fly/panel.html${what ? `#${what}` : ""}`);
}

// the same menu from the tray and from right-clicking the fly: Windows 11 tucks a new tray icon away under its ^ arrow
function menu() {
  return Menu.buildFromTemplate([
    { label: t("menu.open"), click: () => pet.webContents.send("open", "") },
    { label: t("menu.alpha"), click: () => pet.webContents.send("open", "alpha") },
    { type: "separator" },
    { label: t("menu.coach"), type: "checkbox", checked: coachOn, click: () => pet.webContents.send("coach", "toggle") },
    { label: t("menu.coachAsk"), accelerator: COACH_KEY, registerAccelerator: false, click: () => pet.webContents.send("coach", "hint") },
    { label: t("menu.coachPick"), click: () => showPanel("coach") },
    { type: "separator" },
    { label: t("menu.feed"), click: () => pet.webContents.send("feed") },
    { label: t("menu.hide"), type: "checkbox", checked: hidden, click: (item) => setHidden(item.checked) },
    { label: t("menu.quiet"), type: "checkbox", checked: quiet, click: (item) => setQuiet(item.checked) },
    { type: "separator" },
    { label: t("menu.share"), click: () => showSettings("share") },
    { label: t("menu.settings"), click: () => showSettings() },
    { label: t("menu.close"), click: () => app.quit() },
  ]);
}
function setHidden(on: boolean) {
  hidden = on;
  if (on) pet.hide(); else pet.showInactive();
  tray.setContextMenu(menu());
}
function setQuiet(on: boolean) {
  quiet = on;
  pet.webContents.send("quiet", on);
  tray.setContextMenu(menu());
}
function createTray() {
  tray = new Tray(join(DIST, "tray.png"));
  tray.setToolTip("Fly Pet");
  tray.setContextMenu(menu());
  tray.on("click", () => pet.webContents.send("open", ""));
}

/**
 * A transparent window still catches clicks, and on Linux a window that ignores clicks gets no mouse moves at all. So
 * the cursor is read here on every system, and the page answers with set-ignore for what's under it.
 */
function watchCursor() {
  setInterval(() => {
    if (pet.isDestroyed() || !pet.isVisible()) return;
    const c = screen.getCursorScreenPoint(), b = pet.getBounds();
    const x = c.x - b.x, y = c.y - b.y;
    pet.webContents.send("cursor", { x, y, inside: x >= 0 && y >= 0 && x < b.width && y < b.height });
  }, CURSOR_MS);
  setInterval(keepOnTop, ON_TOP_MS);                 // Windows can drop it
}

/**
 * Mining runs in its own hidden window, only while it's on and allowed: closing that window is the whole of stopping it, so
 * nothing runs or holds memory otherwise. Never on battery; without "any time", only after IDLE_S with no mouse or keyboard.
 */
let mineOn = false, mineAnyTime = false, miner: BrowserWindow | null = null;
let computeState: ComputeState = { phase: "off", jobs: 0, perMinute: 0, engine: "" };
function setComputeState(s: ComputeState) {
  computeState = s;
  settings?.webContents.send("compute-state", s);
}
function computeTick() {
  const allowed = mineOn && !powerMonitor.isOnBatteryPower() && (mineAnyTime || powerMonitor.getSystemIdleTime() >= IDLE_S);
  if (allowed && !miner) {
    miner = new BrowserWindow({ show: false, title: "Fly Pet mining", webPreferences: { ...webPreferences, backgroundThrottling: false } });
    lockDown(miner);
    miner.on("closed", () => {
      miner = null;
      setComputeState({ phase: mineOn ? "waiting" : "off", jobs: 0, perMinute: 0, engine: "" });
    });
    setComputeState({ phase: "loading", jobs: 0, perMinute: 0, engine: "" });
    void miner.loadURL("app://fly/miner.html");
  } else if (!allowed && miner) {
    miner.close();                             // its page gives its unfinished jobs back as it goes
  } else if (!allowed) {
    const phase = mineOn ? "waiting" : "off";
    if (computeState.phase !== phase) setComputeState({ phase, jobs: 0, perMinute: 0, engine: "" });
  }
}

function handleCalls() {
  ipcMain.on("compute", (_e, on: boolean, anyTime: boolean) => {
    mineOn = !!on;
    mineAnyTime = !!anyTime;
    computeTick();
  });
  ipcMain.handle("compute-state", () => computeState);
  ipcMain.on("compute-report", (e, s: Omit<ComputeState, "phase"> & { phase: "loading" | "running" | "error" }) => {
    if (miner && e.sender === miner.webContents) setComputeState(s);
  });
  ipcMain.handle("save-image", async (_e, dataUrl: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: "fly-pet.png", filters: [{ name: "PNG", extensions: ["png"] }] });
    if (!canceled && filePath) await writeFile(filePath, nativeImage.createFromDataURL(dataUrl).toPNG());
  });
  ipcMain.on("place", (_e, x: number, y: number) => {
    // bounds, not position: setPosition can grow a window that crosses screens with different scaling
    pet.setBounds({ x: Math.round(x), y: Math.round(y), width: PET_SIZE, height: PET_SIZE });
  });
  // the fly's own chat (2026-11-13, the user: "the chat etc to be on itself not a separate thing/tab"): the window grows
  // around the fly for the chat panel, and takes the keyboard while it's open
  ipcMain.on("frame", (_e, x: number, y: number, w: number, h: number) => {
    pet.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(Math.max(PET_SIZE, Math.min(w, 600))), height: Math.round(Math.max(PET_SIZE, Math.min(h, 1000))) });
  });
  ipcMain.on("pet-focus", (_e, on: boolean) => {
    pet.setFocusable(!!on);
    if (on) pet.focus(); else pet.blur();
    keepOnTop();
  });
  ipcMain.on("menu", () => menu().popup({ window: pet }));
  ipcMain.on("panel", (_e, what: string) => showPanel(typeof what === "string" ? what : ""));
  ipcMain.on("panel-close", () => { panel?.close(); pet.webContents.send("open", ""); });   // picked: the chat opens on the fly
  ipcMain.on("quit", () => app.quit());
  // ---- the game coach (flytrade/COACH-PLAN.md): the pet only looks; it never sends input to a game ----------------
  // the open windows to pick the game from, with small thumbnails: only while the picker is open, never in a loop
  ipcMain.handle("coach-sources", async () => {
    const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
    const list = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 240, height: 135 }, fetchWindowIcons: false });
    return list.filter((s) => !own.has(s.id) && s.name && !s.thumbnail.isEmpty())
      .map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() }));
  });
  // the picked window's process name, as Task Manager shows it (Windows: tasklist, once per pick) - the coach matches its
  // tuned games on it. Elsewhere none: the server goes by the window title
  ipcMain.handle("coach-process", (_e, title: string) => new Promise<string | null>((resolve) => {
    if (process.platform !== "win32" || typeof title !== "string" || !title) return resolve(null);
    execFile("tasklist", ["/v", "/fo", "csv", "/nh", "/fi", `WINDOWTITLE eq ${title.replace(/"/g, "")}`], { timeout: 8000, windowsHide: true },
      (err, out) => resolve(err ? null : (/^"([^"]+\.exe)"/im.exec(out)?.[1] ?? null)));
  }));
  // finding the game by itself (2026-11-14, the user: "shouldn't it automatically select?"): the capturable windows with
  // their program name and install folder - one PowerShell call when Coach mode starts or a hint is asked, never in a
  // loop. The matching is done in the page (src/coach.ts) against the coach's game list: titles stay on this PC.
  ipcMain.handle("coach-detect", async () => {
    const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
    const sources = (await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false }))
      .filter((s) => !own.has(s.id) && s.name);
    const procs = await windowPrograms();
    return sources.map((s) => {
      const p = procs.find((x) => x.t === s.name);
      return { id: s.id, name: s.name, process: p ? `${p.p}.exe` : null, path: p?.f ?? null };
    });
  });
  // how hard the whole app works (percent of one core, all its processes) and how long the user has been away
  ipcMain.handle("coach-load", () => ({
    cpu: app.getAppMetrics().reduce((s, m) => s + (m.cpu?.percentCPUUsage ?? 0), 0),
    idle: powerMonitor.getSystemIdleTime(),
  }));
  ipcMain.on("coach-state", (_e, on: boolean) => {
    coachOn = !!on;
    tray?.setContextMenu(menu());
  });
  ipcMain.on("lang", (_e, lang: Lang) => {
    setLang(lang);
    tray?.setContextMenu(menu());
  });
  ipcMain.on("set-ignore", (_e, through: boolean) => pet.setIgnoreMouseEvents(!!through));
  ipcMain.handle("work-area", () => screen.getDisplayMatching(pet.getBounds()).workArea);
  ipcMain.on("notify", (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title: String(title), body: String(body), silent: true }).show();
  });
  ipcMain.handle("open-url", (_e, url: string) => {
    if (!LINKS.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("that link isn't ours");
    return shell.openExternal(url);
  });
  // no login items on Linux: the settings window hides the box when this says null
  ipcMain.handle("autostart-get", () => (process.platform === "linux" ? null : app.getLoginItemSettings().openAtLogin));
  ipcMain.on("autostart-set", (_e, on: boolean) => app.setLoginItemSettings({ openAtLogin: !!on }));
}

/** Windows: every program with a window - its name, its window's title and where it is installed (Get-Process). Elsewhere
 * nothing: the coach then goes by the window titles alone. A program run as admin may hide its folder: name only. */
function windowPrograms(): Promise<{ p: string; t: string; f: string | null }[]> {
  if (process.platform !== "win32") return Promise.resolve([]);
  const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowTitle } | " +
    "ForEach-Object { [pscustomobject]@{ p = $_.ProcessName; t = $_.MainWindowTitle; f = $(try { $_.Path } catch { $null }) } } | ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 12_000, windowsHide: true, encoding: "utf8", maxBuffer: 4 << 20 },
      (err, out) => {
        if (err) return resolve([]);
        try {
          const j = JSON.parse(String(out).trim() || "[]");
          resolve((Array.isArray(j) ? j : [j]).filter((x) => x && x.p && x.t));
        } catch { resolve([]); }
      });
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {            // opening it again brings it back, and shows the way to close it
    if (hidden) setHidden(false);
    pet.webContents.send("open", "");
  });
  app.on("window-all-closed", () => {});     // it lives in the tray
  app.dock?.hide();                          // and on macOS not in the Dock
  if (process.platform === "win32") app.setAppUserModelId("com.flyaiworld.flypet");
  void app.whenReady().then(() => {
    serveApp();
    handleCalls();
    createPet();
    createTray();
    watchCursor();
    setInterval(computeTick, COMPUTE_MS);
    globalShortcut.register(COACH_KEY, () => pet.webContents.send("coach", "hint"));   // false if another app holds it
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
}
