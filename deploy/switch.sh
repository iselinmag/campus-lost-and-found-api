#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

CONF="nginx.conf"
BACKUP="nginx.conf.bak"

if grep -q "proxy_pass http://blue:3000;" "$CONF"; then
  CURRENT="blue"
  TARGET="green"
elif grep -q "proxy_pass http://green:3000;" "$CONF"; then
  CURRENT="green"
  TARGET="blue"
else
  echo "Could not determine active environment."
  exit 1
fi

echo "Current environment: $CURRENT"
echo "Testing new environment: $TARGET"

# Test that the target API is alive
docker compose exec -T "$TARGET" node -e \
  "fetch('http://localhost:3000/').then(r => { if (!r.ok) process.exit(1); return r.text() }).then(console.log).catch(() => process.exit(1))"

# Test database connection before switching traffic
docker compose exec -T "$TARGET" node -e \
  "fetch('http://localhost:3000/db-test').then(r => { if (!r.ok) process.exit(1); return r.text() }).then(console.log).catch(() => process.exit(1))"

echo "$TARGET is healthy."

# Save current NGINX config
cp "$CONF" "$BACKUP"

# Change proxy target without replacing the bind-mounted file inode
sed "s#proxy_pass http://${CURRENT}:3000;#proxy_pass http://${TARGET}:3000;#" "$CONF" > "${CONF}.tmp"
cat "${CONF}.tmp" > "$CONF"
rm "${CONF}.tmp"

# Validate NGINX before reloading
if docker compose exec -T nginx nginx -t; then
  docker compose exec -T nginx nginx -s reload
  rm -f "$BACKUP"
  echo "Traffic switched successfully: $CURRENT -> $TARGET"
else
  echo "NGINX configuration failed. Rolling back."
  cat "$BACKUP" > "$CONF"
  rm -f "$BACKUP"
  exit 1
fi
