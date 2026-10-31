#!/usr/bin/env bash
# Restore a backup.
#   ./deploy/restore.sh --test  <file.dump>   restore into a scratch database and verify (safe)
#   ./deploy/restore.sh --live  <file.dump>   REPLACE the production database (asks to confirm)
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

MODE="${1:-}"; FILE="${2:-}"
[[ -f "$FILE" ]] || { echo "usage: $0 --test|--live <file.dump>"; exit 2; }
if [[ -f "$FILE.sha256" ]]; then sha256sum --check --status "$FILE.sha256"; fi

psql_db() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" "${@:2}"; }

case "$MODE" in
  --test)
    TEST_DB="brightloop_restore_test"
    psql_db postgres -c "DROP DATABASE IF EXISTS $TEST_DB" -c "CREATE DATABASE $TEST_DB"
    docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$TEST_DB" --no-owner < "$FILE"
    psql_db "$TEST_DB" -At -c "SELECT 'subscriptions=' || count(*) FROM subscriptions" \
                          -c "SELECT 'invoices=' || count(*) FROM invoices" \
                          -c "SELECT 'payments=' || count(*) FROM payments" \
                          -c "SELECT 'alembic=' || version_num FROM alembic_version"
    psql_db postgres -c "DROP DATABASE $TEST_DB"
    echo "restore test OK"
    ;;
  --live)
    read -r -p "This REPLACES database '$POSTGRES_DB' with $FILE. Type the database name: " answer
    [[ "$answer" == "$POSTGRES_DB" ]] || { echo "aborted"; exit 1; }
    ./deploy/backup.sh   # safety copy of the current state first
    docker compose stop backend worker
    docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      --clean --if-exists --no-owner --single-transaction < "$FILE"
    docker compose run --rm migrate          # bring schema to the deployed code's version
    docker compose start backend worker
    echo "live restore complete"
    ;;
  *) echo "usage: $0 --test|--live <file.dump>"; exit 2 ;;
esac
