#!/usr/bin/env bash
# Push flybook/supabase/migrations to the hosted database (connection string from flybook/.env, never printed).
#   bash flybook/dbpush.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a
npx -y supabase@2 db push --db-url "$SUPABASE_POOLER_URL" --yes
