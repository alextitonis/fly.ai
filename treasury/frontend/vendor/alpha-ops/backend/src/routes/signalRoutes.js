// Routes for trading signal retrieval.
const express = require("express");
const { getSignals } = require("../controllers/signalController");

const router = express.Router();

router.get("/", getSignals);

module.exports = router;
