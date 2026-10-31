"""Idempotent bootstrap data: first admin, default taxes and payment terms.

Usage (from backend/):  uv run python -m scripts.seed
Admin credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (dev defaults below).
"""

import os
from decimal import Decimal

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import PaymentTerm, Tax, User
from app.security import hash_password, password_problems

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@brightloop.example.com")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@12345")

TAXES = [("GST 18%", Decimal("18.000")), ("Exempt 0%", Decimal("0.000"))]
PAYMENT_TERMS = [("Immediate", 0), ("Net 15", 15), ("Net 30", 30)]


def seed() -> None:
    problems = password_problems(ADMIN_PASSWORD)
    if problems:
        raise SystemExit(f"SEED_ADMIN_PASSWORD {', '.join(problems)}")
    with SessionLocal() as db:
        if not db.scalar(select(User).where(func.lower(User.email) == ADMIN_EMAIL.lower())):
            db.add(
                User(
                    email=ADMIN_EMAIL.lower(),
                    full_name="Brightloop Admin",
                    password_hash=hash_password(ADMIN_PASSWORD),
                    role="admin",
                )
            )
            print(f"created admin {ADMIN_EMAIL}")
        for name, rate in TAXES:
            if not db.scalar(select(Tax).where(Tax.name == name)):
                db.add(Tax(name=name, rate=rate))
        for name, days in PAYMENT_TERMS:
            if not db.scalar(select(PaymentTerm).where(PaymentTerm.name == name)):
                db.add(PaymentTerm(name=name, due_days=days))
        db.commit()
    print("seed complete")


if __name__ == "__main__":
    seed()
