#!/usr/bin/env bash
# Write-enabled end-to-end run against real API and worker processes on a DISPOSABLE database.
#   E2E_DATABASE_URL=postgresql+psycopg://sms:...@127.0.0.1:5432/sms_e2e ./e2e/run_e2e.sh
# The database name must end in "_e2e". Create it empty first (CREATE DATABASE sms_e2e OWNER sms).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${E2E_DATABASE_URL:?set E2E_DATABASE_URL to a disposable *_e2e database}"
[[ "${E2E_DATABASE_URL##*/}" == *_e2e ]] || { echo "refusing: database must end in _e2e"; exit 2; }
PORT="${E2E_PORT:-8200}"
export DATABASE_URL="$E2E_DATABASE_URL" EMAIL_BACKEND=console
# Dummy API keys (no outbound Razorpay calls are made); the webhook secret is real for signing.
export RAZORPAY_KEY_ID="rzp_test_e2e_dummy" RAZORPAY_KEY_SECRET="e2e_dummy_secret"
export RAZORPAY_WEBHOOK_SECRET="${E2E_WEBHOOK_SECRET:-e2e_whsec_$(date +%s)}"
export E2E_BASE_URL="http://127.0.0.1:$PORT" E2E_WEBHOOK_SECRET="$RAZORPAY_WEBHOOK_SECRET"
export E2E_STATE_FILE="${TMPDIR:-/tmp}/brightloop_e2e_state.json"

uv run alembic upgrade head
uv run python -m scripts.seed

if curl -s -o /dev/null "$E2E_BASE_URL/api/v1/health"; then
  echo "refusing: something is already listening on port $PORT (stale server?)"; exit 3
fi
uv run uvicorn app.main:app --port "$PORT" > e2e-backend.log 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf "$E2E_BASE_URL/api/v1/health/ready" >/dev/null && break; sleep 1; done

uv run pytest e2e -o addopts="" -p no:cacheprovider -q -k "not test_worker_billed"
timeout 20 uv run python -m app.worker > e2e-worker.log 2>&1 || true   # independent worker
uv run pytest e2e -o addopts="" -p no:cacheprovider -q -k "test_worker_billed"
echo "E2E OK"
