# Flybook worker + API: CPU only. Deploy with flybook/worker/deploy.sh, which stages a small
# build context (flytalk.py and the worker) and builds remotely.
FROM python:3.12-slim

WORKDIR /app
COPY flybook/worker/requirements.txt flybook/worker/requirements.txt
RUN pip install --no-cache-dir -r flybook/worker/requirements.txt

# The brain files (~260 MB) come from the flybrain data release, sha256-checked, fetched once
# at build time so machines start without downloading anything.
ENV FLY_DATA=/data PYTHONUNBUFFERED=1
RUN flybrain download

COPY flytalk.py ./
COPY flybook/worker/*.py flybook/worker/house.json flybook/worker/
COPY flybook/worker/model flybook/worker/model
COPY flybook/worker/fonts flybook/worker/fonts
# the breeding worker (jobs.py "breed"): its packages, the font its pictures use, and its code
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY flytrade/breed/requirements.txt flytrade/breed/requirements.txt
RUN pip install --no-cache-dir -r flytrade/breed/requirements.txt
COPY flytrade/nft/gen.py flytrade/nft/gen.py
COPY flytrade/nft/poses flytrade/nft/poses
COPY flytrade/breed/worker.py flytrade/breed/worker.py
ENV MPLBACKEND=Agg

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

CMD ["python", "flybook/worker/tick.py", "--every", "900"]
