"""
ARIA v4 — Web Push router
"""
import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.database import save_push_subscription, get_pool
from backend.routers.jwt_auth import get_current_user

router = APIRouter()


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh:   str
    auth:     str


@router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Return the VAPID public key so the frontend can subscribe."""
    key = os.getenv("VAPID_PUBLIC_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Push not configured")
    return {"publicKey": key}


@router.post("/push/subscribe")
async def push_subscribe(req: PushSubscribeRequest, current_user: dict = Depends(get_current_user)):
    """Save a browser push subscription for a user."""
    user_id = int(current_user['sub'])
    await save_push_subscription(user_id, req.endpoint, req.p256dh, req.auth)
    return {"ok": True}


@router.delete("/push/subscriptions/{user_id}")
async def clear_push_subscriptions(user_id: int):
    """Clear all push subscriptions for a user so they can re-subscribe."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM push_subscriptions WHERE user_id = $1", user_id)
    return {"ok": True, "message": "Subscriptions cleared"}
