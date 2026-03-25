"""
ARIA v4 — User router (JWT protected)
"""
from fastapi import APIRouter, HTTPException, Depends
from backend.database import update_user_timezone, get_user_timezone, create_link_code, verify_link_code
from backend.routers.jwt_auth import get_current_user

router = APIRouter()


@router.post("/user/timezone")
async def set_user_timezone(timezone: str, current_user: dict = Depends(get_current_user)):
    import zoneinfo
    try:
        zoneinfo.ZoneInfo(timezone)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {timezone}")
    user_id = int(current_user["sub"])
    await update_user_timezone(user_id, timezone)
    return {"status": "ok", "timezone": timezone}


@router.get("/user/timezone")
async def get_timezone(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    tz = await get_user_timezone(user_id)
    return {"timezone": tz}


@router.post("/link/generate")
async def generate_link_code(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    code = await create_link_code(user_id)
    return {"code": code}


@router.post("/link/verify")
async def verify_link(code: str, telegram_id: str):
    result = await verify_link_code(code, telegram_id)
    if not result:
        raise HTTPException(400, "Invalid or expired code")
    return {"status": "linked", "user": result}
