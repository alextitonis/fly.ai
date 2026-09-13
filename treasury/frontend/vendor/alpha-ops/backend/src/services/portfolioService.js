// Provides portfolio-related data using the exchange connector.
const {
  getPortfolioSummary,
  getPortfolioHistory,
} = require("../connectors/mockExchangeConnector");

function fetchPortfolioSummary() {
  return getPortfolioSummary();
}

function fetchPortfolioHistory() {
  return getPortfolioHistory();
}

module.exports = {
  fetchPortfolioSummary,
  fetchPortfolioHistory,
};
