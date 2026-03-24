"""
ARIA — Web Push helper
"""
import os
from backend.database import delete_push_subscription


async def send_web_push(subscription: dict, title: str, body: str):
    """Send a Web Push notification to a single subscription."""
    try:
        import json, base64
        from pywebpush import webpush, WebPushException

        vapid_private = os.getenv("VAPID_PRIVATE_KEY", "")
        vapid_email   = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:aria@example.com")
        if not vapid_private:
            return

        if "BEGIN" in vapid_private:
            from cryptography.hazmat.primitives.serialization import load_pem_private_key
            pem_str = vapid_private.replace("\\n", "\n")
            privkey = load_pem_private_key(pem_str.encode(), password=None)
            ec_num  = privkey.private_numbers().private_value
            raw_key = ec_num.to_bytes(32, "big")
            vapid_private = base64.urlsafe_b64encode(raw_key).decode().rstrip("=")
            print(f"[push] converted PEM to raw ({len(raw_key)} bytes)")

        endpoint_short = subscription["endpoint"][:60]
        print(f"[push] sending to {endpoint_short}...")
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {
                    "p256dh": subscription["p256dh"],
                    "auth":   subscription["auth"],
                },
            },
            data=json.dumps({"title": title, "body": body, "icon": "/icons/icon-192.png"}),
            vapid_private_key=vapid_private,
            vapid_claims={"sub": vapid_email},
        )
        print(f"[push] sent OK to {endpoint_short}")
    except Exception as wp_err:
        err_str    = str(wp_err)
        endpoint   = subscription.get("endpoint", "")[:60]
        print(f"[push] ERROR for {endpoint}: {wp_err}")
        if "404" in err_str or "410" in err_str:
            await delete_push_subscription(subscription["endpoint"])
