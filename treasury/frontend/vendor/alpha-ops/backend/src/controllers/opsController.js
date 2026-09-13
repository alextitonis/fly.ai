// Handles HTTP interactions for operational health monitoring.
const { fetchOpsHealth } = require("../services/opsService");

function getOpsHealth(req, res) {
  const data = fetchOpsHealth();
  res.json(data);
}

module.exports = { getOpsHealth };
