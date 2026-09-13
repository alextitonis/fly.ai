// Handles HTTP interactions for portfolio-related endpoints.
const {
  fetchPortfolioSummary,
  fetchPortfolioHistory,
} = require("../services/portfolioService");

function getPortfolio(req, res) {
  const data = fetchPortfolioSummary();
  res.json(data);
}

function getPortfolioHistory(req, res) {
  const data = fetchPortfolioHistory();
  res.json(data);
}

module.exports = {
  getPortfolio,
  getPortfolioHistory,
};
