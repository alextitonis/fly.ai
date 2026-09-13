// Routes for executed trades.
const express = require("express");
const { getTrades } = require("../controllers/tradeController");

const router = express.Router();

router.get("/", getTrades);

module.exports = router;
