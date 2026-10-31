"""Append-only audit trail for business and financial operations."""

from sqlalchemy.orm import Session

from app.models import AuditEvent, User


def record(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: int,
    actor: User | None = None,
    actor_type: str | None = None,
    data: dict | None = None,
) -> AuditEvent:
    """Add an audit event to the current transaction (committed with the business change)."""
    event = AuditEvent(
        actor_type=actor_type or ("user" if actor else "system"),
        actor_user_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        data=data or {},
    )
    db.add(event)
    return event
