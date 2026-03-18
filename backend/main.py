"""
ARIA v4 — FastAPI backend
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from datetime import datetime
from fastapi import File, UploadFile, Form
from backend.file_handler import extract_text_from_file

load_dotenv()

from backend.database import (
    init_db,
    ensure_link_codes_table, ensure_reset_tokens_table,
    ensure_email_account_table, ensure_google_tokens_table,
    get_or_create_user, get_all_users, get_user_by_id,
    register_user, login_user,
    get_memories, delete_memory,
    get_tasks, add_task, complete_task, delete_task,
    get_events, get_events_month, add_event, delete_event,
    get_pending_reminders, mark_reminder_sent,
    get_task_reminders, clear_task_reminder,
    create_link_code, verify_link_code,
    create_reset_token, verify_reset_token, reset_password,
    cleanup_old_data,
    ensure_google_tokens_table, save_google_token, get_google_token,
    save_google_digest_settings, delete_google_token,
    get_users_due_for_gmail_digest,
    ensure_email_account_table, save_email_account,
    get_email_account, delete_email_account,
    verify_password, hash_password,
    get_notes, add_note, update_note, delete_note,
)
from backend.aria import chat
from backend.email_service import send_welcome_email, send_reset_email, send_digest_email
from backend.email_digest import summarize_emails
from backend.google_oauth import get_auth_url, exchange_code, get_gmail_address, fetch_todays_emails_oauth


# ── Rate limiter ──────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


# ── Background tasks ──────────────────────────────────────────────────────────

async def reminder_loop():
    """Send Telegram reminders for events and tasks every minute."""
    import telegram
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        return
    bot = telegram.Bot(token=token)
    while True:
        try:
            for event in await get_pending_reminders():
                tid = event.get("telegram_id")
                if tid:
                    time_str = event.get("event_time", "")
                    msg = f"⏰ Reminder: *{event['title']}*"
                    if time_str:
                        msg += f" at {time_str}"
                    msg += "\n\n— ARIA"
                    await bot.send_message(
                        chat_id=tid, text=msg, parse_mode="Markdown"
                    )
                    await mark_reminder_sent(event["id"])
            for task in await get_task_reminders():
                tid = task.get("telegram_id")
                if tid:
                    msg = f"📌 Task reminder: *{task['title']}*\n\n— ARIA"
                    await bot.send_message(
                        chat_id=tid, text=msg, parse_mode="Markdown"
                    )
                    await clear_task_reminder(task["id"])
            await cleanup_old_data()
        except Exception as e:
            print(f"[reminder] Error: {e}")
        await asyncio.sleep(60)


async def digest_loop():
    """Send scheduled Gmail digests every minute."""
    while True:
        await asyncio.sleep(60)
        try:
            users = await get_users_due_for_gmail_digest()
            for u in users:
                try:
                    import json
                    token_data = (
                        json.loads(u["token_data"])
                        if isinstance(u["token_data"], str)
                        else u["token_data"]
                    )
                    emails = await asyncio.get_event_loop().run_in_executor(
                        None, fetch_todays_emails_oauth, token_data
                    )
                    summary = await asyncio.get_event_loop().run_in_executor(
                        None, summarize_emails, emails, u["name"]
                    )
                    await send_digest_email(
                        u["notify_email"], u["name"], summary,
                        len(emails), u["digest_time"]
                    )
                    print(f"[digest] Sent to {u['notify_email']}")
                except Exception as e:
                    print(f"[digest] Error for user {u.get('user_id')}: {e}")
        except Exception as e:
            print(f"[digest] Loop error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    asyncio.create_task(reminder_loop())
    asyncio.create_task(digest_loop())
    print("✨ ARIA v4 is awake.")
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(lifespan=lifespan, title="ARIA v4 API", docs_url=None, redoc_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — restrict to your domain in production
# For local use "*" is fine; swap for your URL when deploying
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files — Vite dist is copied to backend/frontend/ during build
frontend_path = Path(__file__).parent / "frontend"
icons_path = frontend_path / "icons"
assets_path = frontend_path / "assets"

if assets_path.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
if icons_path.exists():
    app.mount("/icons", StaticFiles(directory=str(icons_path)), name="icons")


# ── Request models ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    user_id: int
    mode: str = "work"
    lang: str = "en"

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class EmailLoginRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    name: str
    telegram_id: Optional[str] = None

class TaskCreate(BaseModel):
    user_id: int
    title: str
    reminder_at: Optional[str] = None

class EventCreate(BaseModel):
    user_id: int
    title: str
    event_date: str
    event_time: Optional[str] = None
    description: Optional[str] = None
    reminder_minutes: int = 15

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    user_id: int
    current_password: str
    new_password: str


# ── Static routes ─────────────────────────────────────────────────────────────

@app.get("/manifest.json")
async def manifest():
    p = frontend_path / "manifest.json"
    return FileResponse(str(p), media_type="application/manifest+json") if p.exists() else {}


@app.get("/sw.js")
async def service_worker():
    p = frontend_path / "sw.js"
    if p.exists():
        return FileResponse(
            str(p), media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/"}
        )


@app.get("/")
async def root():
    index = frontend_path / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"status": "ARIA v4 running"}

@app.get("/health")
async def health():
    return {"status": "ok", "version": "4.0", "time": datetime.now().isoformat()}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/auth/register")
@limiter.limit("10/minute")
async def auth_register(req: RegisterRequest, request: Request):
    if not req.name.strip() or not req.email.strip() or not req.password:
        raise HTTPException(400, "Name, email and password are required")
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user = await register_user(req.name, req.email, req.password)
    if not user:
        raise HTTPException(409, "Email already registered")
    asyncio.create_task(send_welcome_email(req.email, req.name.strip()))
    return {"user": {k: v for k, v in user.items() if k not in ("password_hash", "password_salt")}}


@app.post("/auth/login")
@limiter.limit("20/minute")
async def auth_login(req: EmailLoginRequest, request: Request):
    user = await login_user(req.email, req.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")
    return {"user": {k: v for k, v in user.items() if k not in ("password_hash", "password_salt")}}


@app.post("/login")
async def legacy_login(req: LoginRequest):
    """Legacy Telegram bot login — do not use from frontend."""
    if not req.name.strip():
        raise HTTPException(400, "Name required")
    user = await get_or_create_user(req.name.strip(), req.telegram_id)
    return {"user": user}


@app.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(req: ForgotPasswordRequest, request: Request):
    token = await create_reset_token(req.email.strip().lower())
    if token:
        import aiosqlite
        db_path = Path(__file__).parent / "aria.db"
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT name FROM users WHERE LOWER(email) = LOWER(?)", (req.email,)
            ) as c:
                row = await c.fetchone()
                name = row["name"] if row else "there"
        asyncio.create_task(
            send_reset_email(req.email.strip().lower(), name, token)
        )
    # Always 200 — never reveal if email exists
    return {"status": "If that email exists, a reset link has been sent."}


@app.get("/auth/verify-reset-token")
async def check_reset_token(token: str):
    user = await verify_reset_token(token)
    if not user:
        raise HTTPException(400, "Invalid or expired token")
    return {"valid": True, "name": user["name"]}


@app.post("/auth/reset-password")
async def do_reset_password(req: ResetPasswordRequest):
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    success = await reset_password(req.token, req.new_password)
    if not success:
        raise HTTPException(400, "Invalid or expired token")
    return {"status": "Password updated successfully"}


@app.post("/auth/change-password")
async def change_password(req: ChangePasswordRequest):
    user = await get_user_by_id(req.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if not user.get("password_hash"):
        raise HTTPException(400, "No password set")
    if not verify_password(req.current_password, user["password_hash"], user["password_salt"]):
        raise HTTPException(401, "Current password is incorrect")
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    hashed, salt = hash_password(req.new_password)
    import aiosqlite
    db_path = Path(__file__).parent / "aria.db"
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE users SET password_hash=?, password_salt=? WHERE id=?",
            (hashed, salt, req.user_id)
        )
        await db.commit()
    return {"status": "Password updated"}


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/chat")
@limiter.limit("30/minute")
async def chat_endpoint(req: ChatRequest, request: Request):
    if not req.message.strip():
        raise HTTPException(400, "Empty message")
    try:
        response = await chat(req.user_id, req.message, req.mode, req.lang)
        return {"response": response, "mode": req.mode}
    except Exception as e:
        import traceback
        print(f"[chat] ERROR for user {req.user_id}: {e}")
        print(traceback.format_exc())
        raise HTTPException(500, str(e))


# ── Memories ──────────────────────────────────────────────────────────────────

@app.get("/memories/{user_id}")
async def get_memories_endpoint(user_id: int):
    return {"memories": await get_memories(user_id)}


@app.delete("/memories/{memory_id}")
async def delete_memory_endpoint(memory_id: int, user_id: int):
    await delete_memory(memory_id, user_id)
    return {"status": "deleted"}


# ── Tasks ─────────────────────────────────────────────────────────────────────

@app.get("/tasks/{user_id}")
async def get_tasks_endpoint(user_id: int, only_pending: bool = True):
    return {"tasks": await get_tasks(user_id, only_pending)}


@app.post("/tasks")
async def create_task(req: TaskCreate):
    task_id = await add_task(req.user_id, req.title, req.reminder_at)
    return {"task_id": task_id}


@app.post("/tasks/{task_id}/complete")
async def complete_task_endpoint(task_id: int, user_id: int):
    await complete_task(task_id, user_id)
    return {"status": "completed"}


@app.delete("/tasks/{task_id}")
async def delete_task_endpoint(task_id: int, user_id: int):
    await delete_task(task_id, user_id)
    return {"status": "deleted"}


# ── Events ────────────────────────────────────────────────────────────────────

@app.get("/events/{user_id}")
async def get_events_endpoint(user_id: int, date: str = None):
    return {"events": await get_events(user_id, date)}


@app.get("/events/{user_id}/month")
async def get_events_month_endpoint(user_id: int, year: int, month: int):
    return {"events": await get_events_month(user_id, year, month)}


@app.post("/events")
async def create_event(req: EventCreate):
    event_id = await add_event(
        req.user_id, req.title, req.event_date,
        req.event_time, req.description, req.reminder_minutes
    )
    return {"event_id": event_id}


@app.delete("/events/{event_id}")
async def delete_event_endpoint(event_id: int, user_id: int):
    await delete_event(event_id, user_id)
    return {"status": "deleted"}


# ── Google OAuth / Gmail ──────────────────────────────────────────────────────

@app.get("/auth/google/start")
async def google_auth_start(user_id: int):
    return {"url": get_auth_url(user_id)}


@app.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str):
    from fastapi.responses import HTMLResponse
    try:
        user_id = int(state)
        token_data = exchange_code(code)
        gmail_address = await asyncio.get_event_loop().run_in_executor(
            None, get_gmail_address, token_data
        )
        await save_google_token(user_id, token_data, gmail_address)
        return HTMLResponse(content=f"""
        <html><body style="background:#050407;color:#a599ff;font-family:sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh;
          flex-direction:column;gap:12px">
          <div style="font-size:32px">✓</div>
          <div style="font-size:16px">Gmail connected!</div>
          <div style="font-size:12px;opacity:0.5">{gmail_address}</div>
          <script>
            if(window.opener){{
              window.opener.postMessage({{type:'gmail_connected',gmail:'{gmail_address}'}},'*');
              setTimeout(()=>window.close(),1500);
            }} else {{ setTimeout(()=>window.location='/',2000); }}
          </script>
        </body></html>""")
    except Exception as e:
        return HTMLResponse(content=f"""
        <html><body style="background:#050407;color:#f87171;font-family:sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh">
          <div>Connection failed. Please try again.</div>
          <script>setTimeout(()=>window.close(),3000)</script>
        </body></html>""")


@app.get("/auth/google/status")
async def google_auth_status(user_id: int):
    token = await get_google_token(user_id)
    if not token:
        return {"connected": False}
    return {
        "connected": True,
        "gmail_address": token["gmail_address"],
        "digest_time": token["digest_time"],
        "digest_enabled": bool(token["digest_enabled"]),
    }


@app.post("/auth/google/digest-settings")
async def update_digest_settings(user_id: int, digest_time: str, digest_enabled: bool):
    await save_google_digest_settings(user_id, digest_time, digest_enabled)
    return {"status": "saved"}


@app.delete("/auth/google/disconnect")
async def google_disconnect(user_id: int):
    await delete_google_token(user_id)
    return {"status": "disconnected"}


@app.post("/auth/google/test-digest")
async def test_gmail_digest(user_id: int):
    token = await get_google_token(user_id)
    if not token:
        raise HTTPException(404, "No Gmail connected")
    user = await get_user_by_id(user_id)
    if not user or not user.get("email"):
        raise HTTPException(400, "No email address on account")
    try:
        import json
        token_data = (
            json.loads(token["token_data"])
            if isinstance(token["token_data"], str)
            else token["token_data"]
        )
        emails = await asyncio.get_event_loop().run_in_executor(
            None, fetch_todays_emails_oauth, token_data
        )
        summary = await asyncio.get_event_loop().run_in_executor(
            None, summarize_emails, emails, user["name"]
        )
        await send_digest_email(
            user["email"], user["name"], summary, len(emails), token["digest_time"]
        )
        return {"status": "sent", "email_count": len(emails)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/email/fetch")
async def fetch_emails_for_view(user_id: int):
    token = await get_google_token(user_id)
    if not token:
        raise HTTPException(404, "No Gmail connected")
    user = await get_user_by_id(user_id)
    try:
        import json
        token_data = (
            json.loads(token["token_data"])
            if isinstance(token["token_data"], str)
            else token["token_data"]
        )
        emails = await asyncio.get_event_loop().run_in_executor(
            None, fetch_todays_emails_oauth, token_data
        )
        summary = await asyncio.get_event_loop().run_in_executor(
            None, summarize_emails, emails, user["name"]
        )
        return {"emails": emails, "summary": summary, "count": len(emails)}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Telegram linking ──────────────────────────────────────────────────────────

@app.post("/link/generate")
async def generate_link_code(user_id: int):
    code = await create_link_code(user_id)
    return {"code": code}


@app.post("/link/verify")
async def verify_link(code: str, telegram_id: str):
    result = await verify_link_code(code, telegram_id)
    if not result:
        raise HTTPException(400, "Invalid or expired code")
    return {"status": "linked", "user": result}
    


# ── Notes ─────────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    user_id: int
    title: str = "Untitled"
    content: str = ""
    tag: str = "personal"
    color: str = "gold"

class NoteUpdate(BaseModel):
    user_id: int
    title: str
    content: str
    tag: str = "personal"
    color: str = "gold"


@app.get("/notes/{user_id}")
async def get_notes_endpoint(user_id: int):
    return {"notes": await get_notes(user_id)}


@app.post("/notes")
async def create_note(req: NoteCreate):
    note_id = await add_note(req.user_id, req.title, req.content, req.tag, req.color)
    return {"note_id": note_id}


@app.put("/notes/{note_id}")
async def update_note_endpoint(note_id: int, req: NoteUpdate):
    await update_note(note_id, req.user_id, req.title, req.content, req.tag, req.color)
    return {"status": "updated"}


@app.delete("/notes/{note_id}")
async def delete_note_endpoint(note_id: int, user_id: int):
    await delete_note(note_id, user_id)
    return {"status": "deleted"}

@app.post("/chat/file")
async def chat_with_file(
    user_id: int = Form(...),
    mode: str = Form("work"),
    lang: str = Form("en"),
    message: str = Form(""),
    file: UploadFile = File(...),
):
    try:
        file_bytes = await file.read()
        mime_type = file.content_type or ""
        extracted = await extract_text_from_file(file_bytes, file.filename, mime_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if extracted["type"] == "image":
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        user_prompt = message if message.strip() else "Describe this image and extract any useful information."
        try:
            response = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{extracted['mime_type']};base64,{extracted['b64']}"}},
                        {"type": "text", "text": user_prompt}
                    ]
                }]
            )
            aria_response = response.choices[0].message.content
        except Exception:
            aria_response = f"I received your image ({extracted['name']}) but couldn't process it visually."
    else:
        file_context = f"[ATTACHED FILE: {extracted['name']}]\n{extracted['text']}\n[END OF FILE]\n\n"
        user_msg = file_context + (message if message.strip() else "Please analyze this document and give me a summary.")
        aria_response = await chat(user_id, user_msg, mode, lang)

    return {"response": aria_response, "filename": file.filename, "type": extracted["type"]}
