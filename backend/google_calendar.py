"""
ARIA — Google Calendar integration
Handles bidirectional sync between ARIA's DB and Google Calendar.
"""

import requests
from datetime import datetime, date, timedelta
from backend.google_oauth import get_access_token


CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"


def get_headers(token_data: dict) -> dict:
    access_token = get_access_token(token_data)
    return {"Authorization": f"Bearer {access_token}"}


def fetch_google_events(token_data: dict, days_ahead: int = 60) -> list[dict]:
    """Fetch upcoming events from Google Calendar."""
    now = datetime.utcnow().isoformat() + "Z"
    future = (datetime.utcnow() + timedelta(days=days_ahead)).isoformat() + "Z"

    resp = requests.get(
        f"{CALENDAR_BASE}/calendars/primary/events",
        headers=get_headers(token_data),
        params={
            "timeMin": now,
            "timeMax": future,
            "singleEvents": True,
            "orderBy": "startTime",
            "maxResults": 100,
        }
    )
    if not resp.ok:
        print(f"[gcal] fetch error: {resp.status_code} {resp.text}")
        return []

    items = resp.json().get("items", [])
    events = []
    for item in items:
        start = item.get("start", {})
        end = item.get("end", {})

        # Handle all-day events (date) vs timed events (dateTime)
        if "dateTime" in start:
            start_dt = datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
            event_date = start_dt.strftime("%Y-%m-%d")
            event_time = start_dt.strftime("%H:%M")
        else:
            event_date = start.get("date", "")
            event_time = None

        if "dateTime" in end:
            end_dt = datetime.fromisoformat(end["dateTime"].replace("Z", "+00:00"))
            end_time = end_dt.strftime("%H:%M")
        else:
            end_time = None

        events.append({
            "google_id": item.get("id", ""),
            "title": item.get("summary", "(No title)"),
            "description": item.get("description", ""),
            "event_date": event_date,
            "event_time": event_time,
            "end_time": end_time,
        })

    return events


def create_google_event(token_data: dict, title: str, event_date: str,
                         event_time: str = None, end_time: str = None,
                         description: str = None) -> str | None:
    """Create an event in Google Calendar. Returns the Google event ID."""
    if event_time:
        # Timed event
        start_iso = f"{event_date}T{event_time}:00"
        if end_time:
            end_iso = f"{event_date}T{end_time}:00"
        else:
            # Default 1 hour duration
            start_dt = datetime.fromisoformat(start_iso)
            end_iso = (start_dt + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S")
        body = {
            "summary": title,
            "description": description or "",
            "start": {"dateTime": start_iso, "timeZone": "Europe/Madrid"},
            "end": {"dateTime": end_iso, "timeZone": "Europe/Madrid"},
        }
    else:
        # All-day event
        body = {
            "summary": title,
            "description": description or "",
            "start": {"date": event_date},
            "end": {"date": event_date},
        }

    resp = requests.post(
        f"{CALENDAR_BASE}/calendars/primary/events",
        headers={**get_headers(token_data), "Content-Type": "application/json"},
        json=body
    )
    if resp.ok:
        return resp.json().get("id")
    print(f"[gcal] create error: {resp.status_code} {resp.text}")
    return None


def update_google_event(token_data: dict, google_id: str, title: str,
                         event_date: str, event_time: str = None,
                         end_time: str = None, description: str = None) -> bool:
    """Update an existing Google Calendar event."""
    if event_time:
        start_iso = f"{event_date}T{event_time}:00"
        if end_time:
            end_iso = f"{event_date}T{end_time}:00"
        else:
            start_dt = datetime.fromisoformat(start_iso)
            end_iso = (start_dt + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S")
        body = {
            "summary": title,
            "description": description or "",
            "start": {"dateTime": start_iso, "timeZone": "Europe/Madrid"},
            "end": {"dateTime": end_iso, "timeZone": "Europe/Madrid"},
        }
    else:
        body = {
            "summary": title,
            "description": description or "",
            "start": {"date": event_date},
            "end": {"date": event_date},
        }

    resp = requests.patch(
        f"{CALENDAR_BASE}/calendars/primary/events/{google_id}",
        headers={**get_headers(token_data), "Content-Type": "application/json"},
        json=body
    )
    return resp.ok


def delete_google_event(token_data: dict, google_id: str) -> bool:
    """Delete an event from Google Calendar."""
    resp = requests.delete(
        f"{CALENDAR_BASE}/calendars/primary/events/{google_id}",
        headers=get_headers(token_data)
    )
    return resp.ok or resp.status_code == 410  # 410 = already deleted
