from datetime import date, datetime
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError, not_found


def business_today() -> date:
    """'Today' for due dates and reports is the business's calendar day, not the server's."""
    return datetime.now(ZoneInfo(get_settings().business_timezone)).date()


def get_or_404[T](db: Session, model: type[T], entity_id: int, entity: str) -> T:
    obj = db.get(model, entity_id)
    if obj is None:
        raise not_found(entity)
    return obj


def apply_changes(obj: object, body: BaseModel, exclude: set[str] | None = None) -> set[str]:
    """Copy the fields the client actually sent onto the ORM object; returns their names.
    An explicit null for a NOT NULL column is a validation error, not a database error."""
    changes = body.model_dump(exclude_unset=True, exclude=exclude or set())
    columns = inspect(type(obj)).columns
    for field, value in changes.items():
        if value is None and field in columns and not columns[field].nullable:
            raise AppError(422, "VALIDATION_ERROR", f"{field} cannot be null")
    for field, value in changes.items():
        setattr(obj, field, value)
    return set(changes)


def commit_or_conflict(db: Session, message: str) -> None:
    """Commit; a unique/foreign-key violation becomes a 409 instead of a 500."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "DUPLICATE", message) from exc
