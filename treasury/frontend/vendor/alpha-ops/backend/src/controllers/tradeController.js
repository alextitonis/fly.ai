// Handles HTTP interactions for executed trades.
const { fetchTrades } = require("../services/tradeService");

function getTrades(req, res) {
  const data = fetchTrades();
  res.json(data);
}

module.exports = { getTrades };
