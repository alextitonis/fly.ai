/**
 * /connect: link a wallet to a miner in a normal tab. From the extension it arrives as /connect#<link code>
 * (the extension can't reach a browser wallet itself); on this site it uses the miner token in localStorage.
 * The wallet is the one signed in on the compute pages; signing in happens here if it hasn't yet.
 */
import { t } from "./i18n.ts";
import { $ } from "./format.ts";
import { API } from "./config.ts";
import { mountAccount, onAccount, requireWallet, sessionHeaders, sessionLost } from "./account.ts";
import { api } from "./mine-core.ts";
import { shortAddress } from "./wallet.ts";

const code = location.hash.slice(1);
let token: string | null = null;
try { token = localStorage.getItem("flymine.token"); } catch { /* private window */ }

const status = (text: string, kind?: "ok" | "bad") => {
  $("status").textContent = text;
  $("status").dataset.standing = kind === "ok" ? "ok" : kind === "bad" ? "zeroed" : "";
};

mountAccount();
$("which").textContent = code ? t("compute.connect.whichExtension") : token ? t("compute.connect.whichSite") : t("compute.connect.whichNone");
if (!code && !token) {
  status(t("compute.connect.startFirst"), "bad");
  ($("connect") as HTMLButtonElement).disabled = true;
}
let linked = false;
onAccount((wallet) => {
  if (!linked) $("connect").textContent = wallet ? t("compute.connect.linkWallet", { wallet: shortAddress(wallet) }) : t("compute.connect.signInAndLink");
});

$("connect").addEventListener("click", async () => {
  const button = $("connect") as HTMLButtonElement;
  button.disabled = true;
  try {
    if (!(await requireWallet())) {
      button.disabled = false;
      return;
    }
    status(t("compute.connect.linking"));
    const { wallet } = await api(API, "/api/session/link", code ? null : token, code ? { code } : {}, sessionHeaders());
    history.replaceState(null, "", location.pathname); // the link code is spent
    status(t("compute.connect.linked", { wallet: shortAddress(wallet) }), "ok");
    $("intro").textContent = code
      ? t("compute.connect.introExtension", { wallet })
      : t("compute.connect.introSite", { wallet });
    linked = true;
    button.textContent = t("compute.connect.linkedButton");
  } catch (err) {
    status(sessionLost(err) ? t("compute.connect.expired") : err instanceof Error ? err.message : String(err), "bad");
    button.disabled = false;
  }
});
