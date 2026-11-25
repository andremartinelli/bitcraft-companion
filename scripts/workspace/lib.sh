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

# Installs the latest release of Node <major> from nodejs.org into
# /opt/node<major>, next to the image's own versions, after checking it
# against the release's SHASUMS256.txt. Returns non-zero when it can't
# (no network to nodejs.org, unknown architecture).
install_node() {
  local major="$1" arch base file tmp
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) return 1 ;;
  esac
  base="https://nodejs.org/dist/latest-v${major}.x"
  tmp="$(mktemp -d)"
  if curl -fsSL --retry 2 "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt" &&
    file="$(grep -o "node-v${major}\.[0-9.]*-linux-${arch}\.tar\.gz" "$tmp/SHASUMS256.txt" | head -1)" &&
    [ -n "$file" ] &&
    curl -fsSL --retry 2 "$base/$file" -o "$tmp/$file" &&
    (cd "$tmp" && grep " ${file}\$" SHASUMS256.txt | sha256sum -c --quiet -) &&
    mkdir -p "/opt/node${major}" &&
    tar -xzf "$tmp/$file" -C "/opt/node${major}" --strip-components=1; then
    rm -rf "$tmp"
    return 0
  fi
  rm -rf "$tmp" "/opt/node${major}"
  return 1
}

# Puts CI's Node first on PATH. The image ships some versions under
# /opt/nodeNN; when CI's isn't one of them, it comes from nodejs.org (once:
# the environment's cache keeps it). Links in ~/.local/bin pick it for this
# and every later session (hooks may start without ~/.local/bin on PATH, so
# it is added here too).
use_ci_node() {
  local major dir tool
  export PATH="$HOME/.local/bin:$PATH"
  major="$(ci_node_major)"
  dir="/opt/node${major}"
  if [ -n "$major" ] && [ ! -x "$dir/bin/node" ]; then
    echo "Instalando o Node ${major} da CI (nodejs.org)."
    install_node "$major" || true
  fi
  if [ -z "$major" ] || [ ! -x "$dir/bin/node" ]; then
    dir="$(ls -d /opt/node[0-9]* 2>/dev/null | sort -V | tail -1 || true)"
    warn "a CI usa o Node ${major:-?}, que não veio do nodejs.org; usando ${dir:-o do PATH}."
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
# Generated by scripts/workspace/cloud-setup.sh in a Claude Code cloud session.
# Local development values only: never point these URLs at Neon.
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

# The commit of the last finished game data import on bitcraft_dev ("local"
# for an import from a folder); empty if there is none.
game_data_commit() {
  pg_psql -d bitcraft_dev -tAc "SELECT coalesce(commit_sha, source) FROM game_data_imports
    WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1" 2>/dev/null || true
}

GAME_DATA_RAW="https://raw.githubusercontent.com/BitCraftToolBox/BitCraft_GameData/refs/heads/cereal/cs/static"

# The tables the importer reads (GAME_TABLES in src/services/game_data/source.ts).
game_tables() {
  sed -n "/GAME_TABLES = \[/,/\]/s/^ *'\([a-z_]*\)',*$/\1/p" src/services/game_data/source.ts
}

# Downloads the tables at the branch's tip from raw.githubusercontent.com into
# .workspace/game-data and prints that folder.
download_game_data() {
  local dir=.workspace/game-data table
  rm -rf "$dir"
  mkdir -p "$dir"
  for table in $(game_tables); do
    curl -fsSL --retry 2 "$GAME_DATA_RAW/$table.json" -o "$dir/$table.json" || return 1
  done
  echo "$dir"
}

# Imports the game data into bitcraft_dev when it has none (~15 s). The normal
# import asks api.github.com for the branch's commit, and a cloud session's
# GitHub proxy answers 403 for a repository that isn't attached to it; then
# the same tables come from raw.githubusercontent.com, imported from a folder.
# Never fails the caller: without them the app runs, only empty.
ensure_game_data() {
  local dir
  [ -n "$(game_data_commit)" ] && return 0
  npm run game-data:import && return 0
  echo "Sem a API do GitHub: importando as tabelas do branch pelo raw.githubusercontent.com."
  if dir="$(download_game_data)" && npm run game-data:import -- --path="$dir"; then
    return 0
  fi
  warn "a importação dos dados do jogo falhou; o app sobe sem eles."
}

postgres_version() {
  pg_psql -tAc 'SHOW server_version' | cut -d' ' -f1
}

# graphify: the code's knowledge graph in graphify-out/ (CLAUDE.md, "Grafo do
# código"). Pinned: read the new version's changelog and hooks before bumping.
GRAPHIFY_VERSION=0.9.119

# Installs graphify GRAPHIFY_VERSION with uv (a no-op when it is already there)
# and its /graphify skill for Claude Code (user scope, outside git).
ensure_graphify() {
  export PATH="$HOME/.local/bin:$PATH"
  uv tool install -q "graphifyy==${GRAPHIFY_VERSION}" && graphify install >/dev/null
}

# Rebuilds graphify-out/ (in .gitignore) from the branch's code: syntax trees
# only, no LLM, about 4 s. --force: the graph follows the branch even when it
# shrinks (graphify keeps the old graph otherwise).
update_graph() {
  graphify update . --force >/dev/null
}
