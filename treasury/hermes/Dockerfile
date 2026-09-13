FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (includes data/ for bundled data)
COPY hermes_screener/ hermes_screener/
COPY scripts/ scripts/

# Set environment variables - HERMES_HOME points to hermes_screener/
# so settings.db_path -> /app/hermes_screener/data/central_contracts.db
ENV HERMES_HOME=/app/hermes_screener
ENV PYTHONPATH=/app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "hermes_screener.dashboard.app:app", "--host", "0.0.0.0", "--port", "8080"]
