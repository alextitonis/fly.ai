// Provides access to live market data from external providers (e.g. Coingecko).

const COINGECKO_BASE_URL =
  process.env.EXTERNAL_MARKET_API_URL ||
  "https://api.coingecko.com/api/v3";

async function getCurrentBtcPriceUsd() {
  const url = `${COINGECKO_BASE_URL}/simple/price?ids=bitcoin&vs_currencies=usd`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Market data request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const price = json?.bitcoin?.usd;

  if (typeof price !== "number") {
    throw new Error("Unexpected market data shape from external API");
  }

  return {
    symbol: "BTC",
    priceUsd: price,
    source: "coingecko",
  };
}

module.exports = {
  getCurrentBtcPriceUsd,
};
