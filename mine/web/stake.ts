/**
 * /stake: stake and unstake $FLYAI in FlyStaking from the signed-in wallet (account.ts). Reads go through the public
 * RPC; writes are approve / stake / requestUnstake / cancelUnstake / withdraw, with selectors from the server.
 */
import { locale, t } from "./i18n.ts";
import { API } from "./config.ts";
import { $, compact } from "./format.ts";
import { bindWalletRow, errorText, mined, mountAccount, requireWallet, transact } from "./account.ts";
import { api } from "./mine-core.ts";

interface Config {
  contract: string | null; token: string; rpc: string; explorer: string; chain_id: number; chain_name: string; token_symbol: string;
  tiers: { name: string; min: string; multiplier: number }[];
  selectors: Record<"stake" | "requestUnstake" | "cancelUnstake" | "withdraw" | "stakedOf" | "unstaking" | "cooldown" | "totalStaked" | "approve" | "allowance" | "balanceOf", string>;
}

const WEI = 10n ** 18n;
let config: Config;
let account: string | null = null;

const word = (v: bigint | string) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
const data = (selector: string, ...args: (bigint | string)[]) => selector + args.map(word).join("");

function toWei(text: string): bigint {
  const m = /^(\d*)(?:\.(\d{0,18}))?$/.exec(text.trim());
  if (!m || (!m[1] && !m[2])) throw new Error(t("compute.stake.enterAmount"));
  return BigInt(m[1] || "0") * WEI + BigInt((m[2] ?? "").padEnd(18, "0"));
}
function tokens(wei: bigint): string {
  const whole = wei / WEI;
  const frac = (wei % WEI).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  const exact = `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
  // big amounts read better compact; small ones keep their decimals
  return `${whole >= 10_000n ? compact(Number(whole)) : exact} ${config.token_symbol}`;
}

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(config.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? "RPC error");
  return body.result;
}
const read = (to: string, input: string) => rpc("eth_call", [{ to, data: input }, "latest"]) as Promise<string>;
const words = (hex: string) => (hex.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt(`0x${w}`));

function tierFor(staked: bigint) {
  let found: Config["tiers"][number] | null = null;
  for (const t of config.tiers) if (staked >= BigInt(t.min) * WEI) found = t;
  return found;
}

/** Everyone's stake, shown whether or not a wallet is signed in. Tokens waiting to unstake don't count. */
async function refreshTotal(): Promise<void> {
  if (!config.contract) return;
  $("total").textContent = tokens(BigInt(await read(config.contract, config.selectors.totalStaked ?? "0x817b1cd2")));
}

async function refresh(): Promise<void> {
  void refreshTotal().catch(() => {});
  if (!account || !config.contract) return;
  const [staked, unstaking, balance, cooldown] = await Promise.all([
    read(config.contract, data(config.selectors.stakedOf, account)),
    read(config.contract, data(config.selectors.unstaking, account)),
    read(config.token, data(config.selectors.balanceOf, account)),
    read(config.contract, config.selectors.cooldown),
  ]);
  const s = BigInt(staked);
  const [pending, unlocksAt] = words(unstaking);
  const tier = tierFor(s);
  $("staked").textContent = tokens(s);
  $("tier").textContent = tier ? t("compute.stake.tierLine", { tier: tier.name, multiplier: tier.multiplier }) : t("compute.stake.belowFirstTier");
  $("balance").textContent = tokens(BigInt(balance));
  $("cooldown").textContent = t("compute.stake.cooldownDays", { count: Number(BigInt(cooldown)) / 86_400 });
  $("pending").hidden = pending === 0n;
  if (pending > 0n) {
    $("pending-amount").textContent = tokens(pending);
    const unlocked = Date.now() / 1000 >= Number(unlocksAt);
    $("unlocks").textContent = unlocked ? t("compute.stake.now") : new Date(Number(unlocksAt) * 1000).toLocaleString(locale());
    $<HTMLButtonElement>("withdraw").disabled = !unlocked;
  }
}

/** One transaction from the signed-in wallet (the wallet is moved to the staking chain first), then its receipt. */
async function send(to: string, input: string, label: string): Promise<void> {
  delete $("tx").dataset.standing;
  const hash = await transact(to, input, (text) => { $("tx").textContent = t("compute.common.step", { label, text }); });
  $("tx").textContent = t("compute.common.step", { label, text: t("compute.common.waitingForChain") });
  try {
    await mined(hash);
  } catch (err) {
    throw new Error(t("compute.common.step", { label, text: errorText(err) }));
  }
  $("tx").replaceChildren(t("compute.common.stepDone", { label }), " ", Object.assign(document.createElement("a"), { target: "_blank", rel: "noopener" }));
  const link = $("tx").querySelector("a")!;
  link.href = `${config.explorer}/tx/${hash}`;
  link.textContent = t("compute.common.viewTransaction");
}

/** Runs one user action with the buttons disabled and any error shown. */
async function act(fn: () => Promise<void>): Promise<void> {
  const buttons = ["stake", "unstake", "withdraw", "cancel"].map((id) => $<HTMLButtonElement>(id));
  const was = buttons.map((b) => b.disabled);
  buttons.forEach((b) => { b.disabled = true; });
  try {
    account = await requireWallet(); // the buttons show before anyone signs in
    if (!account) return;
    await fn();
  } catch (err) {
    $("tx").dataset.standing = "zeroed";
    $("tx").textContent = errorText(err);
  } finally {
    buttons.forEach((b, i) => { b.disabled = was[i]; });
    await refresh().catch(() => {});
  }
}

async function boot(): Promise<void> {
  config = await api(API, "/api/stake-config", null);
  $("tiers").replaceChildren(...config.tiers.map((t) => {
    const tr = document.createElement("tr");
    for (const text of [t.name, `${compact(Number(t.min))}+ $${config.token_symbol}`, `${t.multiplier}×`]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  }));
  if (config.contract) {
    const link = $<HTMLAnchorElement>("contract-link");
    link.href = `${config.explorer}/address/${config.contract}#code`;
    link.textContent = config.contract;
    void refreshTotal().catch(() => { $("total").textContent = "—"; });
  }
  if (!config.contract) $("note").textContent = t("compute.stake.notLive");

  mountAccount();
  const showError = (err: unknown) => { $("note").textContent = errorText(err); };
  bindWalletRow({
    onChange: (wallet) => {
      account = wallet;
      for (const id of ["staked", "tier", "balance"]) $(id).textContent = "—";
      $("pending").hidden = true;
      void refresh().catch(showError);
    },
    onRefresh: refresh,
    onError: showError,
  });
  $("stake").addEventListener("click", () => void act(async () => {
    const amount = toWei($<HTMLInputElement>("amount").value);
    const allowance = BigInt(await read(config.token, data(config.selectors.allowance, account!, config.contract!)));
    if (allowance < amount) await send(config.token, data(config.selectors.approve, config.contract!, amount), t("compute.stake.approve"));
    await send(config.contract!, data(config.selectors.stake, amount), t("compute.stake.stake"));
  }));
  $("unstake").addEventListener("click", () => void act(async () => {
    const amount = toWei($<HTMLInputElement>("amount").value);
    // a second request restarts the cooldown for everything already waiting
    if (!$("pending").hidden && !confirm(t("compute.stake.alreadyWaiting", { amount: $("pending-amount").textContent ?? "" }))) return;
    await send(config.contract!, data(config.selectors.requestUnstake, amount), t("compute.stake.unstake"));
  }));
  $("withdraw").addEventListener("click", () => void act(() => send(config.contract!, config.selectors.withdraw, t("compute.stake.withdraw"))));
  $("cancel").addEventListener("click", () => void act(() => send(config.contract!, config.selectors.cancelUnstake, t("compute.stake.stakeAgain"))));
}

void boot();
