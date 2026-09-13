#!/usr/bin/env sh
# the repository's labels, in the desk's colours. needs the github cli, signed in: gh auth login
# usage: sh scripts/labels.sh shmidtqq/loxley
set -e
REPO="${1:?usage: sh scripts/labels.sh owner/repo}"
# github's defaults say nothing about this project; drop them
for l in bug documentation duplicate enhancement "good first issue" "help wanted" invalid question wontfix; do
  gh label delete "$l" --repo "$REPO" --yes 2>/dev/null || true
done
node -e '
const L = require("./.github/labels.json");
for (const l of L) console.log(JSON.stringify([l.name, l.color, l.description]));
' | while read -r line; do
  name=$(printf '%s' "$line" | node -e 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(a[0])')
  color=$(printf '%s' "$line" | node -e 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(a[1])')
  desc=$(printf '%s' "$line" | node -e 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(a[2])')
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force
done
echo "labels set on $REPO"
