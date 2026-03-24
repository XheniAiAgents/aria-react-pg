"""
ARIA v4 — FastAPI entry point

Structure:
  backend/routers/   — one file per domain:
                        auth.py      register/login/passwords
                        gmail.py     Google Gmail OAuth + /email/fetch
                        calendar.py  Google Calendar OAuth + sync
                        chat.py      /chat, /chat/file, /memories, /history
                        tasks.py     CRUD tasks
                        events.py    CRUD events (local)
                        notes.py     CRUD notes
                        push.py      Web Push subscriptions
                        admin.py     admin panel
                        user.py      timezone, Telegram link
                        debug.py     temporary debug endpoints
  backend/utils/     — push.py (web push helper), reminders.py (background loops)
"""

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

load_dotenv()

from backend.database import init_db
from backend.utils.reminders import reminder_loop, digest_loop

from backend.routers import (
    auth,
    gmail,
    calendar,
    chat,
    tasks,
    events,
    notes,
    push,
    admin,
    user,
    debug,
)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    asyncio.create_task(reminder_loop())
    asyncio.create_task(digest_loop())
    print("✨ ARIA v4 is awake.")
    yield
    from backend.database import _pool
    if _pool:
        await _pool.close()


# ── App ───────────────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(lifespan=lifespan, title="ARIA v4 API", docs_url=None, redoc_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(gmail.router)
app.include_router(calendar.router)
app.include_router(chat.router)
app.include_router(tasks.router)
app.include_router(events.router)
app.include_router(notes.router)
app.include_router(push.router)
app.include_router(admin.router)
app.include_router(user.router)
app.include_router(debug.router)
app.include_router(voice.router)


# ── Static files ──────────────────────────────────────────────────────────────

frontend_path = Path(__file__).parent / "frontend"
icons_path    = frontend_path / "icons"
assets_path   = frontend_path / "assets"

if assets_path.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
if icons_path.exists():
    app.mount("/icons", StaticFiles(directory=str(icons_path)), name="icons")


@app.get("/aria-avatar.png")
async def aria_avatar():
    p = frontend_path / "aria-avatar.png"
    if p.exists():
        return FileResponse(str(p), media_type="image/png")
    raise HTTPException(status_code=404, detail="Avatar not found")


@app.get("/manifest.json")
async def manifest():
    p = frontend_path / "manifest.json"
    return FileResponse(str(p), media_type="application/manifest+json") if p.exists() else {}


@app.get("/sw.js")
async def service_worker():
    p = frontend_path / "sw.js"
    if p.exists():
        return FileResponse(
            str(p),
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/"},
        )


@app.get("/health")
async def health():
    return {"status": "ok", "version": "4.0", "time": datetime.now().isoformat()}


@app.get("/")
async def root():
    index = frontend_path / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"status": "ARIA v4 running"}
