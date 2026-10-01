#!/usr/bin/env bash
# One-off (2026-10-01): stop project mining. The bridge goes first, or it reopens the orders.
set -euo pipefail
cd "$(dirname "$0")"
set -a; source <(tr -d '\r' < .env.local | grep -E '^(SERVER|ADMIN_TOKEN)='); set +a
fly scale count 0 -a flyai-bridge --yes
for id in $(curl -s -m 60 "$SERVER/api/house" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);for(const o of (j.orders||j))if(String(o.label).startsWith('mining/')&&!['stopped','done'].includes(o.state||o.status))console.log(o.id)})"); do
  echo "stopping $id"; curl -s -m 60 -X POST "$SERVER/api/admin/house/$id/stop" -H "authorization: Bearer $ADMIN_TOKEN"; echo
done
echo "mining stopped"
