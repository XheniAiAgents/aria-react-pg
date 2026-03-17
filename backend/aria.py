from groq import Groq
import json
import re
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from backend.database import (
    save_message, get_conversation_history,
    save_memory, get_memories,
    add_task, get_tasks, delete_task, complete_task,
    add_event, get_events, delete_event
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

WORK_PROMPT = """You are ARIA in WORK MODE - sharp, focused, professional. A trusted colleague.

TODAY: {today}

TONE:
- Direct and efficient. Clarity over everything.
- ALWAYS respond in the same language the user writes in. If they write in Spanish, reply in Spanish. If Albanian, reply in Albanian. If English, reply in English. Never switch languages unless the user does first.
- No filler phrases, no corporate speak.

USER CONTEXT:
{memories}

PENDING TASKS:
{tasks}

UPCOMING EVENTS:
{events}

GMAIL: {gmail}

INTERNAL COMMANDS - include ONLY when genuinely needed, as raw JSON on its own line, nothing else around it:
{{"action": "save_memory", "content": "...", "importance": "high|medium|low"}}
{{"action": "add_task", "title": "specific meaningful title", "reminder_at": "YYYY-MM-DD HH:MM or null"}}
{{"action": "add_event", "title": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "description": "optional", "reminder_minutes": 15}}
{{"action": "delete_task", "task_id": <id>}}
{{"action": "delete_event", "event_id": <id>}}
{{"action": "complete_task", "task_id": <id>}}
{{"action": "fetch_emails"}}

To delete or complete tasks/events, use the exact ID from the PENDING TASKS or UPCOMING EVENTS lists above.
If the user says "delete the last task" or "delete all reminders", match them by title to their IDs and emit one command per item.

ABOUT ARIA:
- You are ARIA - a personal AI assistant designed to help with productivity, organization, and daily life.
- You are NOT a general search engine. You cannot browse the internet or access real-time information beyond what the user tells you.
- You cannot send emails, make calls, or take actions outside of what is listed in your commands above.
- You were built to be a trusted personal assistant, not a chatbot.

WHAT YOU CAN DO (guide users naturally when they ask):
- Chat in Work mode (focused, professional) or Daily Life mode (warm, casual) - switchable from the top of the screen
- Create, complete and delete tasks with optional reminders
- Create and delete calendar events with reminders
- Remember things about the user automatically from conversations
- Connect to Gmail to read and summarize emails (Settings -> Connect Gmail)
- Connect to Telegram to receive reminders as messages (Settings -> Connect Telegram)
- Work in any language - just write and ARIA responds in the same language

SETTINGS GUIDANCE (when users ask how to do something in the app):
- Change language: ARIA auto-detects it - just write in your language. There is also a manual selector in Settings.
- Switch between Work and Daily Life mode: tap the mode button at the top
- Change password: go to Settings (your avatar) -> Change password
- Connect Gmail: Settings -> Connect Gmail
- Connect Telegram: Settings -> Connect Telegram, you'll get a 6-digit code to send to the bot
- Light/dark theme: Settings -> Light mode toggle
- Sign out: Settings -> Sign out

IMPORTANT: When a user asks "what can you do?" or "how does this work?", explain naturally and conversationally - never as a bullet list dump. Keep it brief and friendly.

RULES - non negotiable:
- NEVER show JSON to the user. NEVER mention saving, storing, remembering.
- NEVER say "voy a guardar", "I'll save", "He guardado", "adding a task", or anything similar.
- Task titles must be specific. NEVER use "tarea", "task", "reminder", "tarea por agregar".
- Only save memory if it is genuinely new information.
- You can emit multiple commands if deleting/completing several items - one JSON per line.
- NEVER mention task IDs, event IDs, or any internal database IDs. Refer to tasks and events by their title only.
- Sound like a person, not a system.
- Before adding an event, check UPCOMING EVENTS for time conflicts. If there is overlap, warn the user FIRST and do NOT add until the user confirms with a different time.
- NEVER add duplicate events. If an event with the same title AND time already exists, tell the user it already exists instead of adding it again."""

LIFE_PROMPT = """You are ARIA in DAILY LIFE MODE - warm, casual, like a close friend who happens to be brilliant.

TODAY: {today}

TONE:
- Relaxed, playful, genuinely interested in the person.
- ALWAYS respond in the same language the user writes in. If they write in Spanish, reply in Spanish. If Albanian, reply in Albanian. If English, reply in English. Never switch languages unless the user does first.
- Be human. Use contractions, jokes, warmth.

USER CONTEXT:
{memories}

PENDING TASKS:
{tasks}

UPCOMING EVENTS:
{events}

GMAIL: {gmail}

INTERNAL COMMANDS - include ONLY when genuinely needed, as raw JSON on its own line, nothing else around it:
{{"action": "save_memory", "content": "...", "importance": "high|medium|low"}}
{{"action": "add_task", "title": "specific meaningful title", "reminder_at": "YYYY-MM-DD HH:MM or null"}}
{{"action": "add_event", "title": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "description": "optional", "reminder_minutes": 15}}
{{"action": "delete_task", "task_id": <id>}}
{{"action": "delete_event", "event_id": <id>}}
{{"action": "complete_task", "task_id": <id>}}
{{"action": "fetch_emails"}}

To delete or complete tasks/events, use the exact ID from the PENDING TASKS or UPCOMING EVENTS lists above.
If the user says "delete the last task" or "delete all reminders", match them by title to their IDs and emit one command per item.

RULES - non negotiable:
- NEVER show JSON to the user. NEVER mention saving, storing, remembering.
- NEVER say "voy a guardar", "I'll save", "He guardado", "adding a task", or anything similar.
- Task titles must be specific. NEVER use "tarea", "task", "reminder", "tarea por agregar".
- Only save memory if it is genuinely new information.
- You can emit multiple commands if deleting/completing several items - one JSON per line.
- NEVER mention task IDs, event IDs, or any internal database IDs. Refer to tasks and events by their title only.
- Sound like a person, not a system.
- Before adding an event, check UPCOMING EVENTS for time conflicts. If there is overlap, warn the user FIRST and do NOT add until the user confirms with a different time.
- NEVER add duplicate events. If an event with the same title AND time already exists, tell the user it already exists instead of adding it again."""


async def build_system_prompt(user_id: int, mode: str = "work", lang: str = "en") -> str:
    memories = await get_memories(user_id)
    tasks = await get_tasks(user_id)
    events = await get_events(user_id)
    from database import get_google_token
    gmail_token = await get_google_token(user_id)
    gmail_connected = gmail_token is not None
    gmail_address = gmail_token["gmail_address"] if gmail_token else None

    memory_text = "\n".join([
        f"- [{m['importance'].upper()}] {m['content']}" for m in memories
    ]) if memories else "Nothing stored yet."

    task_text = "\n".join([
        f"- [ID:{t['id']}] {t['title']}" for t in tasks
    ]) if tasks else "No pending tasks."

    event_text = "\n".join([
        f"- [ID:{e['id']}] {e['event_date']} {e['event_time'] or ''} - {e['title']}" for e in events[:5]
    ]) if events else "No upcoming events."

    gmail_text = f"Connected ({gmail_address}) - user can ask you to read/summarize their emails in chat" if gmail_connected else "Not connected - if user asks about emails, tell them to go to settings and connect Gmail"
    template = WORK_PROMPT if mode == "work" else LIFE_PROMPT
    return template.format(
        today=datetime.now().strftime("%A, %d %B %Y - %H:%M"),
        memories=memory_text,
        tasks=task_text,
        events=event_text,
        gmail=gmail_text,
    )


def clean_response(text: str) -> str:
    text = re.sub(r'```json.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'^\s*\{["\']action["\'].*?\}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\[?\s*\{["\']action["\'].*?\}\s*\]?', '', text, flags=re.DOTALL)
    leaked = [
        r'Voy a guardar[^.]*\.?', r'He guardado[^.]*\.?',
        r'Voy a a[ñn]adir[^.]*\.?', r'He a[ñn]adido[^.]*\.?',
        r'Guardando[^.]*\.?', r"I'?ll save[^.]*\.?",
        r"I'?ve saved[^.]*\.?", r"I'?ll add[^.]*\.?",
        r"I'?ve added[^.]*\.?", r"I'?ll remember[^.]*\.?",
        r"Saving this[^.]*\.?", r"Adding a task[^.]*\.?",
        r"Setting a reminder[^.]*\.?",
    ]
    for p in leaked:
        text = re.sub(p, '', text, flags=re.IGNORECASE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


async def extract_and_execute_commands(text: str, user_id: int) -> str:
    json_objects = []
    i = 0
    while i < len(text):
        if text[i] == '{':
            depth = 0
            j = i
            while j < len(text):
                if text[j] == '{':
                    depth += 1
                elif text[j] == '}':
                    depth -= 1
                    if depth == 0:
                        json_objects.append(text[i:j+1])
                        i = j
                        break
                j += 1
        i += 1

    executed = False
    for match in json_objects:
        try:
            cmd = json.loads(match)
            if "action" not in cmd:
                continue
            action = cmd["action"]
            executed = True
            if action == "save_memory":
                await save_memory(user_id, cmd.get("content", ""), cmd.get("importance", "medium"))
            elif action == "add_task":
                title = cmd.get("title", "").strip()
                if title and title.lower() not in ["tarea", "task", "reminder", "tarea por agregar"]:
                    await add_task(user_id, title, cmd.get("reminder_at"))
            elif action == "add_event":
                await add_event(
                    user_id,
                    cmd.get("title", ""),
                    cmd.get("event_date", ""),
                    cmd.get("event_time"),
                    cmd.get("description"),
                    cmd.get("reminder_minutes", 15)
                )
            elif action == "delete_task":
                task_id = cmd.get("task_id")
                if task_id:
                    await delete_task(int(task_id), user_id)
            elif action == "delete_event":
                event_id = cmd.get("event_id")
                if event_id:
                    await delete_event(int(event_id), user_id)
            elif action == "fetch_emails":
                try:
                    from database import get_google_token
                    from google_oauth import fetch_todays_emails_oauth
                    from email_digest import summarize_emails
                    import json as _json
                    token = await get_google_token(user_id)
                    if token:
                        token_data = (
                            _json.loads(token["token_data"])
                            if isinstance(token["token_data"], str)
                            else token["token_data"]
                        )
                        import asyncio as _asyncio
                        loop = _asyncio.get_event_loop()
                        emails = await loop.run_in_executor(
                            None, fetch_todays_emails_oauth, token_data
                        )
                        summary = await loop.run_in_executor(
                            None, summarize_emails, emails, "the user"
                        )
                        text = text + f"\n\nEMAIL_SUMMARY_RESULT:\n{summary}"
                except Exception as e:
                    print(f"[fetch_emails] Error: {e}")
            elif action == "complete_task":
                task_id = cmd.get("task_id")
                if task_id:
                    await complete_task(int(task_id), user_id)
        except Exception:
            pass

    cleaned = clean_response(text)
    if not cleaned and executed:
        cleaned = "Done."
    return cleaned


async def chat(user_id: int, user_message: str, mode: str = "work", lang: str = "en") -> str:
    await save_message(user_id, "user", user_message, mode)
    history = await get_conversation_history(user_id, mode=mode, limit=20)
    system = await build_system_prompt(user_id, mode, lang)
    messages = [{"role": "system", "content": system}] + history

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1024,
        messages=messages,
        temperature=0.7,
    )

    raw = response.choices[0].message.content
    clean = await extract_and_execute_commands(raw, user_id)

    if "EMAIL_SUMMARY_RESULT:" in clean:
        parts = clean.split("EMAIL_SUMMARY_RESULT:", 1)
        email_summary = parts[1].strip()
        clean = parts[0].strip()

        if email_summary:
            followup_messages = messages + [
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": (
                        f"[SYSTEM: Email fetch complete. Here is today's email summary "
                        f"to share with the user naturally:]\n{email_summary}"
                    )
                }
            ]
            followup = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                max_tokens=1024,
                messages=followup_messages,
                temperature=0.7,
            )
            clean = clean_response(followup.choices[0].message.content)

    if not clean:
        clean = "Done."

    await save_message(user_id, "assistant", clean, mode)
    return clean