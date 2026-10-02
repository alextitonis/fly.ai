/**
 * /claim: a wallet's monthly claims. The server hands over each claim's amount, proof and ready-made
 * calldata; this page reads MonthlyClaims through the public RPC (funded yet? claimed yet?) and sends the
 * claim transaction from the signed-in wallet (account.ts).
 */
import { t } from "./i18n.ts";
import { API } from "./config.ts";
import { compact } from "./format.ts";
import { errorText, mined, mountAccount, onAccount, requireWallet, transact } from "./account.ts";
import { api } from "./mine-core.ts";
import { shortAddress } from "./wallet.ts";

interface Claim {
  month: string; month_id: number; points: number; amount: string; amount_wei: string;
  claim_data: string; has_claimed_data: string; month_data: string;
}
interface Claims {
  wallet: string; contract: string | null; chain_id: number; chain_name: string; rpc: string; explorer: string; token_symbol: string;
  claims: Claim[];
}

const $ = (id: string) => document.getElementById(id)!;
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
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

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
    (row.querySelector(".meta") as HTMLElement).textContent = t("compute.common.points", { points: fmt(c.points) });
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
      t("compute.common.pointsShare", { points: fmt(mine.points), share: (mine.share * 100).toFixed(2) }),
      t("compute.common.rankOf", { rank: mine.rank, wallets: current.wallets.length }),
      current.announced_pool ? t("compute.claim.atThisShare", { amount: compact(Number(current.announced_pool) * mine.share) }) : null,
      ends,
    ].filter(Boolean).join(" · ")
    : t("compute.claim.noPointsIn", { month: current.month, ends });
}

async function showState(c: Claim, el: HTMLElement): Promise<void> {
  const d = data!;
  if (!d.contract) {
    el.textContent = t("compute.claim.notClaimable");
    return;
  }
  try {
    const month = await call(d.contract, c.month_data);
    if (/^0x0*$/.test(month.slice(0, 66))) {
      el.textContent = t("compute.claim.waitingFunded");
      return;
    }
    if (BigInt(await call(d.contract, c.has_claimed_data)) === 1n) {
      el.textContent = t("compute.claim.claimed");
      el.dataset.standing = "ok";
      return;
    }
    el.replaceChildren();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn red sm";
    button.textContent = t("compute.claim.claim");
    button.addEventListener("click", () => void claim(c, el, button));
    el.append(button);
  } catch (err) {
    el.textContent = t("compute.claim.cantRead", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function claim(c: Claim, el: HTMLElement, button: HTMLButtonElement): Promise<void> {
  const d = data!;
  button.disabled = true;
  const say = (text: string) => { button.textContent = text; };
  try {
    const hash = await transact(d.contract!, c.claim_data, say);
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
onAccount((wallet) => {
  account = wallet;
  $("account").textContent = wallet ? shortAddress(wallet) : t("compute.common.notSignedIn");
  $("account").title = wallet ?? "";
  $("connect").textContent = wallet ? t("compute.common.refresh") : t("compute.common.signIn");
  if (wallet) void load().catch((err) => { $("note").textContent = errorText(err); });
  else {
    $("claims").replaceChildren();
    $("this-month").textContent = "—";
    $("note").textContent = t("compute.claim.signInToSee");
  }
});
$("connect").addEventListener("click", () => void (account ? load() : requireWallet()));
// this month's pool grows as buyers' orders are charged
setInterval(() => { if (account && !document.hidden) void api(API, "/api/month", null).then(showMonth, () => {}); }, 120_000);
