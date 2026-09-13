// Routes for operational health monitoring.
const express = require("express");
const { getOpsHealth } = require("../controllers/opsController");

const router = express.Router();

router.get("/", getOpsHealth);

module.exports = router;
