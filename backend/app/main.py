from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.db import SessionLocal
from app.errors import register_error_handlers
from app.routers import auth, users

API_PREFIX = "/api/v1"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def create_app() -> FastAPI:
    app = FastAPI(title="Brightloop Subscription Management API", version="0.1.0")
    register_error_handlers(app)

    @app.middleware("http")
    async def csrf_origin_check(request: Request, call_next):
        # Session cookie is SameSite=Lax; additionally reject cross-site state changes.
        # Requests without an Origin header (curl, server-to-server, tests) are allowed.
        origin = request.headers.get("origin")
        if (
            request.method in UNSAFE_METHODS
            and origin
            and origin not in get_settings().allowed_origin_list
        ):
            return JSONResponse(
                {"error": {"code": "FORBIDDEN", "message": "Cross-site request blocked"}},
                status_code=403,
            )
        return await call_next(request)

    @app.get(f"{API_PREFIX}/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok"}

    @app.get(f"{API_PREFIX}/health/ready", tags=["health"])
    def ready() -> dict:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}

    for module in (auth, users):
        app.include_router(module.router, prefix=API_PREFIX)
    return app


app = create_app()
