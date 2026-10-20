"""Wasl API entrypoint."""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.ai.router import AIUnavailableError
from app.config import settings
from app.db import init_db
from app.monitoring.recorder import record_error, record_http_event
from app.routers import achievements, auth, career, cv, dashboard, discovery, integrations, monitoring, posts, user_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("wasl")

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Wasl API", version="1.0.0", description="AI-powered career platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def monitor_requests(request: Request, call_next):
    """Records method, route TEMPLATE (no ids / query strings), status and latency of every API call."""
    t0 = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        route = request.scope.get("route")
        path = getattr(route, "path", None)
        if path and path.startswith("/api") and not path.startswith("/api/monitoring"):
            record_http_event(
                method=request.method, route=path, status_code=status,
                latency_ms=int((time.perf_counter() - t0) * 1000), user_id=getattr(request.state, "user_id", None),
            )


@app.exception_handler(AIUnavailableError)
async def ai_unavailable(request: Request, exc: AIUnavailableError):
    return JSONResponse(status_code=503, content={"detail": exc.reason, "code": "ai_unavailable"})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    errs = [{"field": ".".join(str(x) for x in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Invalid input", "errors": errs})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    route = getattr(request.scope.get("route"), "path", request.url.path)
    err_id = record_error(route, exc, getattr(request.state, "user_id", None))
    log.exception("unhandled error %s on %s", err_id, route)
    return JSONResponse(status_code=500, content={"detail": f"Something went wrong. Reference: {err_id[:8]}", "error_id": err_id})


for r in (auth, dashboard, achievements, posts, cv, career, discovery, integrations, user_settings, monitoring):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    from app.ai.providers.registry import platform_providers

    return {"status": "ok", "auth_mode": settings.auth_mode, "database": "sqlite" if settings.is_sqlite else "postgres",
            "ai_providers_configured": platform_providers()}
