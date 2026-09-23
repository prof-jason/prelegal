"""Application entrypoint: wires up the API routes and static frontend."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from app import config, db, documents
from app.routers import auth, catalog, nda_chat
from app.routers import documents as documents_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The database is recreated from scratch every time the app starts, so
    # there's never anything to migrate -- just rebuild the schema.
    db.reset_db()
    # Parse and validate every document template up front, so a missing or
    # broken template fails the boot rather than a user's first request.
    documents.reload()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Prelegal API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # Concrete API routes are registered before the catch-all static mount
    # below so they always take priority over it.
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(catalog.router, prefix="/api", tags=["catalog"])
    app.include_router(nda_chat.router, prefix="/api", tags=["nda-chat"])
    app.include_router(documents_router.router, prefix="/api", tags=["documents"])

    # html=True: "/" serves index.html, and an unmatched path serves the
    # frontend's own generated 404.html (with a 404 status) if one is
    # present -- the same behavior any static host (Vercel, Netlify, S3)
    # would give a Next.js static export. check_dir=False: don't hard-fail
    # at startup if the frontend hasn't been built yet (e.g. running the
    # backend standalone in dev); a request would then just 404 instead of
    # the whole app refusing to boot.
    app.mount(
        "/",
        StaticFiles(directory=config.static_dir(), html=True, check_dir=False),
        name="static",
    )

    return app


app = create_app()
