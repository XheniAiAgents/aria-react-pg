"""
ARIA — Background loops (reminders & email digests)
"""
import asyncio
import os
from backend.database import (
    get_pending_reminders, mark_reminder_sent,
    get_task_reminders, clear_task_reminder,
    get_all_push_subscriptions_for_users,
    get_users_due_for_gmail_digest,
    cleanup_old_data,
)
from backend.email_service import send_digest_email
from backend.email_digest import summarize_emails
from backend.google_oauth import fetch_todays_emails_oauth
from backend.utils.notifications import send_web_push


def pick_event_emoji(title: str) -> str:
    t = title.lower()
    if any(k in t for k in ["meeting", "call", "zoom", "teams", "interview", "presentation", "review"]):
        return "🤝"
    if any(k in t for k in ["email", "report", "deadline"]):
        return "📋"
    if any(k in t for k in ["office", "work"]):
        return "💼"
    if any(k in t for k in ["doctor", "physician", "checkup", "hospital"]):
        return "🏥"
    if any(k in t for k in ["dentist"]):
        return "🦷"
    if any(k in t for k in ["gym", "workout", "training", "exercise", "run", "yoga", "pilates"]):
        return "💪"
    if any(k in t for k in ["pharmacy", "medicine"]):
        return "💊"
    if any(k in t for k in ["therapy", "therapist"]):
        return "🧠"
    if any(k in t for k in ["lunch", "dinner", "breakfast", "brunch", "eat", "restaurant"]):
        return "🍽️"
    if any(k in t for k in ["coffee", "cafe"]):
        return "☕"
    if any(k in t for k in ["drinks", "bar"]):
        return "🍷"
    if any(k in t for k in ["party", "birthday", "celebration"]):
        return "🎂"
    if any(k in t for k in ["flight", "airport", "plane"]):
        return "✈️"
    if any(k in t for k in ["train"]):
        return "🚂"
    if any(k in t for k in ["hotel"]):
        return "🏨"
    if any(k in t for k in ["trip", "travel", "vacation", "holiday"]):
        return "🧳"
    if any(k in t for k in ["shopping", "groceries", "supermarket"]):
        return "🛒"
    if any(k in t for k in ["haircut", "salon", "barber"]):
        return "✂️"
    if any(k in t for k in ["bank"]):
        return "🏦"
    if any(k in t for k in ["school", "class", "course", "lecture", "university"]):
        return "📚"
    if any(k in t for k in ["phone", "call mom", "call dad", "call parents"]):
        return "📞"
    return "✨"


async def reminder_loop():
    """Send Telegram + Web Push reminders for events and tasks every minute."""
    import telegram
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    bot   = telegram.Bot(token) if token else None
    print("[reminder] loop started")

    while True:
        try:
            pending_events = await get_pending_reminders()
            pending_tasks  = await get_task_reminders()
            print(f"[reminder] tick: events={len(pending_events)} tasks={len(pending_tasks)}")

            push_user_ids = list(
                {e["user_id"] for e in pending_events} |
                {t["user_id"] for t in pending_tasks}
            )
            push_subs_by_user: dict[int, list] = {}
            if push_user_ids:
                all_subs = await get_all_push_subscriptions_for_users(push_user_ids)
                print(f"[reminder] user_ids={push_user_ids} push_subs={len(all_subs)}")
                for sub in all_subs:
                    push_subs_by_user.setdefault(sub["user_id"], []).append(sub)

            for event in pending_events:
                emoji    = pick_event_emoji(event["title"])
                title    = f"{emoji} {event['title']}"
                time_str = event.get("event_time", "")
                body     = f"Starting at {time_str}" if time_str else "Your event is starting soon"
                print(f"[reminder] event '{event['title']}' user={event['user_id']}")

                tid = event.get("telegram_id")
                if bot and tid:
                    msg = f"{emoji} Reminder: *{event['title']}*"
                    if time_str:
                        msg += f" at {time_str}"
                    msg += "\n\n— ARIA"
                    await bot.send_message(chat_id=tid, text=msg, parse_mode="Markdown")

                for sub in push_subs_by_user.get(event["user_id"], []):
                    await send_web_push(sub, title, body)
                await mark_reminder_sent(event["id"])

            for task in pending_tasks:
                title = f"🔔 {task['title']}"
                body  = "— ARIA"
                print(f"[reminder] task '{task['title']}' user={task['user_id']}")

                tid = task.get("telegram_id")
                if bot and tid:
                    msg = f"🔔 Task reminder: *{task['title']}*\n\n— ARIA"
                    await bot.send_message(chat_id=tid, text=msg, parse_mode="Markdown")

                for sub in push_subs_by_user.get(task["user_id"], []):
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
