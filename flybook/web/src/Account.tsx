import { useEffect, useState } from "react";
import type { EthereumWallet, Session } from "@supabase/supabase-js";
import type { EIP1193Provider } from "viem";
import { formatUnits, getAddress, toHex } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { useConnect, useConnection, useConnectors, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { getBalance, getMe, setHandle, type Me } from "./api";
import { BASE, db, tuning, type Fly, type Patch } from "./feed";
import BreedDialog from "./BreedDialog";
import Captcha, { CAPTCHA_KEY } from "./Captcha";
import FlyMaker from "./FlyMaker";
import { setStoredClaim, useStoredClaim } from "./Merch";
import { BUY_URL, FLYAI, erc20, robinhood } from "./wallet";
import { locale, t, tn } from "./i18n";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
// the message the wallet signs stays English: it is checked against the Supabase sign-in, not shown as UI
const SIGN_IN_STATEMENT = "Sign in to Flybook. This is free and sends no transaction.";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0];

export type Viewer = { userId: string; holder: boolean; ready: boolean } | null;

/**
 * Sign in with a wallet (Sign in with Ethereum, via Supabase) or an email magic link, and hatch flies.
 * Everyone signed in plays; $FLYAI holders make more flies and win season rewards. Accounts without a
 * wallet pick a public name first. The balance shown here is read in the browser; the API checks it on chain.
 */
export default function Account({ patches, live, onCreated, onViewer, house }: {
  patches: Patch[]; live: boolean; onCreated: () => void; house: Fly[];
  onViewer: (viewer: Viewer) => void;
}) {
  const { address, isConnected, connector, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const balance = useReadContract({
    address: FLYAI, abi: erc20, functionName: "balanceOf", chainId: robinhood.id,
    args: address ? [address] : undefined, query: { enabled: !!address, retry: 1 },
  });
  // Some networks and extensions can't reach the chain RPC from the browser, which left the balance
  // "reading…" forever. If the browser read fails, or hasn't answered in 5 s, ask the API to read it instead.
  const [serverBalance, setServerBalance] = useState<bigint | null>(null);
  const [serverFailed, setServerFailed] = useState(false);
  const browserHasIt = balance.data !== undefined;
  useEffect(() => {
    setServerBalance(null);
    setServerFailed(false);
    if (!address || browserHasIt) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getBalance(address)
        .then((r) => { if (!cancelled) setServerBalance(BigInt(r.balance)); })
        .catch(() => { if (!cancelled) setServerFailed(true); });
    }, balance.isError ? 0 : 5_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [address, browserHasIt, balance.isError]);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState<null | "hatch" | "preview" | "gift">(null);
  const gift = useStoredClaim();   // a free-fly code from a merch thank-you card, kept across sign-in
  const [breeding, setBreeding] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaRun, setCaptchaRun] = useState(0);   // remounts the captcha: its tokens are single use

  useEffect(() => {
    if (!db) return;
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return setMe(null);
    getMe().then(setMe).catch((e) => setError(message(e)));
  }, [session]);
  // signed in with one wallet while another is connected in the extension
  const wrongWallet = !!(me?.wallet && address && me.wallet !== address.toLowerCase());
  useEffect(() => {
    onViewer(session && me && !wrongWallet
      ? { userId: session.user.id, holder: me.holder, ready: !!(me.wallet || me.handle) } : null);
  }, [session, me, wrongWallet, onViewer]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const needCaptcha = () => {
    if (CAPTCHA_KEY && !captcha) throw new Error(t("flybook.account.completeCheck"));
    return captcha ?? undefined;
  };
  const usedCaptcha = () => {
    setCaptcha(null);
    setCaptchaRun((n) => n + 1);
  };

  const signIn = () =>
    run(async () => {
      if (!db || !connector || !address) throw new Error(t("flybook.account.walletNotReady"));
      const captchaToken = needCaptcha();
      // sign on Robinhood Chain: switch the wallet first (wagmi adds the chain if the wallet doesn't have it)
      if (chainId !== robinhood.id) {
        try {
          await switchChain.mutateAsync({ chainId: robinhood.id });
        } catch {
          throw new Error(t("flybook.account.switchChain"));
        }
      }
      const provider = (await connector.getProvider()) as EIP1193Provider;
      // sign for the app's clean address (no #hash or ?query), so domain and URI match the Supabase allow list
      const url = new URL(`${window.location.origin}${BASE}`);
      try {
        if ((provider as { isPhantom?: boolean }).isPhantom) {
          // Phantom refuses Supabase's own message ("invalid formatting"): it has a lowercase address and no
          // nonce, both against EIP-4361. Build a spec message for Phantom only; Supabase keeps the address's
          // case in the account id, so MetaMask/Rabby stay on the lowercase message their accounts were made with.
          const chainHex = await provider.request({ method: "eth_chainId" });
          const siwe = createSiweMessage({
            domain: url.host, uri: url.href, version: "1", chainId: Number.parseInt(chainHex, 16),
            address: getAddress(address), nonce: generateSiweNonce(), issuedAt: new Date(),
            statement: SIGN_IN_STATEMENT,
          });
          const signature = await provider.request({ method: "personal_sign", params: [toHex(siwe), getAddress(address)] });
          const { error } = await db.auth.signInWithWeb3({ chain: "ethereum", message: siwe, signature, options: { captchaToken } });
          if (error) throw error;
          return;
        }
        // Supabase's wallet type also wants the address; at runtime it only calls request().
        const wallet = {
          address,
          request: provider.request.bind(provider),
          on: provider.on.bind(provider),
          removeListener: provider.removeListener.bind(provider),
        } as unknown as EthereumWallet;
        const { error } = await db.auth.signInWithWeb3({
          chain: "ethereum",
          wallet,
          statement: SIGN_IN_STATEMENT,
          options: { url: url.href, captchaToken },
        });
        if (error) throw error;
      } finally {
        if (captchaToken) usedCaptcha();
      }
    });

  const sendLink = () =>
    run(async () => {
      if (!db) throw new Error(t("flybook.account.signInUnavailable"));
      const to = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error(t("flybook.account.badEmail"));
      const captchaToken = needCaptcha();
      try {
        const { error } = await db.auth.signInWithOtp({
          email: to,
          options: { emailRedirectTo: `${window.location.origin}${BASE}`, shouldCreateUser: true, captchaToken },
        });
        if (error) throw error;
        setSentTo(to);
      } finally {
        if (captchaToken) usedCaptcha();
      }
    });

  const saveName = () =>
    run(async () => {
      await setHandle(name.trim());
      setMe(await getMe());
    });

  const signOut = () =>
    run(async () => {
      await db?.auth.signOut();
      if (isConnected) disconnect.mutate();
      setSentTo(null);
    });

  const created = async () => {
    if (making === "gift") setStoredClaim(null);
    setMe(await getMe());
    onCreated();
  };

  if (!live) {
    return (
      <section className="card cta" id="account">
        <h4>{t("flybook.account.title")}</h4>
        <p>{t("flybook.account.demoPitch")}</p>
        <a className="btn red" href={BUY_URL} target="_blank" rel="noreferrer">{t("flybook.account.getFlyai")}</a>
      </section>
    );
  }

  // the browser's read, else the API's read, else /me once signed in; undefined while nobody knows yet
  const known = balance.data ?? serverBalance ?? (me?.wallet && !wrongWallet ? BigInt(me.balance) : undefined);
  const tokens = Number(formatUnits(known ?? 0n, 18)).toLocaleString(locale(), { maximumFractionDigits: 2 });
  const unreadable = known === undefined && balance.isError && serverFailed;
  const made = me ? me.flies.filter((f) => !f.auto_born && !f.gift).length : 0; // born and gift flies don't count toward the cap
  const signedIn = !!(session && me && !wrongWallet);
  const needsName = signedIn && !me!.wallet && !me!.handle;

  return (
    <section className="card cta account" id="account">
      <h4>{t("flybook.account.title")}</h4>

      {session && !me && !error && <p className="fine">{t("flybook.account.loading")}</p>}

      {signedIn && me && (
        <>
          <p className="mono small">
            {me.wallet
              ? `${short(me.wallet)} · ${known !== undefined ? `${tokens} $FLYAI` : t(unreadable ? "flybook.account.balanceUnavailable" : "flybook.account.readingBalance")}`
              : `${me.handle ?? t("flybook.account.newPlayer")} · ${me.email ?? t("flybook.account.emailAccount")}`}
          </p>

          {needsName ? (
            <div className="signin-email">
              <p>{t("flybook.account.pickName")}</p>
              <div className="row">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("flybook.account.namePlaceholder")} maxLength={20}
                       onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && saveName()} />
                <button className="btn red" disabled={busy || name.trim().length < 3} onClick={saveName}>{t("flybook.account.save")}</button>
              </div>
              <p className="fine">{t("flybook.account.nameRule")}</p>
            </div>
          ) : (
            <>
              {me.flies.length > 0 && (
                <ul className="mine">
                  {me.flies.map((f) => (
                    <li key={f.id}>
                      <span className="dot" style={{ background: f.color }} />
                      <div>
                        {f.name}
                        <span className="tune">
                          {f.auto_born ? t("flybook.account.bornFromMating") : f.gift ? t("flybook.account.merchGift") : ""}
                          {t("flybook.account.flyTune", { gen: f.generation ?? 1, elo: f.elo ?? 1000, tuning: tuning(f).join(", ") || t("flybook.account.standard") })}
                        </span>
                      </div>
                      <span className={`state${f.active ? "" : " dormant"}`}>
                        {f.active ? patches.find((p) => p.id === f.patch_id)?.name ?? f.patch_id : t("flybook.account.dormant")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {me.holder ? (
                <p className="fine">{t("flybook.account.holder", { max: me.holder_max_flies })}</p>
              ) : (
                <p className="fine">
                  {t(me.wallet ? "flybook.account.freeAccount" : "flybook.account.freeAccountEmail",
                     { free: me.free_max_flies, min: me.min_tokens, max: me.holder_max_flies })}
                </p>
              )}
              {me.flies.some((f) => f.auto_born) && (
                <p className="fine">{t("flybook.account.bornDontCount")}</p>
              )}
              {gift && (
                <div className="gift-box">
                  <p>{t("flybook.account.giftFly")}</p>
                  <div className="row">
                    <button className="btn red" onClick={() => setMaking("gift")}>{t("flybook.account.hatchFree")}</button>
                    <button className="more" onClick={() => setStoredClaim(null)}>{t("flybook.account.notNow")}</button>
                  </div>
                </div>
              )}
              {made >= me.max_flies && (
                <p className="fine">{t("flybook.account.atLimit", { count: me.max_flies })}</p>
              )}
              <div className="row">
                {made < me.max_flies && <button className="btn red" onClick={() => setMaking("hatch")}>{t("flybook.account.hatch")}</button>}
                {made < me.max_flies && me.flies.length > 0 && <button className="btn" onClick={() => setBreeding(true)}>{t("flybook.account.breed")}</button>}
                {!me.holder && <a className="btn" href={BUY_URL} target="_blank" rel="noreferrer">{t("flybook.account.getFlyai")}</a>}
              </div>
            </>
          )}
          <button className="more" onClick={signOut}>{t("flybook.account.signOut")}</button>
        </>
      )}

      {wrongWallet && (
        <>
          <p className="err">{t("flybook.account.wrongWallet", { wallet: short(me!.wallet!) })}</p>
          <button className="more" onClick={signOut}>{t("flybook.account.signOut")}</button>
        </>
      )}

      {!session && (
        <>
          {gift && <p className="gift-box">{t("flybook.account.giftSignIn")}</p>}
          <p>{t("flybook.account.pitch")}</p>

          {!isConnected && (
            <div className="row">
              {connectors.map((c) => (
                <button key={c.uid} className="btn red" disabled={connect.isPending} onClick={() => connect.mutate({ connector: c })}>
                  {connect.isPending ? t("flybook.account.connecting") : c.name === "Injected" ? t("flybook.account.connectWallet") : t("flybook.account.connectNamed", { name: c.name })}
                </button>
              ))}
              <a className="btn" href={BUY_URL} target="_blank" rel="noreferrer">{t("flybook.account.getFlyai")}</a>
            </div>
          )}
          {connect.error && <p className="err">{message(connect.error)}</p>}

          {isConnected && address && (
            <>
              <p className="mono small">
                {short(address)} · {known !== undefined ? `${tokens} $FLYAI` : t(unreadable ? "flybook.account.balanceUnavailable" : "flybook.account.readingBalance")}
              </p>
              {known === 0n && <p className="fine">{t("flybook.account.noFlyaiYet")}</p>}
              <div className="row">
                <button className="btn red" disabled={busy} onClick={signIn}>{t(busy ? "flybook.account.checkWallet" : "flybook.account.signInWallet")}</button>
                <button className="more" onClick={() => disconnect.mutate()}>{t("flybook.account.disconnect")}</button>
              </div>
            </>
          )}

          <div className="signin-email">
            <p className="or">{t("flybook.account.orEmail")}</p>
            {sentTo ? (
              <p>{tn("flybook.account.checkInbox", { email: <b>{sentTo}</b> })} <button className="more" onClick={() => setSentTo(null)}>{t("flybook.account.otherEmail")}</button></p>
            ) : (
              <div className="row">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
                       onKeyDown={(e) => e.key === "Enter" && email.trim() && !busy && sendLink()} />
                <button className="btn" disabled={busy || !email.trim()} onClick={sendLink}>{t("flybook.account.emailMe")}</button>
              </div>
            )}
          </div>
          <Captcha key={captchaRun} onToken={setCaptcha} />
        </>
      )}

      {error && <p className="err">{error}</p>}

      {!(signedIn && !needsName && made < (me?.max_flies ?? 0)) && (
        <button className="more" onClick={() => setMaking("preview")}>{t("flybook.account.browse")}</button>
      )}
      {breeding && me && (
        <BreedDialog mine={me.flies as Fly[]} house={house} patches={patches} onClose={() => setBreeding(false)} onCreated={created} />
      )}
      {making && (
        <FlyMaker patches={patches} canHatch={making === "hatch" || making === "gift"} onClose={() => setMaking(null)} onCreated={created}
                  claim={making === "gift" ? gift ?? undefined : undefined} />
      )}
    </section>
  );
}
