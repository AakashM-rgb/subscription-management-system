from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import AppError, not_found
from app.models import User
from app.services import audit
from app.services.periods import business_today

__all__ = [
    "apply_audited",
    "apply_changes",
    "audited_add",
    "business_today",
    "commit_or_conflict",
    "get_or_404",
]


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


def _plain(value: object, column=None) -> object:
    """JSON-safe, stable form of a value for the audit trail (decimals at column scale)."""
    if isinstance(value, Decimal):
        scale = getattr(getattr(column, "type", None), "scale", None)
        if scale is not None:
            value = value.quantize(Decimal(1).scaleb(-scale))
        return format(value, "f")
    if isinstance(value, date | datetime):
        return value.isoformat()
    return value


def audited_add(
    db: Session,
    obj: object,
    *,
    entity_type: str,
    actor: User,
    conflict: str,
    data: dict | None = None,
) -> None:
    """Insert `obj`, record `<entity_type>.created` and commit them together."""
    try:
        db.add(obj)
        db.flush()
        audit.record(
            db,
            action=f"{entity_type}.created",
            entity_type=entity_type,
            entity_id=obj.id,
            actor=actor,
            data=data or {},
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "DUPLICATE", conflict) from exc


def apply_audited(
    db: Session,
    obj: object,
    body: BaseModel,
    *,
    entity_type: str,
    actor: User,
    exclude: set[str] | None = None,
    extra: dict | None = None,
    redact: bool = False,
) -> set[str]:
    """apply_changes plus an audit event listing what really changed (old and new value).
    No event is written when nothing changed. With `redact` only the field names are kept,
    for personal data that an append-only trail must not hold. The caller commits."""
    columns = inspect(type(obj)).columns
    fields = set(body.model_fields_set) - (exclude or set())
    before = {f: getattr(obj, f) for f in fields if hasattr(obj, f)}
    apply_changes(obj, body, exclude)
    changes: dict[str, dict] = {}
    for field, old in before.items():
        new = getattr(obj, field)
        if old != new:
            column = columns.get(field)
            changes[field] = {"from": _plain(old, column), "to": _plain(new, column)}
    changes.update(extra or {})
    if changes:
        audit.record(
            db,
            action=f"{entity_type}.updated",
            entity_type=entity_type,
            entity_id=obj.id,
            actor=actor,
            data={"fields": sorted(changes)} if redact else {"changes": changes},
        )
    return set(changes)
