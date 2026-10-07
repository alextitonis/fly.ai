/**
 * Signing in once for every compute page. A wallet connects (a browser wallet, or a phone's wallet app through
 * WalletConnect) and signs one Sign-In with Ethereum message; the server hands back a session that this browser
 * keeps for 30 days. With it, pages link miners, pay from the balance and stop orders without asking for another
 * signature. Transactions still go through the wallet.
 *
 * wagmi (wallet/kit.js, built from mine/wallet/) is only loaded when a wallet is actually needed, so a page that
 * just shows the signed-in address stays light.
 */
import { API, WALLETCONNECT_PROJECT_ID } from "./config.ts";
import { t } from "./i18n.ts";
import { $ } from "./format.ts";
import { api, ApiError } from "./mine-core.ts";
import { shortAddress } from "./wallet.ts";
import type * as KitModule from "./wallet/kit.js";

type Kit = typeof KitModule;
interface Session { token: string; wallet: string; expires_at: number }

const KEY = "flyai.compute.session";
const listeners = new Set<(wallet: string | null) => void>();

function load(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    return s && s.expires_at > Date.now() ? s : null;
  } catch {
    return null;
  }
}
let session = load();

function save(s: Session | null): void {
  session = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private window: this page only */ }
  for (const fn of listeners) fn(signedIn());
}

/** The signed-in wallet (checksummed), or null. */
export const signedIn = (): string | null => session?.wallet ?? null;

/** Headers that prove the signed-in wallet to the API. */
export const sessionHeaders = (): Record<string, string> => (session ? { "x-flyai-session": session.token } : {});

/** Calls fn now and whenever the signed-in wallet changes, in this tab or another. */
export function onAccount(fn: (wallet: string | null) => void): void {
  listeners.add(fn);
  fn(signedIn());
}

window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  session = load();
  for (const fn of listeners) fn(signedIn());
});

/** A wallet error in words; a refusal in the wallet reads as a cancel. */
export function errorText(err: unknown): string {
  const e = err as { code?: number; name?: string; shortMessage?: string; message?: string; cause?: { code?: number } };
  if (e?.code === 4001 || e?.cause?.code === 4001 || /UserRejected/.test(e?.name ?? "") || /rejected|denied|cancel/i.test(e?.shortMessage ?? "")) return t("compute.account.cancelled");
  return e?.shortMessage ?? e?.message ?? String(err);
}

/** The chains a visitor can pay from (Relay brings it to Robinhood Chain): public RPCs, read by the wallet kit. */
const PAY_CHAINS = [
  { chain_id: 8453, chain_name: "Base", rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  { chain_id: 42161, chain_name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io" },
  { chain_id: 1, chain_name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io" },
];

let kitLoad: Promise<Kit> | null = null;
function kit(): Promise<Kit> {
  kitLoad ??= (async () => {
    const [k, chain] = await Promise.all([import("./wallet/kit.js") as Promise<Kit>, api(API, "/api/orders/config", null)]);
    // USDC payments (card buyers) happen on a second chain, Base; Base, Arbitrum and Ethereum also pay into Robinhood
    // through Relay (2026-10-07, "pay from any chain": the token page's swap box, docs/assets/buy.js)
    const others = [chain.usdc, ...PAY_CHAINS].filter((c, i, all) => c && all.findIndex((x) => x?.chain_id === c.chain_id) === i);
    await k.setup({ chain, others, walletConnectProjectId: WALLETCONNECT_PROJECT_ID || undefined, url: location.origin, icon: `${location.origin}/assets/logo.webp` });
    return k;
  })();
  kitLoad.catch(() => { kitLoad = null; });
  return kitLoad;
}

/** A phone or tablet, whose browser pauses background tabs and has little memory to spare. */
export const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

/** Wallet apps with their own browser, where this page finds the wallet the way a desktop extension would. */
const walletApps = () => {
  const here = location.href;
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${here.replace(/^https?:\/\//, "")}` },
    { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(here)}` },
    { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(here)}` },
  ];
};

// ---- the picker ----------------------------------------------------------------------------------------------
let sheet: { root: HTMLElement; list: HTMLElement; status: HTMLElement; title: HTMLElement; text: HTMLElement } | null = null;
let settle: ((uid: string | null) => void) | null = null;

function picker() {
  if (sheet) return sheet;
  const root = document.createElement("div");
  root.className = "acct-sheet";
  root.hidden = true;
  root.innerHTML = `<div class="acct-panel card pad" role="dialog" aria-modal="true" aria-labelledby="acct-title">
    <div class="acct-head"><h3 id="acct-title"></h3><button type="button" class="btn sm acct-close" aria-label="${t("compute.account.close")}">✕</button></div>
    <p class="caption acct-text"></p>
    <div class="acct-list"></div>
    <p class="codeline acct-status"></p>
  </div>`;
  document.body.append(root);
  const close = () => { root.hidden = true; settle?.(null); settle = null; };
  root.querySelector(".acct-close")!.addEventListener("click", close);
  root.addEventListener("click", (e) => { if (e.target === root) close(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) close(); });
  sheet = {
    root, list: root.querySelector(".acct-list")!, status: root.querySelector(".acct-status")!,
    title: root.querySelector("#acct-title")!, text: root.querySelector(".acct-text")!,
  };
  return sheet;
}

const say = (text: string, bad = false) => {
  const s = picker();
  s.status.textContent = text;
  if (bad) s.status.dataset.standing = "zeroed";
  else delete s.status.dataset.standing;
};

/** Shows the wallets and resolves with the chosen one's uid, or null when closed. */
async function chooseWallet(title: string, text: string, problem = ""): Promise<string | null> {
  const s = picker();
  s.title.textContent = title;
  s.text.textContent = text;
  say(problem, !!problem);
  s.list.replaceChildren(Object.assign(document.createElement("p"), { className: "caption", textContent: t("compute.account.lookingForWallets") }));
  s.root.hidden = false;
  settle?.(null);
  const chosen = new Promise<string | null>((resolve) => { settle = resolve; });
  try {
    const slow = setTimeout(() => say(t("compute.account.stillLooking"), true), 8_000);
    const k = await kit().finally(() => clearTimeout(slow));
    say(problem, !!problem);
    await new Promise((r) => setTimeout(r, 150)); // wallets announce themselves (EIP-6963) just after load
    const options = k.wallets();
    const rows: HTMLElement[] = options.map((w) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "acct-wallet";
      if (w.icon) b.append(Object.assign(document.createElement("img"), { src: w.icon, alt: "", width: 28, height: 28 }));
      else b.append(Object.assign(document.createElement("span"), { className: "acct-icon", textContent: w.kind === "walletconnect" ? "⌁" : "◆" }));
      const label = document.createElement("span");
      label.innerHTML = "<b></b><small></small>";
      label.querySelector("b")!.textContent = w.name;
      label.querySelector("small")!.textContent = w.kind === "walletconnect" ? (isPhone() ? t("compute.account.wcPhone") : t("compute.account.wcScan")) : t("compute.account.inBrowser");
      b.append(label);
      b.addEventListener("click", () => { settle?.(w.uid); settle = null; });
      return b;
    });
    const browserWallets = options.some((w) => w.kind === "browser");
    if (isPhone() && !browserWallets) {
      const head = Object.assign(document.createElement("p"), { className: "caption", textContent: options.length ? t("compute.account.orOpenInApp") : t("compute.account.openInApp") });
      const apps = document.createElement("div");
      apps.className = "acct-apps";
      apps.append(...walletApps().map((a) => Object.assign(document.createElement("a"), { className: "btn sm", href: a.href, textContent: a.name })));
      rows.push(head, apps);
    }
    if (!options.length && !isPhone()) {
      rows.push(Object.assign(document.createElement("p"), { className: "caption", textContent: t("compute.account.noWallet") }));
    }
    s.list.replaceChildren(...rows);
  } catch (err) {
    s.list.replaceChildren();
    say(t("compute.account.couldntLoad", { error: errorText(err) }), true);
  }
  return chosen;
}

async function connectWith(k: Kit, uid: string) {
  const s = picker();
  const wc = k.wallets().find((w) => w.uid === uid)?.kind === "walletconnect";
  // WalletConnect draws its own modal; ours would sit on top of it
  if (wc) s.root.hidden = true;
  say(wc ? "" : t("compute.account.approveConnection"));
  try {
    return await k.connect(uid);
  } finally {
    s.root.hidden = false;
  }
}

/**
 * Connect a wallet and sign in with it. Resolves with the wallet, or null if the picker was closed. The picker stays
 * open showing the error when something fails, so the person can pick again.
 */
export async function signIn(): Promise<string | null> {
  let text = t("compute.account.signInText");
  let uid = await chooseWallet(t("compute.account.signIn"), text);
  for (;;) {
    if (!uid) return null;
    // the list stays usable while a wallet is asked: a wallet extension that never answers (they can break each
    // other) mustn't trap the person, who can pick another wallet or close
    const repick = new Promise<string | null>((resolve) => { settle = resolve; });
    const slow = setTimeout(() => say(t("compute.account.noAnswer"), true), 15_000);
    try {
      const outcome = await Promise.race([signInWith(uid).then((wallet) => ({ wallet })), repick.then((next) => ({ next }))]);
      if ("wallet" in outcome) {
        settle = null;
        picker().root.hidden = true;
        return outcome.wallet;
      }
      uid = outcome.next;
    } catch (err) {
      clearTimeout(slow);
      text = t("compute.account.tryAgain");
      uid = await chooseWallet(t("compute.account.signIn"), text, errorText(err));
    } finally {
      clearTimeout(slow);
    }
  }
}

async function signInWith(uid: string): Promise<string> {
  const k = await kit();
  const c = await connectWith(k, uid);
  say(t("compute.account.signMessage"));
  const { nonce, message } = await api(API, "/api/session/nonce", null, { address: c.address });
  const signature = await k.sign(message);
  say(t("compute.account.checkingSignature"));
  const s = await api(API, "/api/session", null, { nonce, signature }) as { session: string; wallet: string; expires_at: number };
  save({ token: s.session, wallet: s.wallet, expires_at: s.expires_at });
  return s.wallet;
}

export async function signOut(): Promise<void> {
  const headers = sessionHeaders();
  save(null);
  await api(API, "/api/session/end", null, {}, headers).catch(() => {});
  if (kitLoad) await (await kitLoad).disconnect().catch(() => {});
}

/** The signed-in wallet, signing in first if needed; null if the person closed the picker. */
export async function requireWallet(): Promise<string | null> {
  return signedIn() ?? signIn();
}

/** A session the server no longer knows (expired, or signed out elsewhere) is dropped here. */
export function sessionLost(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 401 && session) {
    save(null);
    return true;
  }
  return false;
}

/** The kit with the signed-in wallet connected (connecting it first if this page hasn't yet). */
async function walletFor(): Promise<Kit> {
  const wallet = await requireWallet();
  if (!wallet) throw new Error(t("compute.account.signInFirst"));
  const k = await kit();
  let c = k.connection();
  if (!c) {
    const uid = await chooseWallet(t("compute.account.connectTitle"), t("compute.account.connectText", { wallet: shortAddress(wallet) }));
    if (!uid) throw new Error(t("compute.account.cancelledShort"));
    try {
      c = await connectWith(k, uid);
    } finally {
      picker().root.hidden = true;
    }
  }
  if (c.address.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error(t("compute.account.wrongAccount", { connected: shortAddress(c.address), wallet: shortAddress(wallet) }));
  }
  return k;
}

/**
 * Sends one transaction from the signed-in wallet, on the main chain unless `chainId` says otherwise. Resolves with
 * the hash once the wallet has sent it; `mined` waits for the receipt. `step` narrates.
 */
export async function transact(to: string, data: string, step: (text: string) => void = () => {}, chainId?: number, value?: string): Promise<string> {
  const k = await walletFor();
  step(t("compute.account.confirmInWallet"));
  return k.send(to, data, chainId, value);
}

export async function mined(hash: string, chainId?: number): Promise<void> {
  await (await kit()).receipt(hash, chainId);
}

/** EIP-712 typed data signed by the signed-in wallet (free: nothing is sent). */
export async function signTyped(typed: Parameters<Kit["signTyped"]>[0], step: (text: string) => void = () => {}): Promise<string> {
  const k = await walletFor();
  step(t("compute.account.signTyped"));
  return k.signTyped(typed);
}

// ---- every page: the session check ------------------------------------------------------------------------------
/**
 * Checks the saved session is still good (a stale one signs out). The sign-in button itself is the site nav's
 * (docs/assets/nav.js): 2026-10-04, the user: "double login buttons" - this used to add a second one to the tabs.
 */
export function mountAccount(): void {
  if (!session) return;
  api(API, "/api/session", null, undefined, sessionHeaders()).catch(sessionLost);
}

/**
 * The "Wallet: <address> [Sign in | Refresh]" row (#account, #connect) on claim, stake and jobs - 2026-10-04: one
 * copy instead of three. Calls onChange now and on every sign-in change; the button refreshes when signed in and
 * signs in otherwise (signed out, nav.js turns its data-nav-signin button into a pointer to the nav's sign-in).
 */
export function bindWalletRow(opts: { onChange: (wallet: string | null) => void; onRefresh: () => Promise<unknown>; onError?: (err: unknown) => void }): void {
  onAccount((wallet) => {
    $("account").textContent = wallet ? shortAddress(wallet) : t("compute.common.notSignedIn");
    $("account").title = wallet ?? "";
    $("connect").textContent = wallet ? t("compute.common.refresh") : t("compute.common.signIn");
    opts.onChange(wallet);
  });
  $("connect").addEventListener("click", () => void (signedIn() ? opts.onRefresh() : requireWallet()).catch(opts.onError ?? (() => {})));
}
