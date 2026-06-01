#!/usr/bin/env bash
# Spusti ľubovoľný príkaz proti PRODUKČNEJ databáze (stiahne prod DATABASE_URL z Vercelu).
# Príklady:
#   bash prod.sh npm run user:list
#   bash prod.sh npm run user:delete -- andrej@klinika.sk
set -euo pipefail
cd "$(dirname "$0")"
trap 'rm -f /tmp/prod.env' EXIT

vercel env pull /tmp/prod.env --environment=production --yes >/dev/null
DATABASE_URL="$(grep '^DATABASE_URL=' /tmp/prod.env | cut -d= -f2- | tr -d '"')"
if [ -z "$DATABASE_URL" ]; then
  echo "✗ Nenašiel som DATABASE_URL. Si prihlásený do Vercelu a v priečinku projektu?"
  exit 1
fi
export DATABASE_URL

"$@"
