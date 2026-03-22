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
from fastapi.responses import FileResponse, HTMLResponse
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
    get_tasks, add_task, complete_task, delete_task, update_task,
    get_events, get_events_month, add_event, delete_event, update_event,
    update_event_google_id, upsert_google_event, delete_events_not_in_google,
    get_pending_reminders, mark_reminder_sent,
    get_task_reminders, clear_task_reminder,
    save_push_subscription, get_push_subscriptions,
    get_all_push_subscriptions_for_users, delete_push_subscription,
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
    save_calendar_token, get_calendar_token, delete_calendar_token,
)
from backend.aria import chat
from backend.database import get_conversation_history
from backend.email_service import send_welcome_email, send_reset_email, send_digest_email
from backend.email_digest import summarize_emails
from backend.google_oauth import get_auth_url, exchange_code, get_gmail_address, fetch_todays_emails_oauth
from backend.google_oauth import get_calendar_auth_url, exchange_calendar_code, get_calendar_account_email
from backend.google_calendar import fetch_google_events, create_google_event, update_google_event, delete_google_event


# ── Rate limiter ──────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


# ── Background tasks ──────────────────────────────────────────────────────────

async def send_web_push(subscription: dict, title: str, body: str):
    """Send a Web Push notification to a single subscription."""
    try:
        from pywebpush import webpush, WebPushException
        vapid_private = os.getenv("VAPID_PRIVATE_KEY", "")
        vapid_email   = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:aria@example.com")
        if not vapid_private:
            return
        endpoint_short = subscription["endpoint"][:60]
        print(f"[push] sending to {endpoint_short}...")
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {
                    "p256dh": subscription["p256dh"],
                    "auth":   subscription["auth"],
                },
            },
            data=json.dumps({"title": title, "body": body, "icon": "/icons/icon-192.png"}),
            vapid_private_key=vapid_private,
            vapid_claims={"sub": vapid_email},
        )
        print(f"[push] sent OK to {endpoint_short}")
    except Exception as wp_err:
        err_str = str(wp_err)
        endpoint = subscription.get("endpoint", "")[:60]
        print(f"[push] ERROR for {endpoint}: {wp_err}")
        # 404/410 means the subscription is gone — clean it up
        if "404" in err_str or "410" in err_str:
            await delete_push_subscription(subscription["endpoint"])


async def reminder_loop():
    """Send Telegram + Web Push reminders for events and tasks every minute."""
    import telegram
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    bot = telegram.Bot(token) if token else None
    print("[reminder] loop started")
    while True:
        try:
            pending_events = await get_pending_reminders()
            pending_tasks  = await get_task_reminders()
            print(f"[reminder] tick: events={len(pending_events)} tasks={len(pending_tasks)}")

            # Collect push subscriptions for all affected users
            push_user_ids = list({e["user_id"] for e in pending_events} |
                                  {t["user_id"] for t in pending_tasks})
            push_subs_by_user: dict[int, list] = {}
            if push_user_ids:
                all_subs = await get_all_push_subscriptions_for_users(push_user_ids)
                print(f"[reminder] user_ids={push_user_ids} push_subs={len(all_subs)}")
                for sub in all_subs:
                    push_subs_by_user.setdefault(sub["user_id"], []).append(sub)

            for event in pending_events:
                title    = f"⏰ {event['title']}"
                time_str = event.get("event_time", "")
                body     = f"Starting at {time_str}" if time_str else "Your event is starting soon"
                print(f"[reminder] event '{event['title']}' user={event['user_id']}")
                # Telegram
                tid = event.get("telegram_id")
                if bot and tid:
                    msg = f"⏰ Reminder: *{event['title']}*"
                    if time_str:
                        msg += f" at {time_str}"
                    msg += "\n\n— ARIA"
                    await bot.send_message(chat_id=tid, text=msg, parse_mode="Markdown")
                # Web Push
                subs = push_subs_by_user.get(event["user_id"], [])
                print(f"[reminder] sending to {len(subs)} push sub(s)")
                for sub in subs:
                    await send_web_push(sub, title, body)
                await mark_reminder_sent(event["id"])

            for task in pending_tasks:
                title = f"📌 {task['title']}"
                body  = "Task reminder from ARIA"
                print(f"[reminder] task '{task['title']}' user={task['user_id']}")
                # Telegram
                tid = task.get("telegram_id")
                if bot and tid:
                    msg = f"📌 Task reminder: *{task['title']}*\n\n— ARIA"
                    await bot.send_message(chat_id=tid, text=msg, parse_mode="Markdown")
                # Web Push
                subs = push_subs_by_user.get(task["user_id"], [])
                print(f"[reminder] sending to {len(subs)} push sub(s)")
                for sub in subs:
                    await send_web_push(sub, title, body)
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
    # Close connection pool on shutdown
    from backend.database import _pool
    if _pool:
        await _pool.close()


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
    user_local_time: str = None  # ISO string from browser e.g. "2026-03-20T17:25:00"

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

class TaskUpdate(BaseModel):
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

class EventUpdate(BaseModel):
    user_id: int
    title: str
    event_date: str
    event_time: Optional[str] = None
    end_time: Optional[str] = None
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


@app.get("/history/{user_id}")
async def get_history(user_id: int, mode: str = "work", limit: int = 30):
    history = await get_conversation_history(user_id, mode=mode, limit=limit)
    return {"messages": history}


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
        user_data = await get_user_by_id(
            (await verify_reset_token(token) or {}).get("id", 0)
        )
        # Get name directly
        from backend.database import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT name FROM users WHERE LOWER(email) = LOWER($1)", req.email
            )
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
    from backend.database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET password_hash=$1, password_salt=$2 WHERE id=$3",
            hashed, salt, req.user_id
        )
    return {"status": "Password updated"}


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/chat")
@limiter.limit("30/minute")
async def chat_endpoint(req: ChatRequest, request: Request):
    if not req.message.strip():
        raise HTTPException(400, "Empty message")
    try:
        response = await chat(req.user_id, req.message, req.mode, req.lang, req.user_local_time)
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


@app.put("/tasks/{task_id}")
async def update_task_endpoint(task_id: int, req: TaskUpdate):
    await update_task(task_id, req.user_id, req.title, req.reminder_at)
    return {"status": "updated"}


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
        req.event_time, req.description, req.reminder_minutes,
        getattr(req, 'end_time', None)
    )
    # Push to Google Calendar if connected
    try:
        token = await get_calendar_token(req.user_id)
        if token:
            import json as _json, asyncio as _asyncio
            token_data = _json.loads(token["token_data"]) if isinstance(token["token_data"], str) else token["token_data"]
            google_id = await _asyncio.get_event_loop().run_in_executor(
                None, create_google_event, token_data,
                req.title, req.event_date, req.event_time,
                getattr(req, 'end_time', None), req.description
            )
            if google_id:
                await update_event_google_id(event_id, google_id)
    except Exception as ex:
        print(f"[events/create] gcal push error: {ex}")
    return {"event_id": event_id}


@app.delete("/events/{event_id}")
async def delete_event_endpoint(event_id: int, user_id: int):
    # Get google_id before deleting
    try:
        events = await get_events(user_id)
        event = next((e for e in events if e["id"] == event_id), None)
        if event and event.get("google_id"):
            token = await get_calendar_token(user_id)
            if token:
                import json as _json, asyncio as _asyncio
                token_data = _json.loads(token["token_data"]) if isinstance(token["token_data"], str) else token["token_data"]
                await _asyncio.get_event_loop().run_in_executor(
                    None, delete_google_event, token_data, event["google_id"]
                )
    except Exception as ex:
        print(f"[events/delete] gcal error: {ex}")
    await delete_event(event_id, user_id)
    return {"status": "deleted"}


@app.put("/events/{event_id}")
async def update_event_endpoint(event_id: int, req: EventUpdate):
    await update_event(event_id, req.user_id, req.title, req.event_date,
                       req.event_time, req.end_time, req.description, req.reminder_minutes)
    # Update in Google Calendar if connected
    try:
        events = await get_events(req.user_id)
        event = next((e for e in events if e["id"] == event_id), None)
        if event and event.get("google_id"):
            token = await get_calendar_token(req.user_id)
            if token:
                import json as _json, asyncio as _asyncio
                token_data = _json.loads(token["token_data"]) if isinstance(token["token_data"], str) else token["token_data"]
                await _asyncio.get_event_loop().run_in_executor(
                    None, update_google_event, token_data, event["google_id"],
                    req.title, req.event_date, req.event_time, req.end_time, req.description
                )
    except Exception as ex:
        print(f"[events/update] gcal error: {ex}")
    return {"status": "updated"}


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


# ── Google Calendar OAuth ─────────────────────────────────────────────────────

@app.get("/auth/google-calendar/start")
async def calendar_auth_start(user_id: int):
    return {"url": get_calendar_auth_url(user_id)}


@app.get("/auth/google-calendar/callback")
async def calendar_auth_callback(code: str, state: str):
    try:
        user_id = int(state)
        token_data = exchange_calendar_code(code)
        calendar_email = get_calendar_account_email(token_data)
        await save_calendar_token(user_id, token_data, calendar_email)
        return HTMLResponse(content=f"""
        <html><body style="background:#050407;color:#e8c96a;font-family:sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh;
          flex-direction:column;gap:12px">
          <div style="font-size:32px">✓</div>
          <div style="font-size:16px">Google Calendar connected!</div>
          <div style="font-size:12px;opacity:0.5">{calendar_email}</div>
          <script>
            if(window.opener){{
              window.opener.postMessage({{type:'calendar_connected',email:'{calendar_email}'}},'*');
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


@app.get("/auth/google-calendar/status")
async def calendar_auth_status(user_id: int):
    token = await get_calendar_token(user_id)
    if not token:
        return {"connected": False}
    return {"connected": True, "calendar_email": token["calendar_email"]}


@app.delete("/auth/google-calendar/disconnect")
async def calendar_disconnect(user_id: int):
    await delete_calendar_token(user_id)
    return {"status": "disconnected"}


# ── Google Calendar Sync ──────────────────────────────────────────────────────

@app.post("/calendar/sync/{user_id}")
async def sync_google_calendar(user_id: int):
    """Pull events from Google Calendar into ARIA's DB."""
    token = await get_calendar_token(user_id)
    if not token:
        return {"synced": 0, "error": "Google Calendar not connected"}
    try:
        import json as _json
        token_data = (
            _json.loads(token["token_data"])
            if isinstance(token["token_data"], str)
            else token["token_data"]
        )
        import asyncio as _asyncio
        google_events = await _asyncio.get_event_loop().run_in_executor(
            None, fetch_google_events, token_data
        )
        google_ids = [e["google_id"] for e in google_events]
        for e in google_events:
            await upsert_google_event(
                user_id, e["google_id"], e["title"],
                e["event_date"], e["event_time"],
                e["end_time"], e["description"]
            )
        await delete_events_not_in_google(user_id, google_ids)
        return {"synced": len(google_events)}
    except Exception as ex:
        print(f"[calendar/sync] error: {ex}")
        return {"synced": 0, "error": str(ex)}


@app.post("/calendar/push/{event_id}")
async def push_event_to_google(event_id: int, user_id: int):
    """Push a single ARIA event to Google Calendar."""
    token = await get_google_token(user_id)
    if not token:
        return {"pushed": False, "error": "Google not connected"}
    try:
        import json as _json
        token_data = (
            _json.loads(token["token_data"])
            if isinstance(token["token_data"], str)
            else token["token_data"]
        )
        events = await get_events(user_id)
        event = next((e for e in events if e["id"] == event_id), None)
        if not event:
            return {"pushed": False, "error": "Event not found"}
        import asyncio as _asyncio
        google_id = await _asyncio.get_event_loop().run_in_executor(
            None, create_google_event, token_data,
            event["title"], event["event_date"],
            event["event_time"], event["end_time"], event["description"]
        )
        if google_id:
            await update_event_google_id(event_id, google_id)
            return {"pushed": True, "google_id": google_id}
        return {"pushed": False, "error": "Google API failed"}
    except Exception as ex:
        return {"pushed": False, "error": str(ex)}


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


# ── Web Push ──────────────────────────────────────────────────────────────────

@app.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Return the VAPID public key so the frontend can subscribe."""
    key = os.getenv("VAPID_PUBLIC_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Push not configured")
    return {"publicKey": key}


class PushSubscribeRequest(BaseModel):
    user_id:  int
    endpoint: str
    p256dh:   str
    auth:     str


@app.post("/push/subscribe")
async def push_subscribe(req: PushSubscribeRequest):
    """Save a browser push subscription for a user."""
    await save_push_subscription(req.user_id, req.endpoint, req.p256dh, req.auth)
    return {"ok": True}



# ── Debug endpoint (temporary) ────────────────────────────────────────────────
@app.get("/debug/tasks/{user_id}")
async def debug_tasks(user_id: int):
    """Show raw reminder_at values vs NOW() for debugging."""
    from backend.database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, title, reminder_at,
               NOW() as now,
               reminder_at::timestamptz <= NOW() as is_due
               FROM tasks WHERE user_id = $1 AND done = 0""",
            user_id
        )
        return [dict(r) for r in rows]


@app.get("/debug/tz")
async def debug_tz():
    """Check PostgreSQL timezone settings."""
    from backend.database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT 
                NOW() as now_utc,
                current_setting('timezone') as pg_timezone,
                '2026-03-22T00:19'::timestamptz as reminder_cast,
                '2026-03-22T00:19'::timestamptz <= NOW() as is_due
        """)
        return [dict(r) for r in rows]


@app.get("/debug/fire-reminders")
async def debug_fire_reminders():
    """Manually trigger reminder check for debugging."""
    from backend.database import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT t.id, t.title, t.reminder_at,
               t.reminder_at::timestamptz as reminder_ts,
               NOW() as now,
               t.reminder_at::timestamptz <= NOW() as is_due
            FROM tasks t
            JOIN users u ON t.user_id = u.id
            WHERE t.done = 0
            AND t.reminder_at IS NOT NULL
        """)
        results = [dict(r) for r in rows]
    
    # Also manually run the reminder fetch
    from backend.database import get_task_reminders, get_all_push_subscriptions_for_users
    tasks = await get_task_reminders()
    user_ids = [t["user_id"] for t in tasks]
    subs = await get_all_push_subscriptions_for_users(user_ids) if user_ids else []
    
    return {
        "raw_tasks": results,
        "reminder_query_found": len(tasks),
        "tasks": [{"id": t["id"], "title": t["title"]} for t in tasks],
        "push_subs": len(subs)
    }
