#!/usr/bin/env bash
# Shared helpers for the Claude Code cloud scripts (cloud-setup.sh,
# cloud-start.sh). Sourced from the checkout's root; no side effects at source
# time.
#
# The dev stack in a cloud session: CI's Node, and one Postgres container (CI's
# image) on 127.0.0.1:54320 (not 5432, which a Postgres of the image itself
# could hold) with three databases: bitcraft_dev (the app),
# bitcraft_test (the integration tests, emptied before every test) and
# bitcraft_shadow (only for `prisma migrate dev`).

PG_CONTAINER=bitcraft-postgres
PG_VOLUME=bitcraft-pgdata
PG_PORT=54320
PG_URL_BASE="postgres://postgres:postgres@127.0.0.1:${PG_PORT}"
CI_WORKFLOW=.github/workflows/ci.yml

# True (0) in a Claude Code cloud session. The session sets CLAUDE_CODE_REMOTE;
# the environment's setup script runs before any session exists, so
# cloud-setup.sh sets BITCRAFT_CLOUD=1 for what it calls.
is_claude_cloud() {
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${BITCRAFT_CLOUD:-}" = "1" ]
}

warn() {
  echo "aviso: $*" >&2
}

# Node's major version in CI, e.g. "26"; empty if not found.
ci_node_major() {
  sed -n "s/^ *node-version: *[\"']*\([0-9][0-9]*\).*/\1/p" "$CI_WORKFLOW" 2>/dev/null | head -1 || true
}

# CI's Postgres image, e.g. "postgres:17"; postgres:17 if not found.
ci_postgres_image() {
  local image
  image="$(sed -n 's/^ *image: *\(postgres:[^ ]*\).*/\1/p' "$CI_WORKFLOW" 2>/dev/null | head -1 || true)"
  echo "${image:-postgres:17}"
}

# Puts CI's Node first on PATH. The image ships several versions under
# /opt/nodeNN; links in ~/.local/bin pick one for this and every later session
# (hooks may start without ~/.local/bin on PATH, so it is added here too).
use_ci_node() {
  local major dir tool
  export PATH="$HOME/.local/bin:$PATH"
  major="$(ci_node_major)"
  dir="/opt/node${major}"
  if [ -z "$major" ] || [ ! -x "$dir/bin/node" ]; then
    dir="$(ls -d /opt/node[0-9]* 2>/dev/null | sort -V | tail -1 || true)"
    warn "a CI usa o Node ${major:-?}, que esta imagem não tem; usando ${dir:-o do PATH}."
  fi
  [ -n "$dir" ] && [ -x "$dir/bin/node" ] || return 0
  mkdir -p "$HOME/.local/bin"
  for tool in node npm npx corepack; do
    if [ -e "$dir/bin/$tool" ]; then
      ln -sf "$dir/bin/$tool" "$HOME/.local/bin/$tool"
    fi
  done
  hash -r
}

# Waits for the Docker daemon. Nothing starts it in a cloud session, and the
# image's `service docker start` fails, so dockerd runs in its own session to
# outlive the script that started it.
ensure_docker() {
  docker info >/dev/null 2>&1 && return 0
  if command -v dockerd >/dev/null 2>&1; then
    # A pidfile kept by the environment's snapshot names a dead process, and
    # dockerd refuses to start over it.
    local pidfile=/var/run/docker.pid
    if [ -f "$pidfile" ] && [ "$(ps -o comm= -p "$(cat "$pidfile")" 2>/dev/null)" != dockerd ]; then
      rm -f "$pidfile"
    fi
    setsid dockerd >/var/log/dockerd.log 2>&1 </dev/null &
  fi
  local _
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "O Docker não respondeu em 30 s (log: /var/log/dockerd.log)." >&2
  return 1
}

# Pulls CI's Postgres image. Docker Hub answers 429 to the cloud's shared IPs,
# so it goes through mirror.gcr.io (Google's mirror of Docker Hub) first.
ensure_postgres_image() {
  local image _
  image="$(ci_postgres_image)"
  docker image inspect "$image" >/dev/null 2>&1 && return 0
  for _ in 1 2 3; do
    if docker pull -q "mirror.gcr.io/library/${image}"; then
      docker tag "mirror.gcr.io/library/${image}" "$image"
      return 0
    fi
    sleep 5
  done
  docker pull -q "$image"
}

pg_psql() {
  docker exec -e PGPASSWORD=postgres "$PG_CONTAINER" \
    psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"
}

# Starts the Postgres container (creating it the first time), waits for it and
# creates the test and shadow databases. Idempotent.
start_postgres() {
  local image db _
  image="$(ci_postgres_image)"
  if ! docker container inspect "$PG_CONTAINER" >/dev/null 2>&1; then
    docker run -d --name "$PG_CONTAINER" \
      -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bitcraft_dev \
      -p "127.0.0.1:${PG_PORT}:5432" -v "${PG_VOLUME}:/var/lib/postgresql/data" \
      "$image" >/dev/null
  else
    docker start "$PG_CONTAINER" >/dev/null
  fi
  # Over TCP: the image's first-run initialization uses a temporary server
  # that only listens on the socket, then restarts it.
  for _ in $(seq 1 60); do
    docker exec "$PG_CONTAINER" pg_isready -q -h 127.0.0.1 -U postgres && break
    sleep 1
  done
  docker exec "$PG_CONTAINER" pg_isready -q -h 127.0.0.1 -U postgres || {
    echo "O Postgres não ficou pronto em 60 s (docker logs $PG_CONTAINER)." >&2
    return 1
  }
  for db in bitcraft_test bitcraft_shadow; do
    if [ "$(pg_psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")" != 1 ]; then
      pg_psql -qc "CREATE DATABASE $db"
    fi
  done
}

# Leaves the database's files cleanly shut down for the environment's snapshot.
stop_postgres_and_docker() {
  docker stop "$PG_CONTAINER" >/dev/null 2>&1 || true
  if [ -f /var/run/docker.pid ]; then
    local pid _
    pid="$(cat /var/run/docker.pid)"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
  fi
}

random_secret() {
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
}

# A .env with local development values, written once: never a real secret,
# never a remote database.
write_env() {
  [ -f .env ] && return 0
  cat >.env <<EOF
# Gerado por scripts/workspace/cloud-setup.sh numa sessão do Claude Code na nuvem.
# Só valores locais de desenvolvimento: nunca aponte estas URLs para o Neon.
DATABASE_URL=${PG_URL_BASE}/bitcraft_dev
DATABASE_URL_UNPOOLED=${PG_URL_BASE}/bitcraft_dev
SHADOW_DATABASE_URL=${PG_URL_BASE}/bitcraft_shadow
TEST_DATABASE_URL=${PG_URL_BASE}/bitcraft_test
SESSION_SECRET=$(random_secret)
CRON_SECRET=$(random_secret)
INVENTORY_STALE_MINUTES=1
EOF
}

env_value() {
  sed -n "s/^$1=//p" .env | tail -1
}

# Refuses to go on when a database URL in .env isn't this machine's Postgres:
# migrations, the seed and the import must never reach Neon from here.
assert_local_env() {
  local key url
  for key in DATABASE_URL DATABASE_URL_UNPOOLED TEST_DATABASE_URL; do
    url="$(env_value "$key")"
    case "$url" in
      postgres://*@localhost:*/* | postgres://*@127.0.0.1:*/*) ;;
      *)
        echo "$key no .env não é o Postgres local; nada foi feito." >&2
        return 1
        ;;
    esac
  done
}

lock_hash() {
  sha256sum package-lock.json | cut -d' ' -f1
}

# npm ci when package-lock.json changed since the last install (a no-op
# otherwise), then the Prisma client, which the branch's schema may change.
install_deps() {
  local stamp=node_modules/.cloud-lock-hash
  if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$(lock_hash)" ]; then
    npm ci --no-audit --no-fund
    lock_hash >"$stamp"
  fi
  node_modules/.bin/prisma generate >/dev/null
}

# The branch's migrations, on the dev and the test databases.
migrate_databases() {
  node_modules/.bin/prisma migrate deploy
  DATABASE_URL_UNPOOLED="$(env_value TEST_DATABASE_URL)" node_modules/.bin/prisma migrate deploy
}

# The commit of the last finished game data import on bitcraft_dev; empty if
# there is none.
game_data_commit() {
  pg_psql -d bitcraft_dev -tAc "SELECT coalesce(commit_sha, source) FROM game_data_imports
    WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1" 2>/dev/null || true
}

# Imports the game data into bitcraft_dev when it has none (GitHub, ~15 s).
# Never fails the caller: without it the app runs, only empty.
ensure_game_data() {
  [ -n "$(game_data_commit)" ] && return 0
  npm run game-data:import || warn "a importação dos dados do jogo falhou; o app sobe sem eles."
}

postgres_version() {
  pg_psql -tAc 'SHOW server_version' | cut -d' ' -f1
}
