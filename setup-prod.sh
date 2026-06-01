#!/usr/bin/env bash
# Jednorazové nastavenie produkcie: vytvorí tabuľky v prod DB a admina.
# Spúšťaj z priečinka projektu:  bash setup-prod.sh
set -euo pipefail
cd "$(dirname "$0")"
trap 'rm -f /tmp/prod.env' EXIT   # heslá z dočasného súboru zmaž vždy, aj pri chybe

echo "→ Sťahujem produkčné nastavenia z Vercelu…"
vercel env pull /tmp/prod.env --environment=production --yes >/dev/null

DATABASE_URL="$(grep '^DATABASE_URL=' /tmp/prod.env | cut -d= -f2- | tr -d '"')"
if [ -z "$DATABASE_URL" ]; then
  echo "✗ Nenašiel som DATABASE_URL. Si prihlásený do Vercelu (vercel whoami) a v priečinku projektu?"
  exit 1
fi
export DATABASE_URL

echo ""
read -r -p "Admin e-mail (tvoje prihlasovacie meno): " BOOTSTRAP_ADMIN_EMAIL
read -r -p "Meno (napr. MUDr. Andrej): " BOOTSTRAP_ADMIN_NAME
read -r -s -p "Heslo (min. 12 znakov, nezobrazí sa): " BOOTSTRAP_ADMIN_PASSWORD; echo
export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD

echo ""
echo "→ Vytváram tabuľky v produkčnej databáze…"
npx prisma migrate deploy

echo "→ Vytváram admina + základnú konfiguráciu ambulancie…"
npm run db:bootstrap

echo ""
echo "✓ Hotovo! Prihlás sa na https://andrej-booking.vercel.app/login"
echo "  E-mailom: $BOOTSTRAP_ADMIN_EMAIL"
