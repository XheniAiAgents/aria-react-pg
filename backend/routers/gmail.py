"""
ARIA v4 — Gmail router
Routes: /auth/google/* (OAuth + digest settings), /email/fetch
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import List, Optional
from fastapi.responses import HTMLResponse

from backend.routers.jwt_auth import get_current_user
from backend.database import (
    get_user_by_id,
    save_google_token, get_google_token, delete_google_token,
    save_google_digest_settings,
)
from backend.email_service import send_digest_email
from backend.email_digest import summarize_emails
from backend.google_oauth import (
    get_auth_url, exchange_code, get_gmail_address, fetch_todays_emails_oauth,
    send_email_oauth,
)
from pydantic import BaseModel


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    thread_id: str = None
    in_reply_to: str = None

router = APIRouter()


def _parse_token(raw) -> dict:
    return json.loads(raw) if isinstance(raw, str) else raw


# ── OAuth ─────────────────────────────────────────────────────────────────────

@router.get("/auth/google/start")
async def google_auth_start(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user['sub'])
    return {"url": get_auth_url(user_id)}


@router.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str):
    try:
        user_id       = int(state)
        token_data    = exchange_code(code)
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
    except Exception:
        return HTMLResponse(content="""
        <html><body style="background:#050407;color:#f87171;font-family:sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh">
          <div>Connection failed. Please try again.</div>
          <script>setTimeout(()=>window.close(),3000)</script>
        </body></html>""")


@router.get("/auth/google/status")
async def google_auth_status(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user['sub'])
    token = await get_google_token(user_id)
    if not token:
        return {"connected": False}
    return {
        "connected":       True,
        "gmail_address":   token["gmail_address"],
        "digest_time":     token["digest_time"],
        "digest_enabled":  bool(token["digest_enabled"]),
    }


@router.post("/auth/google/digest-settings")
async def update_digest_settings(digest_time: str, digest_enabled: bool, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user['sub'])
    await save_google_digest_settings(user_id, digest_time, digest_enabled)
    return {"status": "saved"}


@router.delete("/auth/google/disconnect")
async def google_disconnect(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user['sub'])
    await delete_google_token(user_id)
    return {"status": "disconnected"}


# ── Digest ────────────────────────────────────────────────────────────────────

@router.post("/auth/google/test-digest")
async def test_gmail_digest(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user['sub'])
    token = await get_google_token(user_id)
    if not token:
        raise HTTPException(404, "No Gmail connected")
    user = await get_user_by_id(user_id)
    if not user or not user.get("email"):
        raise HTTPException(400, "No email address on account")
    try:
        token_data = _parse_token(token["token_data"])
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


# ── Email view ────────────────────────────────────────────────────────────────

@router.get("/email/fetch")
async def fetch_emails_for_view(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user['sub'])
    token = await get_google_token(user_id)
    if not token:
        raise HTTPException(404, "No Gmail connected")
    user = await get_user_by_id(user_id)
    try:
        token_data = _parse_token(token["token_data"])
        emails = await asyncio.get_event_loop().run_in_executor(
            None, fetch_todays_emails_oauth, token_data
        )
        summary = await asyncio.get_event_loop().run_in_executor(
            None, summarize_emails, emails, user["name"]
        )
        return {"emails": emails, "summary": summary, "count": len(emails)}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Send email ────────────────────────────────────────────────────────────────

@router.post("/email/send")
async def send_email(
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    thread_id: Optional[str] = Form(None),
    in_reply_to: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    current_user: dict = Depends(get_current_user)
):
    user_id = int(current_user['sub'])
    token = await get_google_token(user_id)
    if not token:
        raise HTTPException(404, "No Gmail connected")
    try:
        token_data = _parse_token(token["token_data"])
        attachments = []
        for f in (files or []):
            if f.filename:
                data = await f.read()
                print(f"[email/send] attachment: {f.filename}, size: {len(data)}")
                attachments.append({"filename": f.filename, "data": data})
        print(f"[email/send] total attachments: {len(attachments)}")
        result = await asyncio.get_event_loop().run_in_executor(
            None, send_email_oauth, token_data, to, subject, body, thread_id, in_reply_to, attachments or None
        )
        return {"status": "sent", "id": result.get("id")}
    except Exception as e:
        raise HTTPException(500, str(e))
