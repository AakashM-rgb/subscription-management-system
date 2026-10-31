import importlib
import pkgutil

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app import routers as routers_pkg
from app.config import get_settings
from app.db import SessionLocal
from app.errors import register_error_handlers
from app.logging_setup import configure_logging, new_request_id, request_id_var
from app.models import BillingRun

API_PREFIX = "/api/v1"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Provider webhooks are server-to-server calls authenticated by signature, not by cookie.
CSRF_EXEMPT_PREFIXES = (f"{API_PREFIX}/webhooks/",)
DEFAULT_SECRET_MARKERS = ("change-me", "CHANGE_ME")


def _check_production_settings() -> None:
    settings = get_settings()
    if settings.app_env != "production":
        return
    secret = settings.jwt_secret
    if len(secret) < 32 or any(marker in secret for marker in DEFAULT_SECRET_MARKERS):
        raise RuntimeError("JWT_SECRET must be a unique random value of 32+ chars in production")
    if not settings.cookie_secure:
        raise RuntimeError("COOKIE_SECURE must be true in production")


def _include_routers(app: FastAPI) -> None:
    """Every module in app/routers exposing `router` is mounted; no shared registry to edit."""
    for info in sorted(pkgutil.iter_modules(routers_pkg.__path__), key=lambda m: m.name):
        module = importlib.import_module(f"app.routers.{info.name}")
        router = getattr(module, "router", None)
        if router is not None:
            app.include_router(router, prefix=API_PREFIX)


def create_app() -> FastAPI:
    _check_production_settings()
    configure_logging()
    application = FastAPI(title="Brightloop Subscription Management API", version="0.2.0")
    register_error_handlers(application)

    @application.middleware("http")
    async def request_id(request: Request, call_next):
        token = request_id_var.set(new_request_id(request.headers.get("x-request-id")))
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id_var.get()
            return response
        finally:
            request_id_var.reset(token)

    @application.middleware("http")
    async def csrf_origin_check(request: Request, call_next):
        # Session cookie is SameSite=Lax; additionally reject cross-site state changes.
        # Requests without an Origin header (curl, server-to-server, tests) are allowed.
        origin = request.headers.get("origin")
        if (
            request.method in UNSAFE_METHODS
            and origin
            and origin not in get_settings().allowed_origin_list
            and not request.url.path.startswith(CSRF_EXEMPT_PREFIXES)
        ):
            return JSONResponse(
                {"error": {"code": "FORBIDDEN", "message": "Cross-site request blocked"}},
                status_code=403,
            )
        return await call_next(request)

    @application.get(f"{API_PREFIX}/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok"}

    @application.get(f"{API_PREFIX}/health/ready", tags=["health"])
    def ready() -> dict:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
            last = db.scalar(select(BillingRun).order_by(BillingRun.id.desc()).limit(1))
        return {
            "status": "ok",
            "database": "ok",
            "last_billing_run": (
                {"id": last.id, "status": last.status, "started_at": last.started_at}
                if last
                else None
            ),
        }

    _include_routers(application)
    return application


app = create_app()
