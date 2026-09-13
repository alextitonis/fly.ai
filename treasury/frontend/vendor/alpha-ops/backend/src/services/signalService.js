// Provides access to recent trading signals.
const { getSignals } = require("../connectors/mockExchangeConnector");

function fetchSignals() {
  return getSignals();
}

module.exports = {
  fetchSignals,
};
