// Routes for live market data (e.g. BTC price).

const express = require("express");
const { getMarketPrice } = require("../controllers/marketController");

const router = express.Router();

// Returns current BTC/USD price from external provider.
router.get("/price", getMarketPrice);

module.exports = router;
