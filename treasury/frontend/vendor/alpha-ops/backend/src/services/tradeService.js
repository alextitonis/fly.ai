// Provides executed trades and related metrics.
const { getTrades } = require("../connectors/mockExchangeConnector");

function fetchTrades() {
  return getTrades();
}

module.exports = {
  fetchTrades,
};
