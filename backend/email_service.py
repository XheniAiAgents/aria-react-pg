"""
ARIA v4 — Transactional emails via Resend
"""

import os
import re
from datetime import datetime
import resend
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY")

FROM_EMAIL = "ARIA <onboarding@resend.dev>"
APP_URL = os.getenv("APP_URL", "http://127.0.0.1:8000")


# ── HTML templates ────────────────────────────────────────────────────────────

def _base_card(content: str) -> str:
    """Shared card wrapper for all emails."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#050407;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#050407;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#100e1a;
                    border:1px solid rgba(237,233,244,0.06);
                    border-radius:20px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="padding:40px 40px 28px;text-align:center;
                     background:linear-gradient(180deg,rgba(124,107,255,0.12),transparent);">
            <div style="font-size:48px;font-weight:300;color:#c9a84c;
                        letter-spacing:0.1em;font-family:Georgia,serif;">ARIA</div>
            <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;
                        color:rgba(237,233,244,0.35);margin-top:6px;">Personal Intelligence</div>
          </td>
        </tr>

        {content}

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(237,233,244,0.05);
                     text-align:center;">
            <p style="font-size:11px;color:rgba(237,233,244,0.2);margin:0;">
              ARIA · Personal Intelligence
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _welcome_html(name: str) -> str:
    content = f"""
        <tr>
          <td style="padding:0 40px 36px;">
            <p style="font-size:22px;color:#ede9f4;font-weight:300;margin:0 0 16px;">
              Welcome, {name}.
            </p>
            <p style="font-size:14px;color:rgba(237,233,244,0.6);line-height:1.8;margin:0 0 24px;">
              Your personal AI is ready. ARIA will help you stay organized,
              remember what matters, and think through anything — at work or in life.
            </p>
            <p style="font-size:14px;color:rgba(237,233,244,0.6);line-height:1.8;margin:0 0 32px;">
              Start by saying hello. ARIA learns as you talk.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center">
                <a href="{APP_URL}"
                   style="display:inline-block;padding:14px 36px;
                          background:linear-gradient(135deg,#7c6bff,#5a4acc);
                          color:white;text-decoration:none;border-radius:10px;
                          font-size:13px;letter-spacing:0.08em;">
                  Open ARIA
                </a>
              </td></tr>
            </table>
          </td>
        </tr>"""
    return _base_card(content)


def _reset_html(name: str, reset_url: str) -> str:
    content = f"""
        <tr>
          <td style="padding:0 40px 36px;">
            <p style="font-size:22px;color:#ede9f4;font-weight:300;margin:0 0 16px;">
              Password reset
            </p>
            <p style="font-size:14px;color:rgba(237,233,244,0.6);line-height:1.8;margin:0 0 8px;">
              Hi {name}, we received a request to reset your password.
            </p>
            <p style="font-size:14px;color:rgba(237,233,244,0.6);line-height:1.8;margin:0 0 32px;">
              Click the button below. This link expires in
              <strong style="color:#ede9f4;">1 hour</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center">
                <a href="{reset_url}"
                   style="display:inline-block;padding:14px 36px;
                          background:linear-gradient(135deg,#7c6bff,#5a4acc);
                          color:white;text-decoration:none;border-radius:10px;
                          font-size:13px;letter-spacing:0.08em;">
                  Reset Password
                </a>
              </td></tr>
            </table>
            <p style="font-size:11px;color:rgba(237,233,244,0.3);
                      text-align:center;margin:20px 0 0;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </td>
        </tr>"""
    return _base_card(content)


def _digest_html(name: str, summary: str, email_count: int, digest_time: str) -> str:
    html_summary = summary.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    html_summary = re.sub(
        r'\*\*(.*?)\*\*',
        r'<strong style="color:#ede9f4">\1</strong>',
        html_summary
    )
    html_summary = html_summary.replace("\n", "<br>")
    now_str = datetime.now().strftime("%A, %d %B %Y")
    s = "s" if email_count != 1 else ""

    content = f"""
        <tr>
          <td style="padding:20px 40px 8px;">
            <p style="font-size:20px;color:#ede9f4;font-weight:300;margin:0 0 6px;">
              Good day, {name}.
            </p>
            <p style="font-size:12px;color:rgba(237,233,244,0.45);margin:0;">
              You received
              <strong style="color:#a599ff;">{email_count}</strong>
              email{s} today. Here's what matters.
            </p>
            <div style="font-size:10px;color:rgba(237,233,244,0.3);margin-top:4px;">
              {now_str}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px;">
            <div style="height:1px;background:rgba(237,233,244,0.06);"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;">
            <div style="font-size:8px;letter-spacing:0.28em;text-transform:uppercase;
                        color:rgba(237,233,244,0.3);margin-bottom:14px;">Summary</div>
            <div style="font-size:13px;color:rgba(237,233,244,0.75);line-height:1.85;">
              {html_summary}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 28px;" align="center">
            <a href="{APP_URL}"
               style="display:inline-block;padding:12px 32px;
                      background:linear-gradient(135deg,#7c6bff,#5a4acc);
                      color:white;text-decoration:none;border-radius:10px;
                      font-size:12px;letter-spacing:0.08em;">
              Open ARIA
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 16px;text-align:center;">
            <p style="font-size:10px;color:rgba(237,233,244,0.2);margin:0;">
              Digest scheduled at {digest_time} · Manage in ARIA settings
            </p>
          </td>
        </tr>"""
    return _base_card(content)


# ── Send functions ────────────────────────────────────────────────────────────

async def send_welcome_email(to_email: str, name: str):
    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [to_email],
            "subject": f"Welcome to ARIA, {name}.",
            "html": _welcome_html(name),
        })
    except Exception as e:
        print(f"[email] Welcome email failed: {e}")


async def send_reset_email(to_email: str, name: str, token: str):
    reset_url = f"{APP_URL}/?token={token}"
    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [to_email],
            "subject": "Reset your ARIA password",
            "html": _reset_html(name, reset_url),
        })
    except Exception as e:
        print(f"[email] Reset email failed: {e}")


async def send_digest_email(
    to_email: str, name: str, summary: str,
    email_count: int, digest_time: str
):
    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [to_email],
            "subject": f"ARIA · Your email digest — {datetime.now().strftime('%d %b')}",
            "html": _digest_html(name, summary, email_count, digest_time),
        })
    except Exception as e:
        print(f"[email] Digest email failed: {e}")
