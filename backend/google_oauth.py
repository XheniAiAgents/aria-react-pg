"""
ARIA v4 — Google OAuth + Gmail fetching
"""

import os
import json
import requests
from urllib.parse import urlencode
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
APP_URL       = os.getenv("APP_URL", "http://127.0.0.1:8000")
REDIRECT_URI  = f"{APP_URL}/auth/google/callback"
SCOPES        = "https://www.googleapis.com/auth/gmail.readonly"


def get_auth_url(user_id: int) -> str:
    params = {
        "client_id":     CLIENT_ID,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         SCOPES,
        "access_type":   "offline",
        "prompt":        "select_account consent",
        "state":         str(user_id),
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)


def exchange_code(code: str) -> dict:
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "code":          code,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri":  REDIRECT_URI,
        "grant_type":    "authorization_code",
    })
    resp.raise_for_status()
    data = resp.json()
    return {
        "access_token":  data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "token_type":    data.get("token_type", "Bearer"),
        "expires_in":    data.get("expires_in"),
    }


def get_access_token(token_data: dict) -> str:
    """Return a valid access token, refreshing automatically if needed."""
    if token_data.get("refresh_token"):
        resp = requests.post("https://oauth2.googleapis.com/token", data={
            "client_id":     CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "refresh_token": token_data["refresh_token"],
            "grant_type":    "refresh_token",
        })
        if resp.ok:
            token_data["access_token"] = resp.json()["access_token"]
    return token_data["access_token"]


def get_gmail_address(token_data: dict) -> str:
    access_token = get_access_token(token_data)
    resp = requests.get(
        "https://www.googleapis.com/gmail/v1/users/me/profile",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    resp.raise_for_status()
    return resp.json().get("emailAddress", "")


def fetch_todays_emails_oauth(token_data: dict) -> list[dict]:
    """Fetch today's emails using the OAuth access token."""
    import email as email_lib
    import base64
    from email.header import decode_header
    from datetime import date

    access_token = get_access_token(token_data)
    headers = {"Authorization": f"Bearer {access_token}"}

    today = date.today().strftime("%Y/%m/%d")
    resp = requests.get(
        "https://www.googleapis.com/gmail/v1/users/me/messages",
        headers=headers,
        params={"q": f"after:{today}", "maxResults": 30}
    )
    resp.raise_for_status()
    messages = resp.json().get("messages", [])

    def decode_str(s):
        if not s:
            return ""
        parts = decode_header(s)
        result = []
        for part, enc in parts:
            if isinstance(part, bytes):
                result.append(part.decode(enc or "utf-8", errors="replace"))
            else:
                result.append(str(part))
        return " ".join(result)

    def get_body(msg):
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if (part.get_content_type() == "text/plain"
                        and "attachment" not in str(part.get("Content-Disposition", ""))):
                    try:
                        body = part.get_payload(decode=True).decode(
                            part.get_content_charset() or "utf-8", errors="replace"
                        )
                        break
                    except Exception:
                        pass
        else:
            try:
                body = msg.get_payload(decode=True).decode(
                    msg.get_content_charset() or "utf-8", errors="replace"
                )
            except Exception:
                pass
        return body[:1500]

    emails = []
    for msg_ref in messages:
        r = requests.get(
            f"https://www.googleapis.com/gmail/v1/users/me/messages/{msg_ref['id']}",
            headers=headers,
            params={"format": "raw"}
        )
        if not r.ok:
            continue
        raw = base64.urlsafe_b64decode(r.json()["raw"].encode("utf-8"))
        parsed = email_lib.message_from_bytes(raw)
        emails.append({
            "from":    decode_str(parsed.get("From", "")),
            "subject": decode_str(parsed.get("Subject", "(no subject)")),
            "date":    decode_str(parsed.get("Date", "")),
            "body":    get_body(parsed),
        })

    return emails
