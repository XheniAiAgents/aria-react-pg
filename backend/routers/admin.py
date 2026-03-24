"""
ARIA v4 — Admin router
"""
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.database import (
    admin_get_all_users, admin_toggle_user, admin_delete_user, admin_get_stats,
)

router = APIRouter()


def _check_admin(password: str):
    admin_pw = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_pw or password != admin_pw:
        raise HTTPException(status_code=401, detail="Invalid admin password")


@router.get("/admin")
async def admin_page():
    admin_path = os.path.join(os.path.dirname(__file__), "..", "admin.html")
    if not os.path.exists(admin_path):
        admin_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "admin.html")
    if os.path.exists(admin_path):
        return FileResponse(admin_path)
    raise HTTPException(status_code=404, detail="Admin page not found")


@router.get("/admin/stats")
async def admin_stats(password: str):
    _check_admin(password)
    return await admin_get_stats()


@router.get("/admin/users")
async def admin_users(password: str):
    _check_admin(password)
    users = await admin_get_all_users()
    return [
        {
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "timezone": u.get("timezone", "Europe/Madrid"),
            "is_disabled": u.get("is_disabled", False),
            "task_count": u.get("task_count", 0),
            "event_count": u.get("event_count", 0),
            "note_count": u.get("note_count", 0),
            "message_count": u.get("message_count", 0),
            "push_count": u.get("push_count", 0),
            "created_at": str(u["created_at"])[:10] if u.get("created_at") else None,
            "last_active": str(u["last_active"])[:16].replace("T", " ") if u.get("last_active") else "Never",
        }
        for u in users
    ]


@router.post("/admin/users/{user_id}/toggle")
async def admin_toggle(user_id: int, password: str, disabled: bool):
    _check_admin(password)
    await admin_toggle_user(user_id, disabled)
    return {"status": "ok"}


@router.delete("/admin/users/{user_id}")
async def admin_delete(user_id: int, password: str):
    _check_admin(password)
    await admin_delete_user(user_id)
    return {"status": "deleted"}
