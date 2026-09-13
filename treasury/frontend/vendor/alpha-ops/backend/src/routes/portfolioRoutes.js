// Routes for portfolio summary and historical metrics.
const express = require("express");
const {
  getPortfolio,
  getPortfolioHistory,
} = require("../controllers/portfolioController");

const router = express.Router();

router.get("/", getPortfolio);
router.get("/history", getPortfolioHistory);

module.exports = router;
