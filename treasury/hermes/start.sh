#!/bin/bash
# Start the Hermes Token Screener Dashboard

set -e

echo "Starting Hermes Token Screener Dashboard..."

# Set environment variables
export HERMES_HOME=${HERMES_HOME:-/app}
export PYTHONPATH=${PYTHONPATH:-/app}

# Create directories if they don't exist
mkdir -p $HERMES_HOME/.hermes/data $HERMES_HOME/.hermes/logs

# Start the FastAPI app
exec uvicorn hermes_screener.dashboard.app:app --host 0.0.0.0 --port ${PORT:-8080}
