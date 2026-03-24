"""
ARIA v4 — Events router
Covers: CRUD events + Google Calendar sync/push
"""
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.database import (
    get_events, get_events_month, add_event, delete_event, update_event,
    update_event_google_id, upsert_google_event, delete_events_not_in_google,
    get_calendar_token, get_google_token,
)
from backend.google_calendar import (
    fetch_google_events, create_google_event, update_google_event, delete_google_event,
)

router = APIRouter()


class EventCreate(BaseModel):
    user_id: int
    title: str
    event_date: str
    event_time: Optional[str] = None
    end_time: Optional[str] = None
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


@router.get("/events/{user_id}")
async def get_events_endpoint(user_id: int, date: str = None):
    return {"events": await get_events(user_id, date)}


@router.get("/events/{user_id}/month")
async def get_events_month_endpoint(user_id: int, year: int, month: int):
    return {"events": await get_events_month(user_id, year, month)}


@router.post("/events")
async def create_event(req: EventCreate):
    event_id = await add_event(
        req.user_id, req.title, req.event_date,
        req.event_time, req.description, req.reminder_minutes,
        req.end_time
    )
    # Push to Google Calendar if connected
    try:
        token = await get_calendar_token(req.user_id)
        if token:
            import json
            token_data = json.loads(token["token_data"]) if isinstance(token["token_data"], str) else token["token_data"]
            google_id = await asyncio.get_event_loop().run_in_executor(
                None, create_google_event, token_data,
                req.title, req.event_date, req.event_time, req.end_time, req.description
            )
            if google_id:
                await update_event_google_id(event_id, google_id)
    except Exception as ex:
        print(f"[events/create] gcal push error: {ex}")
    return {"event_id": event_id}


@router.delete("/events/{event_id}")
async def delete_event_endpoint(event_id: int, user_id: int):
    try:
        events = await get_events(user_id)
        event = next((e for e in events if e["id"] == event_id), None)
        if event and event.get("google_id"):
            token = await get_calendar_token(user_id)
            if token:
                import json
                token_data = json.loads(token["token_data"]) if isinstance(token["token_data"], str) else token["token_data"]
                await asyncio.get_event_loop().run_in_executor(
                    None, delete_google_event, token_data, event["google_id"]
                )
    except Exception as ex:
        print(f"[events/delete] gcal error: {ex}")
    await delete_event(event_id, user_id)
    return {"status": "deleted"}


@router.put("/events/{event_id}")
async def update_event_endpoint(event_id: int, req: EventUpdate):
    await update_event(event_id, req.user_id, req.title, req.event_date,
                       req.event_time, req.end_time, req.description, req.reminder_minutes)
    try:
        events = await get_events(req.user_id)
        event = next((e for e in events if e["id"] == event_id), None)
        if event and event.get("google_id"):
            token = await get_calendar_token(req.user_id)
            if token:
                import json
                token_data = json.loads(token["token_data"]) if isinstance(token["token_data"], str) else token["token_data"]
                await asyncio.get_event_loop().run_in_executor(
                    None, update_google_event, token_data, event["google_id"],
                    req.title, req.event_date, req.event_time, req.end_time, req.description
                )
    except Exception as ex:
        print(f"[events/update] gcal error: {ex}")
    return {"status": "updated"}


@router.post("/calendar/sync/{user_id}")
async def sync_google_calendar(user_id: int):
    """Pull events from Google Calendar into ARIA's DB."""
    token = await get_calendar_token(user_id)
    if not token:
        return {"synced": 0, "error": "Google Calendar not connected"}
    try:
        import json
        token_data = (
            json.loads(token["token_data"])
            if isinstance(token["token_data"], str)
            else token["token_data"]
        )
        google_events = await asyncio.get_event_loop().run_in_executor(
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


@router.post("/calendar/push/{event_id}")
async def push_event_to_google(event_id: int, user_id: int):
    """Push a single ARIA event to Google Calendar."""
    token = await get_google_token(user_id)
    if not token:
        return {"pushed": False, "error": "Google not connected"}
    try:
        import json
        token_data = (
            json.loads(token["token_data"])
            if isinstance(token["token_data"], str)
            else token["token_data"]
        )
        events = await get_events(user_id)
        event = next((e for e in events if e["id"] == event_id), None)
        if not event:
            return {"pushed": False, "error": "Event not found"}
        google_id = await asyncio.get_event_loop().run_in_executor(
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
