// Provides operational health indicators for the system.
const { getOpsHealth } = require("../connectors/mockExchangeConnector");

function fetchOpsHealth() {
  return getOpsHealth();
}

module.exports = {
  fetchOpsHealth,
};
