#!/usr/bin/env bash
# Starts this checkout's dev stack in a Claude Code cloud session and brings it
# up to date with the branch: Docker, Postgres, dependencies, the Prisma client
# and the migrations of the dev and test databases. The environment's cache,
# built by cloud-setup.sh, keeps files but not processes, so every session
# needs this.
#
# The SessionStart hook (session-start.sh) runs it at each session start. In a
# session with several repositories, cloud sessions don't run any hooks: run it
# by hand before the app or the integration tests:
#   bash scripts/workspace/cloud-start.sh
#
# Idempotent: on a stack that is already up it only checks. Its last line is a
# one-line summary, which session-start.sh shows.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." # the checkout's root
source scripts/workspace/lib.sh

if ! is_claude_cloud; then
  echo "cloud-start.sh é para as sessões do Claude Code na nuvem (CLAUDE_CODE_REMOTE=true)." >&2
  exit 1
fi

use_ci_node

# A cache built before this recipe existed (or a checkout new to this
# machine) has nothing installed yet: run the whole recipe first.
if [ ! -f .workspace/ready ] || [ ! -f .env ] || [ ! -d node_modules ]; then
  echo "Este checkout ainda não foi preparado: rodando scripts/workspace/cloud-setup.sh."
  bash scripts/workspace/cloud-setup.sh
fi

assert_local_env
ensure_docker
start_postgres
install_deps
migrate_databases
ensure_game_data

node_note=""
case "$(node -v)" in
  "v$(ci_node_major)."*) ;;
  *) node_note=" (a CI usa o Node $(ci_node_major))" ;;
esac
game_data="$(game_data_commit)"
if [ -n "$game_data" ]; then
  game_note="dados do jogo do commit ${game_data:0:12}"
else
  game_note="SEM os dados do jogo (npm run game-data:import)"
fi
echo "Postgres $(postgres_version) em 127.0.0.1:${PG_PORT} (bitcraft_dev e bitcraft_test, migrations em dia), node $(node -v)${node_note}, ${game_note}."
