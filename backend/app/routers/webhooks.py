from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from app.deps import DB
from app.services import webhooks

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/payments/{provider}")
async def payment_webhook(provider: str, request: Request, db: DB) -> dict:
    """Server-to-server endpoint: authenticated by the provider's signature, not a cookie."""
    raw_body = await request.body()  # signatures are computed over the exact raw bytes
    headers = {k.lower(): v for k, v in request.headers.items()}
    return await run_in_threadpool(webhooks.receive, db, provider, headers, raw_body)
