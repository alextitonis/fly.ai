#!/usr/bin/env bash
# Supabase (flybook project): grow the database disk, or show its health.
#   bash flybook/db_disk.sh grow 8     # disk to 8 GB (can't be shrunk later)
#   bash flybook/db_disk.sh health     # db / rest / auth health
# The token is SUPABASE_ACCESS_TOKEN in flybook/.env.
set -euo pipefail
cd "$(dirname "$0")"
T=$(grep "^SUPABASE_ACCESS_TOKEN=" .env | cut -d= -f2)
R=https://api.supabase.com/v1/projects/fixyinamewrjrcybjoua
case "${1:-health}" in
  grow)
    GB=${2:-8}
    curl -s -X POST -H "Authorization: Bearer $T" -H "content-type: application/json" "$R/config/disk" \
      -d "{\"attributes\":{\"type\":\"gp3\",\"size_gb\":$GB,\"iops\":3000,\"throughput_mibps\":125}}" -w "\nHTTP %{http_code}\n"
    ;;
  restart)                                    # a 404 here: Dashboard -> Settings -> General -> Restart project
    curl -s -X POST -H "Authorization: Bearer $T" "$R/restart" -w "\nHTTP %{http_code}\n"
    ;;
  health)
    curl -s -H "Authorization: Bearer $T" "$R/health?services=db,pooler,rest,auth"; echo
    curl -s -H "Authorization: Bearer $T" "$R/config/disk"; echo
    ;;
esac
