/**
 * /claim: a wallet's monthly claims. The server hands over each claim's amount, proof and ready-made
 * calldata; this page reads MonthlyClaims through the public RPC (funded yet? claimed yet?) and sends the
 * claim transaction from the signed-in wallet (account.ts).
 */
import { t } from "./i18n.ts";
import { API } from "./config.ts";
import { $, compact, num } from "./format.ts";
import { bindWalletRow, errorText, mined, mountAccount, transact } from "./account.ts";
import { api } from "./mine-core.ts";

interface Claim {
  month: string; month_id: number; points: number; amount: string; amount_wei: string;
  claim_data: string; has_claimed_data: string; month_data: string;
  /** the contract that pays this month; September 2026 stays on the first one (absent on older servers) */
  contract?: string | null;
}
interface Claims {
  wallet: string; contract: string | null; chain_id: number; chain_name: string; rpc: string; explorer: string; token_symbol: string;
  claims: Claim[];
}

let account: string | null = null;
let data: Claims | null = null;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(data!.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? "RPC error");
  return body.result;
}
const call = (to: string, input: string) => rpc("eth_call", [{ to, data: input }, "latest"]) as Promise<string>;
const word = (hex: string, i: number) => BigInt("0x" + (hex.slice(2 + 64 * i, 2 + 64 * (i + 1)) || "0"));
const pad = (address: string) => address.slice(2).toLowerCase().padStart(64, "0");
const contractOf = (c: Claim): string | null => c.contract ?? data!.contract;
const day = (seconds: bigint) => new Date(Number(seconds) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/**
 * MonthlyClaimsV2's minimum hold for `account`: what it needs and what it holds, or null when there's nothing to hold
 * (the first contract has no minHold(), so the call reverts and counts as none).
 */
async function holdCheck(contract: string): Promise<{ need: bigint; held: bigint } | null> {
  let need = 0n;
  try { need = BigInt(await call(contract, "0xd471ed75")); } catch { return null; } // minHold()
  if (need === 0n) return null;
  const token = "0x" + (await call(contract, "0xfc0c546a")).slice(26); // token()
  const held = BigInt(await call(token, "0x70a08231" + pad(account!))); // balanceOf(account)
  return held >= need ? null : { need, held };
}

async function load(): Promise<void> {
  if (!account) return;
  const [claims, current] = await Promise.all([
    api(API, `/api/claims?wallet=${account}`, null) as Promise<Claims>,
    api(API, "/api/month", null),
  ]);
  data = claims;
  if (claims.contract) {
    const link = $("contract-link") as HTMLAnchorElement;
    link.href = `${claims.explorer}/address/${claims.contract}#code`;
    link.textContent = claims.contract;
  }
  showMonth(current);

  if (!claims.claims.length) {
    $("note").textContent = t("compute.claim.nothingYet");
    $("claims").replaceChildren();
    return;
  }
  $("note").textContent = claims.contract ? "" : t("compute.claim.contractNotLive");
  $("claims").replaceChildren(...claims.claims.map((c) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div><b class="month"></b> <span class="meta"></span></div><div class="amount"></div><div class="state"></div>`;
    (row.querySelector(".state") as HTMLElement).textContent = t("compute.claim.checking");
    (row.querySelector(".month") as HTMLElement).textContent = c.month;
    (row.querySelector(".meta") as HTMLElement).textContent = t("compute.common.points", { points: num(c.points) });
    (row.querySelector(".amount") as HTMLElement).textContent = `${compact(Number(c.amount))} $${claims.token_symbol}`;
    void showState(c, row.querySelector(".state") as HTMLElement);
    return row;
  }));
}

/** The running month for this wallet: points, rank, and its share of the pool as it stands (buyers' orders grow it). */
function showMonth(current: { month: string; days_left: number; announced_pool: string | null; wallets: { wallet: string; points: number; share: number; rank: number }[] }): void {
  const mine = current.wallets.find((w) => w.wallet.toLowerCase() === account!.toLowerCase());
  const ends = t("compute.common.endsIn", { count: current.days_left });
  $("this-month").textContent = mine
    ? [
      t("compute.common.pointsShare", { points: num(mine.points), share: (mine.share * 100).toFixed(2) }),
      t("compute.common.rankOf", { rank: mine.rank, wallets: current.wallets.length }),
      current.announced_pool ? t("compute.claim.atThisShare", { amount: compact(Number(current.announced_pool) * mine.share) }) : null,
      ends,
    ].filter(Boolean).join(" · ")
    : t("compute.claim.noPointsIn", { month: current.month, ends });
}

async function showState(c: Claim, el: HTMLElement): Promise<void> {
  const contract = contractOf(c);
  if (!contract) {
    el.textContent = t("compute.claim.notClaimable");
    return;
  }
  try {
    const month = await call(contract, c.month_data);
    if (/^0x0*$/.test(month.slice(0, 66))) {
      el.textContent = t("compute.claim.waitingFunded");
      return;
    }
    if (BigInt(await call(contract, c.has_claimed_data)) === 1n) {
      el.textContent = t("compute.claim.claimed");
      el.dataset.standing = "ok";
      return;
    }
    // months(): root, total, claimed, deadline, swept
    const deadline = word(month, 3);
    if (deadline && BigInt(Math.floor(Date.now() / 1000)) > deadline) {
      el.textContent = t("compute.claim.windowClosed", { date: day(deadline) });
      el.dataset.standing = "zeroed";
      return;
    }
    const by = Object.assign(document.createElement("div"), { className: "meta" });
    by.textContent = t("compute.claim.claimBy", { date: day(deadline) });
    const short = await holdCheck(contract);
    el.replaceChildren();
    if (short) {
      const note = Object.assign(document.createElement("div"), { className: "meta" });
      note.dataset.standing = "zeroed";
      note.textContent = t("compute.claim.holdToClaim", { amount: compact(Number(short.need) / 1e18), held: compact(Number(short.held) / 1e18) });
      const buy = Object.assign(document.createElement("a"), { className: "btn sm", href: "/token" });
      buy.textContent = t("compute.claim.buyFlyai");
      el.append(buy, note, by);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn red sm";
    button.textContent = t("compute.claim.claim");
    button.addEventListener("click", () => void claim(c, el, button));
    el.append(button, by);
  } catch (err) {
    el.textContent = t("compute.claim.cantRead", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function claim(c: Claim, el: HTMLElement, button: HTMLButtonElement): Promise<void> {
  const d = data!;
  button.disabled = true;
  const say = (text: string) => { button.textContent = text; };
  try {
    const hash = await transact(contractOf(c)!, c.claim_data, say);
    say(t("compute.common.waitingForChain"));
    await mined(hash);
    el.replaceChildren(t("compute.claim.claimed"), " ", Object.assign(document.createElement("a"), { target: "_blank", rel: "noopener" }));
    el.dataset.standing = "ok";
    const link = el.querySelector("a")!;
    link.href = `${d.explorer}/tx/${hash}`;
    link.textContent = t("compute.common.viewTransaction");
  } catch (err) {
    button.disabled = false;
    button.textContent = t("compute.claim.claim");
    const note = document.createElement("div");
    note.className = "meta";
    note.dataset.standing = "zeroed";
    note.textContent = errorText(err);
    el.append(note);
  }
}

mountAccount();
const showError = (err: unknown) => { $("note").textContent = errorText(err); };
bindWalletRow({
  onChange: (wallet) => {
    account = wallet;
    if (wallet) void load().catch(showError);
    else {
      $("claims").replaceChildren();
      $("this-month").textContent = "—";
      $("note").textContent = t("compute.claim.signInToSee");
    }
  },
  onRefresh: load,
  onError: showError,
});
// this month's pool grows as buyers' orders are charged
setInterval(() => { if (account && !document.hidden) void api(API, "/api/month", null).then(showMonth, () => {}); }, 120_000);
