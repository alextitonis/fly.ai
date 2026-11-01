// The native side: a small transparent window that only catches the mouse over the character, a tray menu and a settings
// window. Everything else lives in the pages (src/); they reach this file only through preload.ts.
import { writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { setLang, t, type Lang } from "../src/i18n.ts";
import { BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, nativeImage, net, powerMonitor, protocol, screen, shell } from "electron";

const PET_SIZE = 300, CURSOR_MS = 50, ON_TOP_MS = 10_000;
const DIST = join(app.getAppPath(), "dist");
const LINKS = /^https:\/\/(www\.flyaiworld\.com|flyai-mine\.fly\.dev)\/|^https:\/\/x\.com\/intent\//;
const IDLE_S = 120, COMPUTE_MS = 5000;

let pet: BrowserWindow, settings: BrowserWindow | null = null, tray: Tray;   // kept here so they aren't garbage collected
let hidden = false, quiet = false;
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
  pet.setAlwaysOnTop(true, "floating");
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lockDown(pet);
  pet.once("ready-to-show", () => pet.showInactive());
  void pet.loadURL("app://fly/index.html");
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

// the same menu from the tray and from right-clicking the fly: Windows 11 tucks a new tray icon away under its ^ arrow
function menu() {
  return Menu.buildFromTemplate([
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
  tray.on("click", () => showSettings());
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
  setInterval(() => { if (!pet.isDestroyed()) pet.setAlwaysOnTop(true, "floating"); }, ON_TOP_MS);   // Windows can drop it
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
  ipcMain.on("menu", () => menu().popup({ window: pet }));
  ipcMain.on("quit", () => app.quit());
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

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {            // opening it again brings it back, and shows the way to close it
    if (hidden) setHidden(false);
    showSettings();
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
  });
}
