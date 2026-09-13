// Business logic for market data retrieval.

const { getCurrentBtcPriceUsd } = require("../connectors/marketDataConnector");

async function fetchCurrentBtcPrice() {
  return getCurrentBtcPriceUsd();
}

module.exports = {
  fetchCurrentBtcPrice,
};
