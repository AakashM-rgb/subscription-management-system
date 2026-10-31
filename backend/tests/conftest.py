from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import PaymentTerm, Tax, User
from app.security import hash_password

BACKEND_DIR = Path(__file__).resolve().parents[1]
PASSWORD = "Passw0rd!x"


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = get_settings().test_database_url
    # Safety: this fixture rebuilds the schema, so it must only ever touch a *_test database.
    assert make_url(url).database.endswith("_test"), "TEST_DATABASE_URL must point at a *_test db"
    eng = create_engine(url)
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """Each test runs in a transaction that is rolled back; app commits become savepoints."""
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_user(db: Session, role: str, email: str | None = None) -> User:
    user = User(
        email=email or f"{role}@example.com",
        full_name=f"Test {role.title()}",
        password_hash=hash_password(PASSWORD),
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def login(client: TestClient, email: str, password: str = PASSWORD) -> None:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text


@pytest.fixture
def admin_client(client: TestClient, db: Session) -> TestClient:
    login(client, make_user(db, "admin").email)
    return client


@pytest.fixture
def staff_client(client: TestClient, db: Session) -> TestClient:
    login(client, make_user(db, "staff").email)
    return client


@pytest.fixture
def basics(db: Session) -> dict:
    gst = Tax(name="GST 18%", rate="18.000")
    net15 = PaymentTerm(name="Net 15", due_days=15)
    db.add_all([gst, net15])
    db.flush()
    return {"tax": gst, "term": net15}
