// Centralized error handler for API endpoints.

function errorHandler(err, req, res, next) {
  console.error(
    JSON.stringify({
      level: "error",
      message: err.message,
      stack: err.stack,
      requestId: req.requestId,
      path: req.originalUrl,
    })
  );

  res.status(500).json({
    error: "Internal server error",
    message: "Unexpected error while processing the request.",
  });
}

module.exports = {
  errorHandler,
};
