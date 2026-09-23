import { useEffect, useState } from "react";
import { loadWallet, type FlyTrade, type Wallet as WalletData } from "./feed";
import { ago as agoAt, locale, t, tAt } from "./i18n";

export const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
/** Paper dollars (the market's cash is paper USDG since 2026-09-18; the columns are still named eth). */
export const cash = (x: number) => {
  const a = Math.abs(x);
  const body = a < 1e-12 ? "0" : a >= 1000 ? a.toLocaleString(locale(), { maximumFractionDigits: 0 })
    : a >= 1 ? a.toFixed(2) : a >= 0.01 ? a.toFixed(4) : a.toPrecision(3);
  return `${x < 0 ? "−" : ""}$${body}`;
};
const signedCash = (x: number) => `${x >= 0 ? "+" : ""}${cash(x)}`;
const amount = (x: number) => (x >= 1000 ? x.toFixed(0) : x >= 1 ? x.toFixed(2) : x.toPrecision(3));
export const ago = (iso: string) => agoAt(iso);

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <svg className="spark" viewBox="0 0 100 28" />;
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${hi > lo ? 26 - ((v - lo) / (hi - lo)) * 24 : 14}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "#5ef2cc" : "#ff5b4f"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** flybook.wallet.did.<side> */
const DID: Record<Exclude<FlyTrade["side"], "skipped">, true> = {
  buy: true, panic_sell: true, take_profit: true, sell: true, launch: true, buyback: true, dump: true,
};

/** One fly's paper wallet: what it's worth, its cash, each token it holds, its value over time and its own trades. */
export default function Wallet({ flyId, refresh }: { flyId: string; refresh?: number }) {
  const [w, setW] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadWallet(flyId).then((x) => { setW(x); setError(null); }).catch((e) => setError(e?.message ?? String(e)));
  }, [flyId, refresh]);

  if (error) return <p className="err">{error}</p>;
  if (!w) return <p className="fine">{t("flybook.wallet.opening")}</p>;
  if (!w.portfolio) {
    return <p className="fine wallet-empty">{t("flybook.wallet.notYet")}</p>;
  }

  const p = w.portfolio;
  const coins = Object.entries(p.holdings ?? {}).filter(([, h]) => h.qty > 0).map(([symbol, h]) => {
    const now = w.prices[symbol] !== undefined ? h.qty * w.prices[symbol] : null;
    return { symbol, qty: h.qty, paid: h.cost_eth, now };
  }).sort((a, b) => (b.now ?? 0) - (a.now ?? 0));
  const inCoins = coins.reduce((sum, c) => sum + (c.now ?? 0), 0);
  const total = p.eth + inCoins;
  const made = p.start_eth > 0 ? total / p.start_eth - 1 : 0;
  const trades = w.trades.filter((x): x is FlyTrade & { side: keyof typeof DID } => x.side !== "skipped");
  const history = [...(w.complete ? [p.start_eth] : []), ...[...trades].reverse().map((x) => x.value_after), total];

  return (
    <div className="wallet">
      <div className="wallet-top">
        <div>
          <span className="fine">{t("flybook.wallet.worthNow")}</span>
          <b className="mono wallet-total">{cash(total)}</b>
          <span className={`mono ${made >= 0 ? "up" : "down"}`}>{t("flybook.wallet.fromStart", { pct: pct(made), cash: cash(p.start_eth) })}</span>
        </div>
        <div><span className="fine">{t("flybook.wallet.cash")}</span><b className="mono">{cash(p.eth)}</b></div>
        <div><span className="fine">{t("flybook.wallet.inTokens")}</span><b className="mono">{cash(inCoins)}</b></div>
        <div><span className="fine">{t("flybook.wallet.trades")}</span><b className="mono">{p.trades}</b></div>
      </div>

      {history.length >= 3 && (
        <div className="wallet-chart">
          <Spark values={history} />
          <span className="fine">{t(w.complete ? "flybook.wallet.chartFull" : "flybook.wallet.chart")}</span>
        </div>
      )}

      <h5>{t("flybook.wallet.holds")}</h5>
      {coins.length === 0 ? <p className="fine">{t("flybook.wallet.onlyCash")}</p> : (
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr>
              <th>{t("flybook.wallet.th.token")}</th><th>{t("flybook.wallet.th.amount")}</th><th>{t("flybook.wallet.th.paid")}</th>
              <th>{t("flybook.wallet.th.worth")}</th><th>{t("flybook.wallet.th.pnl")}</th>
            </tr></thead>
            <tbody>
              {coins.map((c) => (
                <tr key={c.symbol}>
                  <td><b>${c.symbol}</b></td>
                  <td className="mono">{amount(c.qty)}</td>
                  <td className="mono">{cash(c.paid)}</td>
                  <td className="mono">{c.now === null ? "?" : cash(c.now)}</td>
                  <td className={`mono ${c.now !== null && c.now >= c.paid ? "up" : "down"}`}>
                    {c.now === null || c.paid <= 0 ? "–" : `${pct(c.now / c.paid - 1)} (${signedCash(c.now - c.paid)})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h5>{t("flybook.wallet.last")}</h5>
      {trades.length === 0 ? <p className="fine">{t("flybook.wallet.noTrades")}</p> : (
        <ul className="wallet-trades">
          {trades.slice(0, 8).map((x) => (
            <li key={x.id}>
              <span>{tAt("flybook.wallet.did", x.side)} <b>${x.symbol}</b></span>
              {["buy", "launch", "buyback"].includes(x.side)
                ? <span className="mono">{t("flybook.wallet.paid", { cash: cash(x.eth) })}</span>
                : <span className="mono up">{t("flybook.wallet.got", { cash: cash(x.eth) })}</span>}
              <span className="fine mono">{t("flybook.wallet.worthAfter", { cash: cash(x.value_after) })}</span>
              <span className="when">{ago(x.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
