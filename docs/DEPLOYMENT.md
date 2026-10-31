# Deployment & operations

## Environments

| | Development (Windows 11) | Production (Linux) |
|---|---|---|
| Database | Local PostgreSQL 18 (`backend/.env`) | `postgres:18` container, volume `pgdata`, no public port |
| API | `uv run uvicorn app.main:app --reload` | `backend` container (uvicorn, 2 workers, non-root) |
| Jobs | `uv run python -m app.worker` | `worker` container (heartbeat health check) |
| Migrations | `uv run alembic upgrade head` | `migrate` one-shot container, runs before API/worker start |
| Web | `npm run dev` (proxies `/api` to :8000) | `frontend` container behind Caddy |
| TLS / routing | none | Caddy: automatic HTTPS; `/api/*` -> backend, rest -> frontend |
| Email | `EMAIL_BACKEND=console` (links in the worker log) | SMTP |

## First production deploy (Ubuntu 24.04 LTS, 2 vCPU / 4 GB RAM minimum)

1. Install Docker Engine + Compose plugin; firewall: `ufw allow 22,80,443/tcp && ufw enable`.
2. Point the domain's DNS A record at the server.
3. `git clone … /opt/brightloop && cd /opt/brightloop`
4. `cp .env.example .env && chmod 600 .env`, then set real values. Generate every secret with
   `openssl rand -base64 48`. The API refuses to start in production with a default
   `JWT_SECRET` or `COOKIE_SECURE=false`.
5. `docker compose up -d --build`, then confirm: `docker compose ps` (all healthy) and
   `curl https://$DOMAIN/api/v1/health/ready`.
6. Create the first admin:
   `docker compose run --rm -e SEED_ADMIN_EMAIL=you@company.com -e SEED_ADMIN_PASSWORD='…' backend python -m scripts.seed`
7. Razorpay (optional autopay): set the keys and the webhook URL
   `https://$DOMAIN/api/v1/webhooks/payments/razorpay`. See `docs/PAYMENTS.md`.

## Updating

```bash
./deploy/backup.sh                    # always back up before a deploy
git pull
docker compose up -d --build          # migrate runs first; API/worker wait for it
docker compose ps && curl -fsS https://$DOMAIN/api/v1/health/ready
```

Migrations are additive and owned by one person. A failed migration leaves the old containers
running.

## Backups & restore

- **Nightly:** cron `15 2 * * * cd /opt/brightloop && ./deploy/backup.sh >> /var/log/brightloop-backup.log 2>&1`
  takes a compressed `pg_dump -Fc`, verifies the archive, writes a SHA-256 checksum and keeps
  `BACKUP_KEEP_DAYS` days. If `BACKUP_RCLONE_REMOTE` is set, it also copies off-site.
- **Monthly restore test** (safe, uses a scratch database): `./deploy/restore.sh --test <file.dump>`.
- **Disaster recovery:** `./deploy/restore.sh --live <file.dump>`. It takes a fresh safety
  backup, stops the API and worker, restores in a single transaction, runs migrations and
  restarts.
- Recovery point objective: 24 h with nightly dumps. For less, run the backup more often or use
  a managed PostgreSQL with point-in-time recovery.

## Health & logs

- `GET /api/v1/health` (liveness) and `GET /api/v1/health/ready` (database plus the last billing
  run's status). Container health checks cover the API, worker heartbeat and database.
- Logs are JSON lines on stdout, with an `X-Request-ID` per API request. Read them with
  `docker compose logs -f backend worker`. Log rotation: 10 MB × 5 files per container.
- Watch for: `billing run … partial|failed` (see `GET /api/v1/billing/runs/{id}` for the
  per-subscription errors; failed subscriptions retry automatically every hour), dead emails
  (`email_outbox.status = 'dead'`) and `GET /api/v1/reports/unapplied-payments`.

## Performance

`RUN_PERF=1 uv run pytest tests/test_performance.py -s` seeds 10,000 subscriptions, bills
them twice and times the main pages. Last run on a developer laptop: slowest API page 122 ms
(the PDF limit is 2 s); 10,000 invoices billed in about 64 s; an idempotent re-run takes 0.13 s.
