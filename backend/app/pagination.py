from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.deps import PageParams


def paginate(db: Session, stmt: Select, page: PageParams, schema: Any) -> dict:
    """Run a filtered statement as {items, total, page, page_size}."""
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(page.page_size).offset(page.offset)).unique().all()
    return {
        "items": [schema.model_validate(r) for r in rows],
        "total": total,
        "page": page.page,
        "page_size": page.page_size,
    }
