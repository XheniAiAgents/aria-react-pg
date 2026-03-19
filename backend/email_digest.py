import imaplib
import email
from email.header import decode_header
from datetime import datetime, date
import os
import anthropic
from dotenv import load_dotenv
load_dotenv()

def get_client():
    return anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def decode_str(s):
    if s is None:
        return ""
    parts = decode_header(s)
    result = []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(part)
    return " ".join(result)

def get_body(msg) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
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
    return body[:2000]

def fetch_todays_emails(gmail_address: str, app_password: str) -> list[dict]:
    emails = []
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_address, app_password)
        mail.select("INBOX")
        today = date.today().strftime("%d-%b-%Y")
        _, data = mail.search(None, f'(SINCE "{today}")')
        ids = data[0].split()
        for uid in ids[-30:]:
            _, msg_data = mail.fetch(uid, "(RFC822)")
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)
            emails.append({
                "from": decode_str(msg.get("From", "")),
                "subject": decode_str(msg.get("Subject", "(no subject)")),
                "date": decode_str(msg.get("Date", "")),
                "body": get_body(msg),
            })
        mail.logout()
    except imaplib.IMAP4.error as e:
        raise ValueError(f"IMAP login failed: {e}")
    except Exception as e:
        raise ValueError(f"Could not fetch emails: {e}")
    return emails

def summarize_emails(emails: list[dict], user_name: str) -> str:
    if not emails:
        return f"Hi {user_name}, you have no emails today. Enjoy the quiet!"

    email_text = ""
    for i, e in enumerate(emails, 1):
        email_text += f"\n--- Email {i} ---\nFrom: {e['from']}\nSubject: {e['subject']}\nBody: {e['body'][:500]}\n"

    prompt = f"""You are ARIA. Summarize these {len(emails)} emails for {user_name} in max 3 bullet points.
Be very brief — one short line per email. Flag anything urgent with ⚠️.

EMAILS:
{email_text}

Write the summary now (max 3 bullets, very short):"""

    client = get_client()
    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text

def test_imap_connection(gmail_address: str, app_password: str) -> bool:
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_address, app_password)
        mail.logout()
        return True
    except Exception:
        return False
