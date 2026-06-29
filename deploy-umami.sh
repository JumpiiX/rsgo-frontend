#!/usr/bin/env bash
# One-time (re-runnable) setup for self-hosted Umami analytics on the server.
#
# What it does:
#   1. Ensures the shared docker network exists.
#   2. Generates an APP_SECRET + DB password ONCE and saves them to umami.env
#      (so re-runs reuse the same DB — your analytics history is never lost).
#   3. Brings up the Umami app + its Postgres (docker-compose.umami.yml).
#   4. Reloads Caddy so /analytics routes to Umami.
#
# Run from the project root on the SERVER:   bash deploy-umami.sh
# Safe to run again anytime (e.g. to pull a new Umami image) — the DB volume
# (umami-db-data) persists, so no analytics data is lost.
#
# After the first run: open https://rsgo.io/analytics, log in (admin / umami —
# CHANGE THE PASSWORD), add website "rsgo.io", copy its website-id into
# index.html + game.html (replace REPLACE_WITH_UMAMI_WEBSITE_ID), redeploy frontend.

set -euo pipefail
cd "$(dirname "$0")"

NETWORK="rsgo-shared-network"
# Secrets live OUTSIDE the repo dir. The frontend deploy does `rm -rf rsgo-frontend`
# on every push, which would wipe an in-repo env file and rotate the DB password
# (breaking the existing database). A stable path ($HOME/umami.env) keeps the
# secrets across deploys. The Umami DATA lives in the named docker volume
# `umami-db-data`, which also survives — so analytics history is never lost.
ENV_FILE="${UMAMI_ENV_FILE:-$HOME/umami.env}"
COMPOSE_FILE="docker-compose.umami.yml"
# The running Caddy container name. On this server it's "caddy" (override with
# CADDY_CONTAINER=... if yours differs).
CADDY_CONTAINER="${CADDY_CONTAINER:-caddy}"

# Pick docker compose v2 ("docker compose") or v1 ("docker-compose").
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' found." >&2
  exit 1
fi
echo "Using: $DC"

# 1. Shared network (no-op if it already exists).
docker network create "$NETWORK" 2>/dev/null || true

# 2. Secrets: generate once, then reuse. This keeps the DB password stable so the
#    persistent volume keeps working across re-runs.
if [ ! -f "$ENV_FILE" ]; then
  echo "Generating secrets -> $ENV_FILE (keep this file safe, do not commit it)"
  {
    echo "UMAMI_DB_PASSWORD=$(openssl rand -hex 16)"
    echo "UMAMI_APP_SECRET=$(openssl rand -base64 32)"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  echo "Reusing existing secrets from $ENV_FILE"
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

# 3. Bring up Umami (compose reads the two vars from the environment).
echo "Starting Umami + Postgres..."
UMAMI_DB_PASSWORD="$UMAMI_DB_PASSWORD" UMAMI_APP_SECRET="$UMAMI_APP_SECRET" \
  $DC -f "$COMPOSE_FILE" up -d

# 4. Update Caddy's config + reload (so /analytics is routed). Caddy reads its
#    config from a HOST file mounted into the container (typically /root/Caddyfile,
#    mounted read-only), so we update that host file then reload — NOT docker cp
#    (which fails on a :ro mount). We detect the mounted host path automatically.
if docker ps --format '{{.Names}}' | grep -q "^${CADDY_CONTAINER}$"; then
  echo "Updating Caddy config + reloading..."
  # Find the host path that Caddy has mounted at /etc/caddy/Caddyfile.
  HOST_CADDYFILE=$(docker inspect "$CADDY_CONTAINER" \
    --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)
  if [ -n "$HOST_CADDYFILE" ] && [ -f "$HOST_CADDYFILE" ]; then
    cp Caddyfile "$HOST_CADDYFILE"
    echo "  wrote $HOST_CADDYFILE"
  else
    echo "  (no mounted host Caddyfile detected; using /root/Caddyfile)"
    cp Caddyfile /root/Caddyfile
  fi
  docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
    || docker restart "$CADDY_CONTAINER"
else
  echo "WARNING: container '$CADDY_CONTAINER' not running — reload Caddy yourself so /analytics works."
fi

echo ""
echo "✅ Umami is up. Next:"
echo "   1) Open https://rsgo.io/analytics  (login: admin / umami — CHANGE the password)"
echo "   2) Add website 'rsgo.io' → copy its website-id"
echo "   3) Put that id in index.html + game.html (replace REPLACE_WITH_UMAMI_WEBSITE_ID)"
echo "   4) Redeploy the frontend"
