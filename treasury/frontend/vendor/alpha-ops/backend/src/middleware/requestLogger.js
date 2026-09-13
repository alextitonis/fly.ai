const { randomUUID } = require("crypto");

// Middleware for logging incoming HTTP requests with response time and status.
function requestLogger(req, res, next) {
  const requestId = randomUUID();
  const start = process.hrtime.bigint();

  // Attach request ID for downstream usage.
  req.requestId = requestId;

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const logEntry = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      timestamp: new Date().toISOString(),
    };

    console.log(JSON.stringify(logEntry));
  });

  next();
}

module.exports = {
  requestLogger,
};
