"""
ARIA v4 — User router
Covers: timezone, Telegram link codes
"""
from fastapi import APIRouter, HTTPException
from backend.database import (
    update_user_timezone, get_user_timezone,
    create_link_code, verify_link_code,
)

router = APIRouter()


@router.post("/user/timezone")
async def set_user_timezone(user_id: int, timezone: str):
    """Update user's timezone preference."""
    import zoneinfo
    try:
        zoneinfo.ZoneInfo(timezone)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {timezone}")
    await update_user_timezone(user_id, timezone)
    return {"status": "ok", "timezone": timezone}


@router.get("/user/timezone")
async def get_timezone(user_id: int):
    tz = await get_user_timezone(user_id)
    return {"timezone": tz}


@router.post("/link/generate")
async def generate_link_code(user_id: int):
    code = await create_link_code(user_id)
    return {"code": code}


@router.post("/link/verify")
async def verify_link(code: str, telegram_id: str):
    result = await verify_link_code(code, telegram_id)
    if not result:
        raise HTTPException(400, "Invalid or expired code")
    return {"status": "linked", "user": result}
