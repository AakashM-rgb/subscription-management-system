# Backend (FastAPI)

Windows 11 / PowerShell, Python 3.14 via [uv](https://docs.astral.sh/uv/), PostgreSQL 18.

## One-time setup

1. Create the database role and databases (run in `psql` as the `postgres` superuser):

   ```sql
   CREATE ROLE sms LOGIN PASSWORD 'choose-a-dev-password';
   CREATE DATABASE sms_dev OWNER sms;
   CREATE DATABASE sms_test OWNER sms;
   ```

2. Configure and install:

   ```powershell
   cd backend
   Copy-Item .env.example .env   # then edit DATABASE_URL / TEST_DATABASE_URL / JWT_SECRET
   uv sync
   uv run alembic upgrade head
   uv run python -m scripts.seed   # admin@brightloop.example.com / Admin@12345 (dev only)
   ```

## Run

```powershell
uv run uvicorn app.main:app --reload --port 8000
```

- API docs (live contract): http://localhost:8000/docs
- Base path: `/api/v1`. Auth uses the `bl_session` HTTP-only cookie (send `credentials: "include"`).
- Money values are JSON strings (e.g. `"1560.00"`). Lists return `{items, total, page, page_size}`.
  Errors return `{"error": {"code", "message", "details"}}`.

## Test & lint

```powershell
uv run pytest          # uses TEST_DATABASE_URL; the schema of that *_test DB is rebuilt
uv run ruff check . ; uv run ruff format --check .
```

## Migrations

Only Aakash creates migrations (`uv run alembic revision --autogenerate -m "..."`).
Everyone else only runs `uv run alembic upgrade head` after pulling.
