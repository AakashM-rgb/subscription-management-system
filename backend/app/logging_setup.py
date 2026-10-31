"""Structured JSON logs with a per-request id (X-Request-ID) for API and worker processes."""

import json
import logging
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id:
            entry["request_id"] = request_id
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if not any(isinstance(h.formatter, JsonFormatter) for h in root.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        root.handlers = [handler]
        root.setLevel(level)
    # Uvicorn installs plain-text handlers: send its logs through the JSON root handler instead,
    # and replace its access log with app.access (which carries the request id and duration).
    for name in ("uvicorn", "uvicorn.error"):
        server_logger = logging.getLogger(name)
        server_logger.handlers = []
        server_logger.propagate = True
    logging.getLogger("uvicorn.access").disabled = True


def new_request_id(incoming: str | None) -> str:
    if incoming and 8 <= len(incoming) <= 64 and incoming.replace("-", "").isalnum():
        return incoming
    return uuid.uuid4().hex
