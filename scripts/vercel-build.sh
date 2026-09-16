#!/usr/bin/env bash
# Vercel build: the 3-D simulator, Fly Radio, the Flybook app, ValentFly, and the static site, assembled into .vercel-out.
# Fly Radio runs the connectome in the browser and loads the Simulation's brain files (/simulation/connectome/).
# ValentFly is a single self-contained HTML file (season data baked in by valentfly/season.py) -- no build step.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd world && npm run build && npm run build:radio)
(cd flybook/web && npm run build)
rm -rf .vercel-out
mkdir -p .vercel-out/simulation .vercel-out/flybook .vercel-out/radio .vercel-out/valentfly
cp -r docs/. .vercel-out/
cp -r world/dist/. .vercel-out/simulation/
cp -r world/dist-radio/assets .vercel-out/radio/
cp world/dist-radio/radio.html .vercel-out/radio/index.html
cp -r flybook/web/dist/. .vercel-out/flybook/
cp valentfly/site.html .vercel-out/valentfly/index.html
