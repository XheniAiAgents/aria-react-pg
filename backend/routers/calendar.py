"""
ARIA v4 — Google Calendar router
Routes: /auth/google-calendar/* (OAuth), /calendar/sync, /calendar/push
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from backend.database import (
    get_calendar_token, save_calendar_token, delete_calendar_token,
    get_events,
    update_event_google_id, upsert_google_event, delete_events_not_in_google,
)
from backend.google_oauth import (
    get_calendar_auth_url, exchange_calendar_code, get_calendar_account_email,
)
from backend.google_calendar import (
    fetch_google_events, create_google_event, update_google_event, delete_google_event,
)

router = APIRouter()


def _parse_token(raw) -> dict:
    return json.loads(raw) if isinstance(raw, str) else raw


# ── OAuth ─────────────────────────────────────────────────────────────────────

@router.get("/auth/google-calendar/start")
async def calendar_auth_start(user_id: int):
    return {"url": get_calendar_auth_url(user_id)}


@router.get("/auth/google-calendar/callback")
async def calendar_auth_callback(code: str, state: str):
    try:
        user_id        = int(state)
        token_data     = exchange_calendar_code(code)
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
    except Exception:
        return HTMLResponse(content="""
        <html><body style="background:#050407;color:#f87171;font-family:sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh">
          <div>Connection failed. Please try again.</div>
          <script>setTimeout(()=>window.close(),3000)</script>
        </body></html>""")


@router.get("/auth/google-calendar/status")
async def calendar_auth_status(user_id: int):
    token = await get_calendar_token(user_id)
    if not token:
        return {"connected": False}
    return {"connected": True, "calendar_email": token["calendar_email"]}


@router.delete("/auth/google-calendar/disconnect")
async def calendar_disconnect(user_id: int):
    await delete_calendar_token(user_id)
    return {"status": "disconnected"}


# ── Sync ──────────────────────────────────────────────────────────────────────

@router.post("/calendar/sync/{user_id}")
async def sync_google_calendar(user_id: int):
    """Pull events from Google Calendar into ARIA's DB."""
    token = await get_calendar_token(user_id)
    if not token:
        return {"synced": 0, "error": "Google Calendar not connected"}
    try:
        token_data    = _parse_token(token["token_data"])
        google_events = await asyncio.get_event_loop().run_in_executor(
            None, fetch_google_events, token_data
        )
        google_ids = [e["google_id"] for e in google_events]
        for e in google_events:
            await upsert_google_event(
                user_id, e["google_id"], e["title"],
                e["event_date"], e["event_time"],
                e["end_time"], e["description"],
            )
        await delete_events_not_in_google(user_id, google_ids)
        return {"synced": len(google_events)}
    except Exception as ex:
        print(f"[calendar/sync] error: {ex}")
        return {"synced": 0, "error": str(ex)}


@router.post("/calendar/push/{event_id}")
async def push_event_to_google(event_id: int, user_id: int):
    """Push a single ARIA event to Google Calendar."""
    token = await get_calendar_token(user_id)
    if not token:
        return {"pushed": False, "error": "Google Calendar not connected"}
    try:
        token_data = _parse_token(token["token_data"])
        events = await get_events(user_id)
        event  = next((e for e in events if e["id"] == event_id), None)
        if not event:
            return {"pushed": False, "error": "Event not found"}
        google_id = await asyncio.get_event_loop().run_in_executor(
            None, create_google_event, token_data,
            event["title"], event["event_date"],
            event["event_time"], event["end_time"], event["description"],
        )
        if google_id:
            await update_event_google_id(event_id, google_id)
            return {"pushed": True, "google_id": google_id}
        return {"pushed": False, "error": "Google API failed"}
    except Exception as ex:
        return {"pushed": False, "error": str(ex)}
