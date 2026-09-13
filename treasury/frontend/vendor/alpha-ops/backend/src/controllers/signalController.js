// Handles HTTP interactions for trading signals.
const { fetchSignals } = require("../services/signalService");

function getSignals(req, res) {
  const data = fetchSignals();
  res.json(data);
}

module.exports = { getSignals };
