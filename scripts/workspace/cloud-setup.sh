#!/usr/bin/env bash
# Recipe of this repository's Claude Code cloud environment (claude.ai/code).
# The environment's own setup script only calls it, from the directory that
# holds the checkout:
#
#   if [ -f bitcraft-companion/scripts/workspace/cloud-setup.sh ]; then
#     (cd bitcraft-companion && bash scripts/workspace/cloud-setup.sh)
#   fi
#
# It runs as root, before the session starts, when the environment's cache is
# built: in the first session, after a change to the environment's setup script
# or network, and when the cache expires (about every 7 days). The cache is a
# snapshot of the disk: Node, the Postgres image and data, node_modules and .env
# stay; running processes don't, so each session starts Docker and Postgres
# again (session-start.sh → cloud-start.sh).
#
# Same versions as CI (.github/workflows/ci.yml): Node and the Postgres image.
# Idempotent and non-interactive; it must finish within about 5 minutes or the
# environment isn't cached. Local development values only: no secret goes here.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." # the checkout's root

if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ]; then
  echo "cloud-setup.sh prepara um ambiente de nuvem do Claude Code (Linux, root)." >&2
  exit 1
fi

export BITCRAFT_CLOUD=1
source scripts/workspace/lib.sh

started=$SECONDS
say() { printf '\n==> [%ss] %s\n' "$((SECONDS - started))" "$*"; }

say "Node da CI"
use_ci_node
echo "node $(node -v), npm $(npm -v)"

say "Docker e a imagem $(ci_postgres_image)"
ensure_docker
ensure_postgres_image

say "Postgres (bitcraft_dev, bitcraft_test, bitcraft_shadow)"
start_postgres

say ".env local"
write_env
assert_local_env

say "Dependências (npm ci) e o cliente do Prisma"
install_deps

say "Migrations nos bancos de dev e de teste"
migrate_databases

say "Dados do jogo no banco de dev"
ensure_game_data

say "Usuário de desenvolvimento (prisma/seed.ts)"
npm run db:seed || warn "o seed falhou; crie um usuário com npm run users:create."

say "graphify ${GRAPHIFY_VERSION} e o grafo do código"
{ ensure_graphify && update_graph; } || warn "o graphify falhou; o ambiente segue sem o grafo do código."

mkdir -p .workspace
touch .workspace/ready

# Building the environment's cache: leave the database's files cleanly shut
# down for the snapshot. Inside a session (cloud-start.sh calling this on a
# checkout that wasn't set up yet), keep them running.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  say "Parando o Postgres e o Docker para o snapshot"
  stop_postgres_and_docker
fi

say "Ambiente pronto."
