"""
ARIA v4 — LLM Router
- Llama 3.3 70b (Groq): fast responses, simple chat, actions
- Claude Sonnet (Anthropic): complex reasoning, email analysis, planning, prioritization
"""
from groq import Groq
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
    add_event, get_events, delete_event, update_event,
    get_google_token
)

# ── Clients ───────────────────────────────────────────────────────────────────

def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")
    return Groq(api_key=api_key)

def get_anthropic_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=api_key)


# ── Prompts ───────────────────────────────────────────────────────────────────

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

GMAIL STATUS: {gmail}
- If Gmail is Connected: you CAN read the user's emails by emitting {{"action": "fetch_emails"}}. When the user asks about their emails, ALWAYS use this action — never say you don't have access.
- If Gmail is Not connected: tell the user to connect Gmail in Settings.

INTERNAL COMMANDS - include ONLY when genuinely needed, as raw JSON on its own line, nothing else around it:
{{"action": "save_memory", "content": "...", "importance": "high|medium|low"}}
{{"action": "add_task", "title": "specific meaningful title", "reminder_at": "YYYY-MM-DD HH:MM or null"}}
{{"action": "add_event", "title": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "end_time": "HH:MM or null", "description": "optional", "reminder_minutes": 15}}
{{"action": "edit_event", "event_id": <id>, "title": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "end_time": "HH:MM or null", "description": "optional", "reminder_minutes": 15}}
{{"action": "delete_task", "task_id": <id>}}
{{"action": "delete_event", "event_id": <id>}}
{{"action": "complete_task", "task_id": <id>}}
{{"action": "fetch_emails"}}

MEMORY RULES:
ALWAYS save as HIGH importance:
- Personal life events, who the user is, important relationships, current big goals/projects
- Personal preferences and habits, health/mental state
- Any file or document shared — summarize key points

NEVER save: tasks/meetings, questions asked, small talk, things already stored

RULES - non negotiable:
- NEVER show JSON to the user. NEVER mention saving, storing, remembering.
- NEVER say "voy a guardar", "I'll save", "He guardado", "adding a task".
- Task titles must be specific. NEVER use "tarea", "task", "reminder".
- Only save memory if it is genuinely new and important personal information.
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

GMAIL STATUS: {gmail}
- If Gmail is Connected: you CAN read the user's emails by emitting {{"action": "fetch_emails"}}
- If Gmail is Not connected: tell the user to connect Gmail in Settings.

INTERNAL COMMANDS - include ONLY when genuinely needed, as raw JSON on its own line:
{{"action": "save_memory", "content": "...", "importance": "high|medium|low"}}
{{"action": "add_task", "title": "specific meaningful title", "reminder_at": "YYYY-MM-DD HH:MM or null"}}
{{"action": "add_event", "title": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "end_time": "HH:MM or null", "description": "optional", "reminder_minutes": 15}}
{{"action": "edit_event", "event_id": <id>, "title": "...", "event_date": "YYYY-MM-DD", "event_time": "HH:MM", "end_time": "HH:MM or null", "description": "optional", "reminder_minutes": 15}}
{{"action": "delete_task", "task_id": <id>}}
{{"action": "delete_event", "event_id": <id>}}
{{"action": "complete_task", "task_id": <id>}}
{{"action": "fetch_emails"}}

MEMORY RULES:
ALWAYS save as HIGH: personal life events, who the user is, relationships, goals, preferences, health
NEVER save: tasks/meetings, questions, small talk, duplicates

RULES:
- NEVER show JSON. NEVER mention saving/storing.
- Sound like a person, not a system."""

# Extra instructions for Claude when handling complex tasks
CLAUDE_EXTRA = """
You are handling a COMPLEX request that requires deep reasoning. In addition to your normal capabilities:

COMPLEX TASK GUIDELINES:
- For EMAIL ANALYSIS: Read emails carefully, identify urgency/sender/topic, draft a concise reply the user can send with one tap. Format: "**Reply suggestion:**\n[draft]"
- For DAY PLANNING: Look at tasks + events, suggest a realistic schedule with time blocks. Be specific with times.
- For TASK PRIORITIZATION: Use urgency + importance matrix. Explain briefly why each task is prioritized.
- For LONG CONVERSATION SUMMARY: Extract key decisions, action items, and important context. Be concise.
- Always be actionable — don't just analyze, suggest next steps.
"""


# ── Router ────────────────────────────────────────────────────────────────────

COMPLEX_KEYWORDS = [
    # English
    'analyze', 'analyse', 'plan', 'planning', 'prioritize', 'prioritise',
    'summarize', 'summarise', 'summary', 'should i', 'help me decide',
    'what do you think about', 'review', 'draft', 'write an email',
    'schedule my', 'organize my', 'what should i focus',
    'most important', 'urgent', 'strategy', 'recommend',
    # Spanish
    'analiza', 'planifica', 'prioriza', 'resume', 'qué debería',
    'ayúdame a decidir', 'qué piensas', 'revisa', 'redacta',
    'organiza mi', 'en qué me centro', 'más importante', 'urgente',
    'estrategia', 'recomienda', 'planea mi día', 'cómo organizo',
]

def classify_message(message: str, history_length: int, has_attachment: bool = False) -> str:
    """
    Returns 'complex' or 'simple'.
    Complex → Claude Sonnet
    Simple  → Llama 3.3
    """
    msg_lower = message.lower()

    # Always complex if attachment (needs deep analysis)
    if has_attachment:
        return 'complex'

    # Always complex if long message (user invested effort → needs quality response)
    if len(message.split()) > 40:
        return 'complex'

    # Complex if contains reasoning keywords
    if any(kw in msg_lower for kw in COMPLEX_KEYWORDS):
        return 'complex'

    # Complex if long conversation with no resolution (user might be stuck)
    if history_length > 20:
        return 'complex'

    return 'simple'


# ── System prompt builder ─────────────────────────────────────────────────────

async def build_system_prompt(user_id: int, mode: str = "work", lang: str = "en",
                               user_local_time: str = None, for_claude: bool = False) -> str:
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

    try:
        gmail_token = await get_google_token(user_id)
        gmail_text = f"Connected ({gmail_token['gmail_address']})" if gmail_token else "Not connected"
    except Exception:
        gmail_text = "Not connected"

    if user_local_time:
        try:
            from datetime import datetime as dt
            local_dt = dt.fromisoformat(user_local_time[:16])
            today_str = local_dt.strftime("%A, %d %B %Y — %H:%M")
        except Exception:
            today_str = datetime.now().strftime("%A, %d %B %Y — %H:%M")
    else:
        today_str = datetime.now().strftime("%A, %d %B %Y — %H:%M")

    template = WORK_PROMPT if mode == "work" else LIFE_PROMPT
    prompt = template.format(
        today=today_str,
        memories=memory_text,
        tasks=task_text,
        events=event_text,
        gmail=gmail_text
    )

    if for_claude:
        prompt += CLAUDE_EXTRA

    return prompt


# ── Response cleaner ──────────────────────────────────────────────────────────

def clean_response(text: str) -> str:
    text = re.sub(r'```json.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'^\s*\{["\']action["\'].*?\}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\[?\s*\{["\']action["\'].*?\}\s*\]?', '', text, flags=re.DOTALL)
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


# ── Command executor ──────────────────────────────────────────────────────────

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
                                cmd.get("event_time"), cmd.get("description"),
                                cmd.get("reminder_minutes", 15), cmd.get("end_time"))
            elif action == "edit_event":
                event_id = cmd.get("event_id")
                if event_id:
                    await update_event(int(event_id), user_id, cmd.get("title", ""),
                                       cmd.get("event_date", ""), cmd.get("event_time"),
                                       cmd.get("end_time"), cmd.get("description"),
                                       cmd.get("reminder_minutes", 15))
            elif action == "delete_task":
                task_id = cmd.get("task_id")
                if task_id: await delete_task(int(task_id), user_id)
            elif action == "delete_event":
                event_id = cmd.get("event_id")
                if event_id: await delete_event(int(event_id), user_id)
            elif action == "complete_task":
                task_id = cmd.get("task_id")
                if task_id: await complete_task(int(task_id), user_id)
            elif action == "fetch_emails":
                try:
                    from backend.google_oauth import fetch_todays_emails_oauth
                    from backend.email_digest import summarize_emails
                    import json as _json
                    import asyncio as _asyncio
                    token = await get_google_token(user_id)
                    if token:
                        token_data = (
                            _json.loads(token["token_data"])
                            if isinstance(token["token_data"], str)
                            else token["token_data"]
                        )
                        emails = await _asyncio.get_event_loop().run_in_executor(
                            None, fetch_todays_emails_oauth, token_data
                        )
                        summary = await _asyncio.get_event_loop().run_in_executor(
                            None, summarize_emails, emails, "the user"
                        )
                        text = text + f"\n\nEMAIL_SUMMARY_RESULT:\n{summary}"
                except Exception as e:
                    print(f"[fetch_emails] Error: {e}")
        except Exception:
            pass

    return clean_response(text)


# ── History summarizer ────────────────────────────────────────────────────────

async def maybe_summarize_history(user_id: int, mode: str, history: list) -> str:
    if len(history) < 30:
        return None

    to_summarize = history[:20]
    summary_prompt = """Read this conversation excerpt and extract a concise summary of:
1. Key personal information shared (job, projects, goals, relationships, health, life events)
2. Important decisions or conclusions reached
3. Any ongoing topics or tasks discussed

Be brief and factual. Max 150 words. Format as bullet points."""

    messages_text = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in to_summarize])

    try:
        client = get_groq_client()
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=300,
            messages=[{"role": "user", "content": f"{summary_prompt}\n\n---\n{messages_text}"}]
        )
        summary = response.choices[0].message.content
        await save_memory(user_id, f"[CONVERSATION SUMMARY] {summary}", "high")
        return summary
    except Exception:
        return None


# ── LLM callers ───────────────────────────────────────────────────────────────

async def call_llama(system: str, messages: list, user_message: str) -> str:
    """Fast response via Groq Llama 3.3 70b"""
    client = get_groq_client()
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system},
            *messages,
            {"role": "user", "content": user_message}
        ]
    )
    return response.choices[0].message.content


async def call_claude(system: str, messages: list, user_message: str) -> str:
    """Deep reasoning via Claude Sonnet"""
    client = get_anthropic_client()

    # Convert history to Anthropic format
    anthropic_messages = []
    for m in messages:
        anthropic_messages.append({
            "role": m["role"],
            "content": m["content"]
        })
    anthropic_messages.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=system,
        messages=anthropic_messages
    )
    return response.content[0].text


# ── Main chat function ────────────────────────────────────────────────────────

async def chat(user_id: int, user_message: str, mode: str = "work",
               lang: str = "en", user_local_time: str = None) -> str:

    await save_message(user_id, "user", user_message, mode)

    history = await get_conversation_history(user_id, mode=mode, limit=40)

    if len(history) >= 30:
        await maybe_summarize_history(user_id, mode, history)
        history = await get_conversation_history(user_id, mode=mode, limit=15)

    # ── Route: classify message complexity ──
    complexity = classify_message(user_message, len(history))
    print(f"[router] complexity={complexity} | msg_len={len(user_message.split())} | history={len(history)}")

    # Build messages history
    messages = [{"role": h["role"], "content": h["content"]} for h in history]

    # ── Call the right LLM ──
    if complexity == 'complex':
        system = await build_system_prompt(user_id, mode, lang, user_local_time, for_claude=True)
        print(f"[router] → Claude Sonnet")
        raw = await call_claude(system, messages, user_message)
    else:
        system = await build_system_prompt(user_id, mode, lang, user_local_time, for_claude=False)
        print(f"[router] → Llama 3.3")
        raw = await call_llama(system, messages, user_message)

    clean = await extract_and_execute_commands(raw, user_id)

    # Handle email summary result
    if "EMAIL_SUMMARY_RESULT:" in clean:
        parts = clean.split("EMAIL_SUMMARY_RESULT:", 1)
        email_summary = parts[1].strip()
        clean = parts[0].strip()
        if email_summary:
            followup_messages = messages + [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": f"[SYSTEM: Email fetch complete. Share this summary naturally with the user:]\n{email_summary}"}
            ]
            # Always use Claude for email analysis follow-up
            system_claude = await build_system_prompt(user_id, mode, lang, user_local_time, for_claude=True)
            followup_raw = await call_claude(system_claude, followup_messages[:-1], followup_messages[-1]["content"])
            clean = clean_response(followup_raw)

    if not clean:
        clean = "Done."

    await save_message(user_id, "assistant", clean, mode)
    return clean
