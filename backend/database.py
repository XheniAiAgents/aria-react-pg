"""
ARIA v4 — Database layer (SQLite via aiosqlite)
All tables are created on startup. No migrations needed for fresh installs.
"""

import aiosqlite
import hashlib
import os
import secrets
from pathlib import Path
from datetime import datetime

DB_PATH = Path(os.getenv("DB_PATH", str(Path(__file__).parent / "aria.db")))


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
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT    NOT NULL,
                email         TEXT    UNIQUE,
                password_hash TEXT,
                password_salt TEXT,
                telegram_id   TEXT    UNIQUE,
                created_at    TEXT    DEFAULT (datetime('now'))
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                role       TEXT    NOT NULL,
                content    TEXT    NOT NULL,
                mode       TEXT    DEFAULT 'work',
                created_at TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                content    TEXT    NOT NULL,
                importance TEXT    DEFAULT 'medium',
                created_at TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                title       TEXT    NOT NULL,
                done        INTEGER DEFAULT 0,
                reminder_at TEXT,
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL,
                title            TEXT    NOT NULL,
                description      TEXT,
                event_date       TEXT    NOT NULL,
                event_time       TEXT,
                end_time         TEXT,
                reminder_minutes INTEGER DEFAULT 15,
                reminded         INTEGER DEFAULT 0,
                created_at       TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                title      TEXT    NOT NULL DEFAULT 'Untitled',
                content    TEXT    NOT NULL DEFAULT '',
                tag        TEXT    DEFAULT 'personal',
                color      TEXT    DEFAULT 'gold',
                updated_at TEXT    DEFAULT (datetime('now')),
                created_at TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS link_codes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                code       TEXT    NOT NULL UNIQUE,
                created_at TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS reset_tokens (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                token      TEXT    NOT NULL UNIQUE,
                created_at TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS email_accounts (
                user_id        INTEGER PRIMARY KEY,
                gmail_address  TEXT NOT NULL,
                app_password   TEXT NOT NULL,
                digest_time    TEXT DEFAULT '08:00',
                digest_enabled INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS google_tokens (
                user_id        INTEGER PRIMARY KEY,
                token_data     TEXT NOT NULL,
                gmail_address  TEXT NOT NULL,
                digest_time    TEXT DEFAULT '08:00',
                digest_enabled INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        # Migration: add color column to notes if it doesn't exist
        try:
            await db.execute("ALTER TABLE notes ADD COLUMN color TEXT DEFAULT 'gold'")
            await db.commit()
        except Exception:
            pass  # Column already exists
        # Migration: add end_time column to events if it doesn't exist
        try:
            await db.execute("ALTER TABLE events ADD COLUMN end_time TEXT")
            await db.commit()
        except Exception:
            pass  # Column already exists
        await db.commit()


# Keep these for backward compatibility — init_db now handles everything
async def ensure_link_codes_table():    pass
async def ensure_reset_tokens_table():  pass
async def ensure_email_account_table(): pass
async def ensure_google_tokens_table(): pass


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_or_create_user(name: str, telegram_id: str = None) -> dict:
    """Legacy: used by Telegram bot for name-based login."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if telegram_id:
            async with db.execute(
                "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
            ) as c:
                row = await c.fetchone()
                if row:
                    return dict(row)
        async with db.execute(
            "SELECT * FROM users WHERE LOWER(name) = LOWER(?) AND email IS NULL", (name,)
        ) as c:
            row = await c.fetchone()
            if row:
                if telegram_id:
                    await db.execute(
                        "UPDATE users SET telegram_id = ? WHERE id = ?",
                        (telegram_id, row["id"])
                    )
                    await db.commit()
                return dict(row)
        async with db.execute(
            "INSERT INTO users (name, telegram_id) VALUES (?, ?) RETURNING *",
            (name, telegram_id)
        ) as c:
            row = await c.fetchone()
            await db.commit()
            return dict(row)


async def register_user(name: str, email: str, password: str) -> dict | None:
    """Register with email + password. Returns None if email already taken."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(?)", (email,)
        ) as c:
            if await c.fetchone():
                return None
        hashed, salt = hash_password(password)
        async with db.execute(
            "INSERT INTO users (name, email, password_hash, password_salt) "
            "VALUES (?, ?, ?, ?) RETURNING *",
            (name.strip(), email.lower().strip(), hashed, salt)
        ) as c:
            row = await c.fetchone()
            await db.commit()
            return dict(row)


async def login_user(email: str, password: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email,)
        ) as c:
            row = await c.fetchone()
            if not row:
                return None
            user = dict(row)
            if not user.get("password_hash"):
                return None
            if verify_password(password, user["password_hash"], user["password_salt"]):
                return user
            return None


async def get_all_users() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, name, email, created_at FROM users ORDER BY created_at DESC"
        ) as c:
            return [dict(r) for r in await c.fetchall()]


async def get_user_by_id(user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ) as c:
            row = await c.fetchone()
            return dict(row) if row else None


# ── Conversations ─────────────────────────────────────────────────────────────

async def save_message(user_id: int, role: str, content: str, mode: str = "work"):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO conversations (user_id, role, content, mode) VALUES (?, ?, ?, ?)",
            (user_id, role, content, mode)
        )
        await db.commit()


async def get_conversation_history(
    user_id: int, mode: str = "work", limit: int = 20
) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """SELECT role, content, created_at FROM conversations
               WHERE user_id = ? AND mode = ?
               AND created_at >= datetime('now', '-48 hours')
               ORDER BY created_at DESC LIMIT ?""",
            (user_id, mode, limit)
        ) as c:
            rows = await c.fetchall()
            # Reverse to get chronological order (oldest first, newest last)
            return [{"role": r[0], "content": r[1], "created_at": r[2]} for r in reversed(rows)]


# ── Memories ──────────────────────────────────────────────────────────────────

async def save_memory(user_id: int, content: str, importance: str = "medium"):
    async with aiosqlite.connect(DB_PATH) as db:
        # Skip exact duplicates
        async with db.execute(
            "SELECT id FROM memories WHERE user_id = ? AND LOWER(content) = LOWER(?)",
            (user_id, content)
        ) as c:
            if await c.fetchone():
                return
        # Update near-duplicates instead of inserting
        async with db.execute(
            "SELECT id, content FROM memories WHERE user_id = ?", (user_id,)
        ) as c:
            for row in await c.fetchall():
                existing_words = set(row[1].lower().split())
                new_words = set(content.lower().split())
                if existing_words and new_words:
                    overlap = len(existing_words & new_words) / max(
                        len(existing_words), len(new_words)
                    )
                    if overlap > 0.8:
                        await db.execute(
                            "UPDATE memories SET content = ?, importance = ? WHERE id = ?",
                            (content, importance, row[0])
                        )
                        await db.commit()
                        return
        await db.execute(
            "INSERT INTO memories (user_id, content, importance) VALUES (?, ?, ?)",
            (user_id, content, importance)
        )
        await db.commit()


async def get_memories(user_id: int) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, content, importance, created_at FROM memories
               WHERE user_id = ?
               ORDER BY CASE importance
                 WHEN 'high'   THEN 1
                 WHEN 'medium' THEN 2
                 ELSE 3
               END, created_at DESC LIMIT 10""",
            (user_id,)
        ) as c:
            return [dict(r) for r in await c.fetchall()]


async def delete_memory(memory_id: int, user_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM memories WHERE id = ? AND user_id = ?",
            (memory_id, user_id)
        )
        await db.commit()


# ── Tasks ─────────────────────────────────────────────────────────────────────

async def add_task(user_id: int, title: str, reminder_at: str = None) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        # Skip duplicate pending tasks
        async with db.execute(
            "SELECT id FROM tasks WHERE user_id = ? AND LOWER(title) = LOWER(?) AND done = 0",
            (user_id, title)
        ) as c:
            existing = await c.fetchone()
            if existing:
                return existing[0]
        async with db.execute(
            "INSERT INTO tasks (user_id, title, reminder_at) VALUES (?, ?, ?) RETURNING id",
            (user_id, title, reminder_at)
        ) as c:
            row = await c.fetchone()
            await db.commit()
            return row[0] if row else None


async def get_tasks(user_id: int, only_pending: bool = True) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        q = "SELECT id, title, done, reminder_at, created_at FROM tasks WHERE user_id = ?"
        params = [user_id]
        if only_pending:
            q += " AND done = 0"
        q += " ORDER BY created_at DESC"
        async with db.execute(q, params) as c:
            return [dict(r) for r in await c.fetchall()]


async def complete_task(task_id: int, user_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE tasks SET done = 1 WHERE id = ? AND user_id = ?",
            (task_id, user_id)
        )
        await db.commit()


async def delete_task(task_id: int, user_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM tasks WHERE id = ? AND user_id = ?",
            (task_id, user_id)
        )
        await db.commit()


async def update_task(task_id: int, user_id: int, title: str, reminder_at: str = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE tasks SET title = ?, reminder_at = ? WHERE id = ? AND user_id = ?",
            (title, reminder_at, task_id, user_id)
        )
        await db.commit()


async def get_task_reminders() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT t.*, u.telegram_id FROM tasks t
               JOIN users u ON t.user_id = u.id
               WHERE t.done = 0
               AND t.reminder_at IS NOT NULL
               AND u.telegram_id IS NOT NULL
               AND datetime(t.reminder_at) <= datetime('now', 'localtime')"""
        ) as c:
            return [dict(r) for r in await c.fetchall()]


async def clear_task_reminder(task_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE tasks SET reminder_at = NULL WHERE id = ?", (task_id,))
        await db.commit()


# ── Events ────────────────────────────────────────────────────────────────────

async def add_event(
    user_id: int, title: str, event_date: str,
    event_time: str = None, description: str = None,
    reminder_minutes: int = 15, end_time: str = None
) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """INSERT INTO events
               (user_id, title, description, event_date, event_time, end_time, reminder_minutes)
               VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id""",
            (user_id, title, description, event_date, event_time, end_time, reminder_minutes)
        ) as c:
            row = await c.fetchone()
            await db.commit()
            return row[0] if row else None


async def update_event(
    event_id: int, user_id: int, title: str, event_date: str,
    event_time: str = None, end_time: str = None,
    description: str = None, reminder_minutes: int = 15
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE events SET title=?, event_date=?, event_time=?, end_time=?,
               description=?, reminder_minutes=?, reminded=0
               WHERE id=? AND user_id=?""",
            (title, event_date, event_time, end_time, description, reminder_minutes, event_id, user_id)
        )
        await db.commit()


async def get_events(user_id: int, date: str = None) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if date:
            async with db.execute(
                "SELECT * FROM events WHERE user_id = ? AND event_date = ? ORDER BY event_time",
                (user_id, date)
            ) as c:
                return [dict(r) for r in await c.fetchall()]
        async with db.execute(
            """SELECT * FROM events WHERE user_id = ? AND event_date >= date('now')
               ORDER BY event_date, event_time LIMIT 50""",
            (user_id,)
        ) as c:
            return [dict(r) for r in await c.fetchall()]


async def get_events_month(user_id: int, year: int, month: int) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        month_str = f"{year}-{month:02d}"
        async with db.execute(
            "SELECT * FROM events WHERE user_id = ? AND event_date LIKE ? "
            "ORDER BY event_date, event_time",
            (user_id, f"{month_str}%")
        ) as c:
            return [dict(r) for r in await c.fetchall()]


async def delete_event(event_id: int, user_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM events WHERE id = ? AND user_id = ?",
            (event_id, user_id)
        )
        await db.commit()


async def get_pending_reminders() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT e.*, u.telegram_id FROM events e
               JOIN users u ON e.user_id = u.id
               WHERE e.reminded = 0
               AND u.telegram_id IS NOT NULL
               AND datetime(e.event_date || ' ' || COALESCE(e.event_time, '00:00'),
                   '-' || e.reminder_minutes || ' minutes')
                   <= datetime('now', 'localtime')
               AND datetime(e.event_date || ' ' || COALESCE(e.event_time, '00:00'))
                   >= datetime('now', 'localtime')"""
        ) as c:
            return [dict(r) for r in await c.fetchall()]


async def mark_reminder_sent(event_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE events SET reminded = 1 WHERE id = ?", (event_id,))
        await db.commit()


# ── Link codes (Telegram) ─────────────────────────────────────────────────────

async def create_link_code(user_id: int) -> str:
    import random, string
    code = "".join(random.choices(string.digits, k=6))
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM link_codes WHERE user_id = ?", (user_id,))
        await db.execute(
            "INSERT INTO link_codes (user_id, code) VALUES (?, ?)", (user_id, code)
        )
        await db.commit()
    return code


async def verify_link_code(code: str, telegram_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT lc.user_id, u.name FROM link_codes lc
               JOIN users u ON lc.user_id = u.id
               WHERE lc.code = ?
               AND datetime(lc.created_at, '+10 minutes') > datetime('now')""",
            (code,)
        ) as c:
            row = await c.fetchone()
            if not row:
                return None
        user_id = row["user_id"]
        name = row["name"]
        await db.execute(
            "UPDATE users SET telegram_id = NULL WHERE telegram_id = ? AND id != ?",
            (telegram_id, user_id)
        )
        await db.execute(
            "UPDATE users SET telegram_id = ? WHERE id = ?", (telegram_id, user_id)
        )
        await db.execute("DELETE FROM link_codes WHERE user_id = ?", (user_id,))
        await db.commit()
        return {"user_id": user_id, "name": name}


# ── Password reset ────────────────────────────────────────────────────────────

async def create_reset_token(email: str) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(?)", (email,)
        ) as c:
            row = await c.fetchone()
            if not row:
                return None
        token = secrets.token_urlsafe(32)
        await db.execute("DELETE FROM reset_tokens WHERE user_id = ?", (row["id"],))
        await db.execute(
            "INSERT INTO reset_tokens (user_id, token) VALUES (?, ?)", (row["id"], token)
        )
        await db.commit()
        return token


async def verify_reset_token(token: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT u.id, u.name, u.email FROM reset_tokens rt
               JOIN users u ON rt.user_id = u.id
               WHERE rt.token = ?
               AND datetime(rt.created_at, '+1 hour') > datetime('now')""",
            (token,)
        ) as c:
            row = await c.fetchone()
            return dict(row) if row else None


async def reset_password(token: str, new_password: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT user_id FROM reset_tokens
               WHERE token = ?
               AND datetime(created_at, '+1 hour') > datetime('now')""",
            (token,)
        ) as c:
            row = await c.fetchone()
            if not row:
                return False
        hashed, salt = hash_password(new_password)
        await db.execute(
            "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
            (hashed, salt, row["user_id"])
        )
        await db.execute("DELETE FROM reset_tokens WHERE token = ?", (token,))
        await db.commit()
        return True


# ── Google OAuth tokens ───────────────────────────────────────────────────────

async def save_google_token(user_id: int, token_data: dict, gmail_address: str):
    import json
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO google_tokens (user_id, token_data, gmail_address)
               VALUES (?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                 token_data=excluded.token_data,
                 gmail_address=excluded.gmail_address""",
            (user_id, json.dumps(token_data), gmail_address)
        )
        await db.commit()


async def get_google_token(user_id: int) -> dict | None:
    import json
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM google_tokens WHERE user_id = ?", (user_id,)
        ) as c:
            row = await c.fetchone()
            if not row:
                return None
            d = dict(row)
            d["token_data"] = json.loads(d["token_data"])
            return d


async def save_google_digest_settings(
    user_id: int, digest_time: str, digest_enabled: bool
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE google_tokens SET digest_time=?, digest_enabled=? WHERE user_id=?",
            (digest_time, int(digest_enabled), user_id)
        )
        await db.commit()


async def delete_google_token(user_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM google_tokens WHERE user_id = ?", (user_id,))
        await db.commit()


async def get_users_due_for_gmail_digest() -> list:
    now = datetime.now().strftime("%H:%M")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT gt.*, u.name, u.email as notify_email FROM google_tokens gt
               JOIN users u ON gt.user_id = u.id
               WHERE gt.digest_enabled = 1
               AND gt.digest_time = ?
               AND u.email IS NOT NULL""",
            (now,)
        ) as c:
            return [dict(r) for r in await c.fetchall()]


# ── Email account (IMAP / legacy) ─────────────────────────────────────────────

async def save_email_account(
    user_id: int, gmail_address: str, app_password: str,
    digest_time: str, digest_enabled: bool
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO email_accounts
               (user_id, gmail_address, app_password, digest_time, digest_enabled)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                 gmail_address=excluded.gmail_address,
                 app_password=excluded.app_password,
                 digest_time=excluded.digest_time,
                 digest_enabled=excluded.digest_enabled""",
            (user_id, gmail_address, app_password, digest_time, int(digest_enabled))
        )
        await db.commit()


async def get_email_account(user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM email_accounts WHERE user_id = ?", (user_id,)
        ) as c:
            row = await c.fetchone()
            return dict(row) if row else None


async def delete_email_account(user_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM email_accounts WHERE user_id = ?", (user_id,))
        await db.commit()


# ── Cleanup ───────────────────────────────────────────────────────────────────

async def cleanup_old_data():
    """Delete past events and old completed tasks to keep the DB light."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            DELETE FROM events
            WHERE datetime(event_date || ' ' || COALESCE(event_time, '23:59'))
                  < datetime('now', '-1 hour')
        """)
        await db.execute("""
            DELETE FROM tasks
            WHERE done = 1
            AND datetime(created_at, '+3 days') < datetime('now')
        """)
        await db.execute("""
            UPDATE tasks SET reminder_at = NULL
            WHERE reminder_at IS NOT NULL
            AND datetime(reminder_at) < datetime('now', '-5 minutes')
        """)
        # Clean expired tokens
        await db.execute("""
            DELETE FROM reset_tokens
            WHERE datetime(created_at, '+1 hour') < datetime('now')
        """)
        await db.execute("""
            DELETE FROM link_codes
            WHERE datetime(created_at, '+10 minutes') < datetime('now')
        """)
        await db.commit()


# ── Notes ─────────────────────────────────────────────────────────────────────

async def get_notes(user_id: int) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, content, tag, color, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,)
        ) as c:
            return [dict(r) for r in await c.fetchall()]


async def add_note(user_id: int, title: str, content: str = "", tag: str = "personal", color: str = "gold") -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "INSERT INTO notes (user_id, title, content, tag, color) VALUES (?, ?, ?, ?, ?) RETURNING id",
            (user_id, title, content, tag, color)
        ) as c:
            row = await c.fetchone()
            await db.commit()
            return row[0] if row else None


async def update_note(note_id: int, user_id: int, title: str, content: str, tag: str, color: str = "gold"):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE notes SET title=?, content=?, tag=?, color=?, updated_at=datetime('now') WHERE id=? AND user_id=?",
            (title, content, tag, color, note_id, user_id)
        )
        await db.commit()


async def delete_note(note_id: int, user_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM notes WHERE id=? AND user_id=?", (note_id, user_id))
        await db.commit()
