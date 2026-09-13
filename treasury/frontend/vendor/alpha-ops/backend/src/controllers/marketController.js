// Handles HTTP interactions for live market data endpoints.

const { fetchCurrentBtcPrice } = require("../services/marketService");

async function getMarketPrice(req, res, next) {
  try {
    const data = await fetchCurrentBtcPrice();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMarketPrice,
};
