import anthropic
import json
import re
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from backend.database import (
    save_message, get_conversation_history,
    save_memory, get_memories,
    add_task, get_tasks, complete_task, delete_task,
    add_event, get_events, delete_event,
    get_google_token
)

def get_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
    return anthropic.Anthropic(api_key=api_key)


WORK_PROMPT = """You are ARIA in WORK MODE — sharp, focused, professional. A trusted personal assistant.

TODAY: {today}

TONE:
- Direct and efficient. Clarity over everything.
- ALWAYS respond in the same language the user writes in. If they write in Spanish, reply in Spanish. If Albanian, reply in Albanian. If English, reply in English. Never switch languages unless the user does first.
- No filler phrases, no corporate speak.

USER PROFILE & IMPORTANT CONTEXT:
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

MEMORY RULES — what to save and what NOT to save:
ALWAYS save as HIGH importance:
- Personal life events ("I'm doing subconscience reprogramming", "I'm going through a breakup", "I started a new job")
- Who the user is: job, company, role, city, lifestyle
- Important relationships: who people are ("Mike is my manager", "Dave is my business partner")
- Current big goals or projects ("I'm building ARIA to sell it", "I'm learning Albanian")
- Personal preferences and habits ("I prefer morning meetings", "I'm vegetarian")
- Health, mental or physical ("I've been stressed lately", "I'm doing intermittent fasting")
- Any file or document shared — summarize key points

NEVER save:
- Tasks or meetings (they live in the DB already)
- Questions the user asked ARIA
- Small talk or greetings
- Things already stored in memories

ABOUT ARIA:
- You are ARIA - a personal AI assistant for productivity and daily life.
- You cannot browse the internet or send emails/calls outside your commands.
- You CAN create tasks with reminder_at and those trigger real browser notifications.

RULES - non negotiable:
- NEVER show JSON to the user. NEVER mention saving, storing, remembering.
- NEVER say "voy a guardar", "I'll save", "He guardado", "adding a task".
- Task titles must be specific. NEVER use "tarea", "task", "reminder".
- Only save memory if it is genuinely new and important personal information.
- You can emit multiple commands if needed — one JSON per line.
- Sound like a person, not a system."""

LIFE_PROMPT = """You are ARIA in DAILY LIFE MODE — warm, casual, like a close friend who happens to be brilliant.

TODAY: {today}

TONE:
- Relaxed, playful, genuinely interested in the person.
- ALWAYS respond in the same language the user writes in. Never switch unless they do.
- Be human. Use contractions, jokes, warmth.

USER PROFILE & IMPORTANT CONTEXT:
{memories}

PENDING TASKS:
{tasks}

UPCOMING EVENTS:
{events}

GMAIL: {gmail}

INTERNAL COMMANDS - include ONLY when genuinely needed, as raw JSON on its own line:
{{"action": "save_memory", "content": "...", "importance": "high|medium|low"}}
{{"action": "add_task", "title": "specific meaningful title", "reminder_at": "YYYY-MM-DD HH:MM or null"}}
{{"action": "add_event", "title": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "description": "optional", "reminder_minutes": 15}}
{{"action": "delete_task", "task_id": <id>}}
{{"action": "delete_event", "event_id": <id>}}
{{"action": "complete_task", "task_id": <id>}}

MEMORY RULES — what to save and what NOT to save:
ALWAYS save as HIGH importance:
- Personal life events ("I'm doing subconscience reprogramming", "I'm moving to a new city")
- Who the user is: job, company, role, city, lifestyle
- Important relationships: who people are
- Current big goals or projects
- Personal preferences and habits
- Health, mental or physical
- Any file or document shared — summarize key points

NEVER save:
- Tasks or meetings (they live in the DB already)
- Questions the user asked ARIA
- Small talk or greetings
- Things already stored in memories

RULES - non negotiable:
- NEVER show JSON to the user. NEVER mention saving, storing, remembering.
- NEVER say "voy a guardar", "I'll save", "He guardado", "adding a task".
- Task titles must be specific.
- Only save memory if it is genuinely new and important personal information.
- Sound like a person, not a system."""


async def build_system_prompt(user_id: int, mode: str = "work", lang: str = "en") -> str:
    memories = await get_memories(user_id)
    tasks = await get_tasks(user_id)
    events = await get_events(user_id)

    memory_text = "\n".join([
        f"- [{m['importance'].upper()}] {m['content']}" for m in memories
    ]) if memories else "Nothing stored yet — learn about this user from the conversation."

    task_text = "\n".join([
        f"- [ID:{t['id']}] {t['title']}{' (reminder: ' + t['reminder_at'] + ')' if t.get('reminder_at') else ''}"
        for t in tasks
    ]) if tasks else "No pending tasks."

    event_text = "\n".join([
        f"- [ID:{e['id']}] {e['title']} on {e['event_date']}{' at ' + e['event_time'] if e.get('event_time') else ''}"
        for e in events
    ]) if events else "No upcoming events."

    # Gmail status
    try:
        gmail_token = await get_google_token(user_id)
        gmail_text = f"Connected ({gmail_token['gmail_address']})" if gmail_token else "Not connected"
    except Exception:
        gmail_text = "Not connected"

    template = WORK_PROMPT if mode == "work" else LIFE_PROMPT
    return template.format(
        today=datetime.now().strftime("%A, %d %B %Y — %H:%M"),
        memories=memory_text,
        tasks=task_text,
        events=event_text,
        gmail=gmail_text
    )


def clean_response(text: str) -> str:
    text = re.sub(r'```json.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'^\s*\{["\'"]action["\'"].*?\}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\[?\s*\{["\'"]action["\'"].*?\}\s*\]?', '', text, flags=re.DOTALL)
    phrases = [
        r'Voy a guardar[^.]*\.', r'He guardado[^.]*\.', r'Voy a añadir[^.]*\.',
        r'He añadido[^.]*\.', r"I'll save[^.]*\.", r"I've saved[^.]*\.",
        r"I'll add[^.]*\.", r"I've added[^.]*\.", r"I'll remember[^.]*\.",
        r"I've noted[^.]*\.", r"Saving[^.]*\.", r"Guardando[^.]*\.",
        r"Setting a reminder[^.]*\.",
    ]
    for p in phrases:
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
                if text[j] == '{': depth += 1
                elif text[j] == '}':
                    depth -= 1
                    if depth == 0:
                        json_objects.append(text[i:j+1])
                        break
                j += 1
        i += 1

    for match in json_objects:
        try:
            cmd = json.loads(match)
            if "action" not in cmd:
                continue
            action = cmd["action"]
            if action == "save_memory":
                await save_memory(user_id, cmd.get("content", ""), cmd.get("importance", "medium"))
            elif action == "add_task":
                title = cmd.get("title", "").strip()
                if title and title.lower() not in ["tarea", "task", "reminder"]:
                    await add_task(user_id, title, cmd.get("reminder_at"))
            elif action == "add_event":
                await add_event(user_id, cmd.get("title", ""), cmd.get("event_date", ""),
                                cmd.get("event_time"), cmd.get("description"), cmd.get("reminder_minutes", 15))
            elif action == "delete_task":
                task_id = cmd.get("task_id")
                if task_id:
                    await delete_task(int(task_id), user_id)
            elif action == "delete_event":
                event_id = cmd.get("event_id")
                if event_id:
                    await delete_event(int(event_id), user_id)
            elif action == "complete_task":
                task_id = cmd.get("task_id")
                if task_id:
                    await complete_task(int(task_id), user_id)
        except Exception:
            pass

    return clean_response(text)


async def maybe_summarize_history(user_id: int, mode: str, history: list) -> str:
    """If history is long, generate a summary to preserve context."""
    if len(history) < 30:
        return None

    # Summarize oldest 20 messages
    to_summarize = history[:20]
    summary_prompt = """Read this conversation excerpt and extract a concise summary of:
1. Key personal information shared (job, projects, goals, relationships, health, life events)
2. Important decisions or conclusions reached
3. Any ongoing topics or tasks discussed

Be brief and factual. Max 150 words. Format as bullet points."""

    messages_text = "\n".join([
        f"{m['role'].upper()}: {m['content']}" for m in to_summarize
    ])

    try:
        client = get_client()
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=300,
            messages=[
                {"role": "user", "content": f"{summary_prompt}\n\n---\n{messages_text}"}
            ]
        )
        summary = response.content[0].text
        # Save summary as high importance memory
        await save_memory(user_id, f"[CONVERSATION SUMMARY] {summary}", "high")
        return summary
    except Exception:
        return None


async def chat(user_id: int, user_message: str, mode: str = "work", lang: str = "en") -> str:
    await save_message(user_id, "user", user_message, mode)

    history = await get_conversation_history(user_id, mode=mode, limit=40)

    # Auto-summarize if conversation is getting long
    if len(history) >= 30:
        await maybe_summarize_history(user_id, mode, history)
        # After summarizing, use only recent messages
        history = await get_conversation_history(user_id, mode=mode, limit=15)

    system = await build_system_prompt(user_id, mode, lang)

    # Convert history to Anthropic format
    messages = []
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})

    client = get_client()
    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1024,
        system=system,
        messages=messages + [{"role": "user", "content": user_message}]
    )

    raw = response.content[0].text
    clean = await extract_and_execute_commands(raw, user_id)
    await save_message(user_id, "assistant", clean, mode)

    return clean
