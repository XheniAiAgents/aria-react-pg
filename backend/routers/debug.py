"""
ARIA v4 — Debug router (temporary endpoints, remove before production hardening)
"""
from fastapi import APIRouter
from backend.database import get_pool, get_task_reminders, get_all_push_subscriptions_for_users

router = APIRouter()


@router.get("/debug/tasks/{user_id}")
async def debug_tasks(user_id: int):
    """Show raw reminder_at values vs NOW() for debugging."""
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


@router.get("/debug/tz")
async def debug_tz():
    """Check PostgreSQL timezone settings."""
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


@router.get("/debug/fire-reminders")
async def debug_fire_reminders():
    """Manually trigger reminder check for debugging."""
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

    tasks = await get_task_reminders()
    user_ids = [t["user_id"] for t in tasks]
    subs = await get_all_push_subscriptions_for_users(user_ids) if user_ids else []

    return {
        "raw_tasks": results,
        "reminder_query_found": len(tasks),
        "tasks": [{"id": t["id"], "title": t["title"]} for t in tasks],
        "push_subs": len(subs)
    }
