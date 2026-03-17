import imaplib
import email
from email.header import decode_header
from datetime import datetime, date
import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


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
    """Extract plain text body from email message."""
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
    return body[:2000]  # cap at 2000 chars per email


def fetch_todays_emails(gmail_address: str, app_password: str) -> list[dict]:
    """Connect to Gmail via IMAP and fetch today's emails."""
    emails = []
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_address, app_password)
        mail.select("INBOX")

        today = date.today().strftime("%d-%b-%Y")
        _, data = mail.search(None, f'(SINCE "{today}")')
        ids = data[0].split()

        # Limit to last 30 emails to avoid huge payloads
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
    """Use Groq to summarize today's emails."""
    if not emails:
        return f"Hi {user_name}, you have no emails today. Enjoy the quiet! 🌿"

    email_text = ""
    for i, e in enumerate(emails, 1):
        email_text += f"\n--- Email {i} ---\nFrom: {e['from']}\nSubject: {e['subject']}\nBody: {e['body'][:500]}\n"

    prompt = f"""You are ARIA, a personal AI assistant. The user is {user_name}.
Summarize the following {len(emails)} emails received today in a clear, friendly digest.
Group by topic/sender if relevant. Highlight anything that seems urgent or important.
Keep it concise — bullet points with brief context. End with a one-line overall impression.

EMAILS:
{email_text}

Write the summary now:"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.5,
    )
    return response.choices[0].message.content


def test_imap_connection(gmail_address: str, app_password: str) -> bool:
    """Test if credentials work without fetching emails."""
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_address, app_password)
        mail.logout()
        return True
    except Exception:
        return False
