"""
ARIA v4 — Database layer (PostgreSQL via asyncpg)
"""

import asyncpg
import hashlib
import os
import secrets
import json
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Connection pool (initialized on startup)
_pool: asyncpg.Pool = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(32)
    hashed = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 310_000
    ).hex()
    return hashed, salt


def verify_password(password: str, hashed: str, salt: str) -> bool:
    check, _ = hash_password(password, salt)
    return secrets.compare_digest(check, hashed)


# ── Init ──────────────────────────────────────────────────────────────────────

async def init_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                name          TEXT    NOT NULL,
                email         TEXT    UNIQUE,
                password_hash TEXT,
                password_salt TEXT,
                telegram_id   TEXT    UNIQUE,
                created_at    TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                role       TEXT    NOT NULL,
                content    TEXT    NOT NULL,
                mode       TEXT    DEFAULT 'work',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                content    TEXT    NOT NULL,
                importance TEXT    DEFAULT 'medium',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id),
                title       TEXT    NOT NULL,
                done        INTEGER DEFAULT 0,
                reminder_at TEXT,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id               SERIAL PRIMARY KEY,
                user_id          INTEGER NOT NULL REFERENCES users(id),
                title            TEXT    NOT NULL,
                description      TEXT,
                event_date       TEXT    NOT NULL,
                event_time       TEXT,
                end_time         TEXT,
                reminder_minutes INTEGER DEFAULT 15,
                reminded         INTEGER DEFAULT 0,
                google_id        TEXT,
                created_at       TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                title      TEXT    NOT NULL DEFAULT 'Untitled',
                content    TEXT    NOT NULL DEFAULT '',
                tag        TEXT    DEFAULT 'personal',
                color      TEXT    DEFAULT 'gold',
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS link_codes (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                code       TEXT    NOT NULL UNIQUE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS reset_tokens (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                token      TEXT    NOT NULL UNIQUE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS email_accounts (
                user_id        INTEGER PRIMARY KEY REFERENCES users(id),
                gmail_address  TEXT NOT NULL,
                app_password   TEXT NOT NULL,
                digest_time    TEXT DEFAULT '08:00',
                digest_enabled INTEGER DEFAULT 0
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS google_tokens (
                user_id        INTEGER PRIMARY KEY REFERENCES users(id),
                token_data     TEXT NOT NULL,
                gmail_address  TEXT NOT NULL,
                digest_time    TEXT DEFAULT '08:00',
                digest_enabled INTEGER DEFAULT 0
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS google_calendar_tokens (
                user_id        INTEGER PRIMARY KEY REFERENCES users(id),
                token_data     TEXT NOT NULL,
                calendar_email TEXT NOT NULL
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                endpoint   TEXT    NOT NULL UNIQUE,
                p256dh     TEXT    NOT NULL,
                auth       TEXT    NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        # Create indexes for performance
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_mode ON conversations(user_id, mode, created_at)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, done)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, event_date)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)")


# Keep for backward compatibility
async def ensure_link_codes_table():    pass
async def ensure_reset_tokens_table():  pass
async def ensure_email_account_table(): pass
async def ensure_google_tokens_table(): pass


# ── Helper ────────────────────────────────────────────────────────────────────

def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    return [dict(r) for r in rows]


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_or_create_user(name: str, telegram_id: str = None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if telegram_id:
            row = await conn.fetchrow("SELECT * FROM users WHERE telegram_id = $1", telegram_id)
            if row:
                return row_to_dict(row)
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE LOWER(name) = LOWER($1) AND email IS NULL", name
        )
        if row:
            if telegram_id:
                await conn.execute(
                    "UPDATE users SET telegram_id = $1 WHERE id = $2",
                    telegram_id, row["id"]
                )
            return row_to_dict(row)
        row = await conn.fetchrow(
            "INSERT INTO users (name, telegram_id) VALUES ($1, $2) RETURNING *",
            name, telegram_id
        )
        return row_to_dict(row)


async def register_user(name: str, email: str, password: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE LOWER(email) = LOWER($1)", email
        )
        if existing:
            return None
        hashed, salt = hash_password(password)
        row = await conn.fetchrow(
            "INSERT INTO users (name, email, password_hash, password_salt) "
            "VALUES ($1, $2, $3, $4) RETURNING *",
            name.strip(), email.lower().strip(), hashed, salt
        )
        return row_to_dict(row)


async def login_user(email: str, password: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1)", email
        )
        if not row:
            return None
        user = row_to_dict(row)
        if not user.get("password_hash"):
            return None
        if verify_password(password, user["password_hash"], user["password_salt"]):
            return user
        return None


async def get_all_users() -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email, created_at FROM users ORDER BY created_at DESC"
        )
        return rows_to_list(rows)


async def get_user_by_id(user_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        return row_to_dict(row)


# ── Conversations ─────────────────────────────────────────────────────────────

async def save_message(user_id: int, role: str, content: str, mode: str = "work"):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO conversations (user_id, role, content, mode) VALUES ($1, $2, $3, $4)",
            user_id, role, content, mode
        )


async def get_conversation_history(
    user_id: int, mode: str = "work", limit: int = 20
) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT role, content, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM conversations
               WHERE user_id = $1 AND mode = $2
               AND created_at >= NOW() - INTERVAL '48 hours'
               ORDER BY created_at DESC LIMIT $3""",
            user_id, mode, limit
        )
        return [{"role": r[0], "content": r[1], "created_at": r[2]} for r in reversed(rows)]


# ── Memories ──────────────────────────────────────────────────────────────────

async def save_memory(user_id: int, content: str, importance: str = "medium"):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Skip exact duplicates
        existing = await conn.fetchrow(
            "SELECT id FROM memories WHERE user_id = $1 AND LOWER(content) = LOWER($2)",
            user_id, content
        )
        if existing:
            return
        # Update near-duplicates
        rows = await conn.fetch(
            "SELECT id, content FROM memories WHERE user_id = $1", user_id
        )
        for row in rows:
            existing_words = set(row["content"].lower().split())
            new_words = set(content.lower().split())
            if existing_words and new_words:
                overlap = len(existing_words & new_words) / max(len(existing_words), len(new_words))
                if overlap > 0.8:
                    await conn.execute(
                        "UPDATE memories SET content = $1, importance = $2 WHERE id = $3",
                        content, importance, row["id"]
                    )
                    return
        await conn.execute(
            "INSERT INTO memories (user_id, content, importance) VALUES ($1, $2, $3)",
            user_id, content, importance
        )


async def get_memories(user_id: int) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, content, importance, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM memories
               WHERE user_id = $1
               ORDER BY CASE importance
                 WHEN 'high'   THEN 1
                 WHEN 'medium' THEN 2
                 ELSE 3
               END, created_at DESC LIMIT 10""",
            user_id
        )
        return [{"id": r[0], "content": r[1], "importance": r[2], "created_at": r[3]} for r in rows]


async def delete_memory(memory_id: int, user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM memories WHERE id = $1 AND user_id = $2",
            memory_id, user_id
        )


# ── Tasks ─────────────────────────────────────────────────────────────────────

async def add_task(user_id: int, title: str, reminder_at: str = None) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM tasks WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND done = 0",
            user_id, title
        )
        if existing:
            return existing["id"]
        row = await conn.fetchrow(
            "INSERT INTO tasks (user_id, title, reminder_at) VALUES ($1, $2, $3) RETURNING id",
            user_id, title, reminder_at
        )
        return row["id"] if row else None


async def get_tasks(user_id: int, only_pending: bool = True) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        q = "SELECT id, title, done, reminder_at, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM tasks WHERE user_id = $1"
        if only_pending:
            q += " AND done = 0"
        q += " ORDER BY created_at DESC"
        rows = await conn.fetch(q, user_id)
        return [{"id": r[0], "title": r[1], "done": r[2], "reminder_at": r[3], "created_at": r[4]} for r in rows]


async def complete_task(task_id: int, user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE tasks SET done = 1 WHERE id = $1 AND user_id = $2",
            task_id, user_id
        )


async def delete_task(task_id: int, user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM tasks WHERE id = $1 AND user_id = $2",
            task_id, user_id
        )


async def update_task(task_id: int, user_id: int, title: str, reminder_at: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE tasks SET title = $1, reminder_at = $2 WHERE id = $3 AND user_id = $4",
            title, reminder_at, task_id, user_id
        )


async def get_task_reminders() -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT t.*, u.telegram_id, u.id as user_id FROM tasks t
               JOIN users u ON t.user_id = u.id
               WHERE t.done = 0
               AND t.reminder_at IS NOT NULL
               AND t.reminder_at::timestamptz <= NOW()""",
        )
        return rows_to_list(rows)


async def clear_task_reminder(task_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE tasks SET reminder_at = NULL WHERE id = $1", task_id)


# ── Events ────────────────────────────────────────────────────────────────────

async def add_event(
    user_id: int, title: str, event_date: str,
    event_time: str = None, description: str = None,
    reminder_minutes: int = 15, end_time: str = None,
    google_id: str = None
) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO events
               (user_id, title, description, event_date, event_time, end_time, reminder_minutes, google_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id""",
            user_id, title, description, event_date, event_time, end_time, reminder_minutes, google_id
        )
        return row["id"] if row else None


async def update_event_google_id(event_id: int, google_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE events SET google_id = $1 WHERE id = $2",
            google_id, event_id
        )


async def get_event_by_google_id(user_id: int, google_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM events WHERE user_id = $1 AND google_id = $2",
            user_id, google_id
        )
        return row_to_dict(row)


async def upsert_google_event(user_id: int, google_id: str, title: str,
                               event_date: str, event_time: str = None,
                               end_time: str = None, description: str = None) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM events WHERE user_id = $1 AND google_id = $2",
            user_id, google_id
        )
        if existing:
            await conn.execute(
                """UPDATE events SET title=$1, event_date=$2, event_time=$3, end_time=$4,
                   description=$5, reminded=0 WHERE id=$6""",
                title, event_date, event_time, end_time, description, existing["id"]
            )
            return existing["id"]
        else:
            row = await conn.fetchrow(
                """INSERT INTO events
                   (user_id, title, description, event_date, event_time, end_time, google_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id""",
                user_id, title, description, event_date, event_time, end_time, google_id
            )
            return row["id"] if row else None


async def delete_events_not_in_google(user_id: int, google_ids: list[str]):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, google_id FROM events WHERE user_id = $1 AND google_id IS NOT NULL",
            user_id
        )
        for row in rows:
            if row["google_id"] not in google_ids:
                await conn.execute("DELETE FROM events WHERE id = $1", row["id"])


async def update_event(
    event_id: int, user_id: int, title: str, event_date: str,
    event_time: str = None, end_time: str = None,
    description: str = None, reminder_minutes: int = 15
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE events SET title=$1, event_date=$2, event_time=$3, end_time=$4,
               description=$5, reminder_minutes=$6, reminded=0
               WHERE id=$7 AND user_id=$8""",
            title, event_date, event_time, end_time, description, reminder_minutes, event_id, user_id
        )


async def get_events(user_id: int, date: str = None) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if date:
            rows = await conn.fetch(
                "SELECT * FROM events WHERE user_id = $1 AND event_date = $2 ORDER BY event_time",
                user_id, date
            )
        else:
            rows = await conn.fetch(
                """SELECT * FROM events WHERE user_id = $1 AND event_date >= CURRENT_DATE::text
                   ORDER BY event_date, event_time LIMIT 50""",
                user_id
            )
        return rows_to_list(rows)


async def get_events_month(user_id: int, year: int, month: int) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        month_str = f"{year}-{month:02d}"
        rows = await conn.fetch(
            "SELECT * FROM events WHERE user_id = $1 AND event_date LIKE $2 ORDER BY event_date, event_time",
            user_id, f"{month_str}%"
        )
        return rows_to_list(rows)


async def delete_event(event_id: int, user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM events WHERE id = $1 AND user_id = $2",
            event_id, user_id
        )


async def get_pending_reminders() -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT e.*, u.telegram_id, u.id as user_id FROM events e
               JOIN users u ON e.user_id = u.id
               WHERE e.reminded = 0
               AND (e.event_date || ' ' || COALESCE(e.event_time, '00:00'))::timestamptz
                   - (e.reminder_minutes || ' minutes')::interval <= NOW()
               AND (e.event_date || ' ' || COALESCE(e.event_time, '00:00'))::timestamptz >= NOW()"""
        )
        return rows_to_list(rows)


async def mark_reminder_sent(event_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE events SET reminded = 1 WHERE id = $1", event_id)


# ── Link codes (Telegram) ─────────────────────────────────────────────────────

async def create_link_code(user_id: int) -> str:
    import random, string
    code = "".join(random.choices(string.digits, k=6))
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM link_codes WHERE user_id = $1", user_id)
        await conn.execute(
            "INSERT INTO link_codes (user_id, code) VALUES ($1, $2)", user_id, code
        )
    return code


async def verify_link_code(code: str, telegram_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT lc.user_id, u.name FROM link_codes lc
               JOIN users u ON lc.user_id = u.id
               WHERE lc.code = $1
               AND lc.created_at >= NOW() - INTERVAL '10 minutes'""",
            code
        )
        if not row:
            return None
        user_id = row["user_id"]
        name = row["name"]
        await conn.execute(
            "UPDATE users SET telegram_id = NULL WHERE telegram_id = $1 AND id != $2",
            telegram_id, user_id
        )
        await conn.execute(
            "UPDATE users SET telegram_id = $1 WHERE id = $2", telegram_id, user_id
        )
        await conn.execute("DELETE FROM link_codes WHERE user_id = $1", user_id)
        return {"user_id": user_id, "name": name}


# ── Password reset ────────────────────────────────────────────────────────────

async def create_reset_token(email: str) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE LOWER(email) = LOWER($1)", email
        )
        if not row:
            return None
        token = secrets.token_urlsafe(32)
        await conn.execute("DELETE FROM reset_tokens WHERE user_id = $1", row["id"])
        await conn.execute(
            "INSERT INTO reset_tokens (user_id, token) VALUES ($1, $2)", row["id"], token
        )
        return token


async def verify_reset_token(token: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT u.id, u.name, u.email FROM reset_tokens rt
               JOIN users u ON rt.user_id = u.id
               WHERE rt.token = $1
               AND rt.created_at >= NOW() - INTERVAL '1 hour'""",
            token
        )
        return row_to_dict(row)


async def reset_password(token: str, new_password: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT user_id FROM reset_tokens
               WHERE token = $1
               AND created_at >= NOW() - INTERVAL '1 hour'""",
            token
        )
        if not row:
            return False
        hashed, salt = hash_password(new_password)
        await conn.execute(
            "UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3",
            hashed, salt, row["user_id"]
        )
        await conn.execute("DELETE FROM reset_tokens WHERE token = $1", token)
        return True


# ── Google OAuth tokens ───────────────────────────────────────────────────────

async def save_google_token(user_id: int, token_data: dict, gmail_address: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO google_tokens (user_id, token_data, gmail_address)
               VALUES ($1, $2, $3)
               ON CONFLICT(user_id) DO UPDATE SET
                 token_data=EXCLUDED.token_data,
                 gmail_address=EXCLUDED.gmail_address""",
            user_id, json.dumps(token_data), gmail_address
        )


async def get_google_token(user_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM google_tokens WHERE user_id = $1", user_id
        )
        if not row:
            return None
        d = row_to_dict(row)
        d["token_data"] = json.loads(d["token_data"])
        return d


async def save_google_digest_settings(user_id: int, digest_time: str, digest_enabled: bool):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE google_tokens SET digest_time=$1, digest_enabled=$2 WHERE user_id=$3",
            digest_time, int(digest_enabled), user_id
        )


async def delete_google_token(user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM google_tokens WHERE user_id = $1", user_id)


# ── Google Calendar tokens ────────────────────────────────────────────────────

async def save_calendar_token(user_id: int, token_data: dict, calendar_email: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO google_calendar_tokens (user_id, token_data, calendar_email)
               VALUES ($1, $2, $3)
               ON CONFLICT(user_id) DO UPDATE SET
                 token_data=EXCLUDED.token_data,
                 calendar_email=EXCLUDED.calendar_email""",
            user_id, json.dumps(token_data), calendar_email
        )


async def get_calendar_token(user_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM google_calendar_tokens WHERE user_id = $1", user_id
        )
        if not row:
            return None
        d = row_to_dict(row)
        d["token_data"] = json.loads(d["token_data"])
        return d


async def delete_calendar_token(user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM google_calendar_tokens WHERE user_id = $1", user_id
        )


async def get_users_due_for_gmail_digest() -> list:
    now = datetime.now().strftime("%H:%M")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT gt.*, u.name, u.email as notify_email FROM google_tokens gt
               JOIN users u ON gt.user_id = u.id
               WHERE gt.digest_enabled = 1
               AND gt.digest_time = $1
               AND u.email IS NOT NULL""",
            now
        )
        return rows_to_list(rows)


# ── Email account (legacy) ────────────────────────────────────────────────────

async def save_email_account(
    user_id: int, gmail_address: str, app_password: str,
    digest_time: str, digest_enabled: bool
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO email_accounts
               (user_id, gmail_address, app_password, digest_time, digest_enabled)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT(user_id) DO UPDATE SET
                 gmail_address=EXCLUDED.gmail_address,
                 app_password=EXCLUDED.app_password,
                 digest_time=EXCLUDED.digest_time,
                 digest_enabled=EXCLUDED.digest_enabled""",
            user_id, gmail_address, app_password, digest_time, int(digest_enabled)
        )


async def get_email_account(user_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM email_accounts WHERE user_id = $1", user_id
        )
        return row_to_dict(row)


async def delete_email_account(user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM email_accounts WHERE user_id = $1", user_id
        )


# ── Push subscriptions ────────────────────────────────────────────────────────

async def save_push_subscription(user_id: int, endpoint: str, p256dh: str, auth: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT(endpoint) DO UPDATE SET
                 user_id=EXCLUDED.user_id,
                 p256dh=EXCLUDED.p256dh,
                 auth=EXCLUDED.auth""",
            user_id, endpoint, p256dh, auth
        )


async def get_push_subscriptions(user_id: int) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
            user_id
        )
        return rows_to_list(rows)


async def get_all_push_subscriptions_for_users(user_ids: list[int]) -> list:
    """Get all push subscriptions for a list of user IDs (used by reminder loop)."""
    if not user_ids:
        return []
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::int[])",
            user_ids
        )
        return rows_to_list(rows)


async def delete_push_subscription(endpoint: str):
    """Remove a subscription (e.g. when the browser rejects it as expired)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = $1", endpoint
        )


# ── Cleanup ───────────────────────────────────────────────────────────────────

async def cleanup_old_data():
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Delete past events (more than 1 hour ago)
        await conn.execute("""
            DELETE FROM events
            WHERE (event_date || ' ' || COALESCE(event_time, '23:59'))::timestamptz
                  < NOW() - INTERVAL '1 hour'
        """)
        # Delete completed tasks older than 3 days
        await conn.execute("""
            DELETE FROM tasks
            WHERE done = 1
            AND created_at < NOW() - INTERVAL '3 days'
        """)
        # Clear stale reminders
        await conn.execute("""
            UPDATE tasks SET reminder_at = NULL
            WHERE reminder_at IS NOT NULL
            AND reminder_at::timestamptz < NOW() - INTERVAL '5 minutes'
        """)
        # Clean expired tokens
        await conn.execute("""
            DELETE FROM reset_tokens
            WHERE created_at < NOW() - INTERVAL '1 hour'
        """)
        await conn.execute("""
            DELETE FROM link_codes
            WHERE created_at < NOW() - INTERVAL '10 minutes'
        """)


# ── Notes ─────────────────────────────────────────────────────────────────────

async def get_notes(user_id: int) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, title, content, tag, color, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'), to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM notes WHERE user_id = $1 ORDER BY updated_at DESC",
            user_id
        )
        return [{"id": r[0], "title": r[1], "content": r[2], "tag": r[3], "color": r[4], "created_at": r[5], "updated_at": r[6]} for r in rows]


async def add_note(user_id: int, title: str, content: str = "", tag: str = "personal", color: str = "gold") -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO notes (user_id, title, content, tag, color) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            user_id, title, content, tag, color
        )
        return row["id"] if row else None


async def update_note(note_id: int, user_id: int, title: str, content: str, tag: str, color: str = "gold"):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE notes SET title=$1, content=$2, tag=$3, color=$4, updated_at=NOW() WHERE id=$5 AND user_id=$6",
            title, content, tag, color, note_id, user_id
        )


async def delete_note(note_id: int, user_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM notes WHERE id=$1 AND user_id=$2", note_id, user_id
        )


async def verify_password_by_id(user_id: int, password: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT password_hash, password_salt FROM users WHERE id = $1", user_id
        )
        if not row:
            return False
        return verify_password(password, row["password_hash"], row["password_salt"])
