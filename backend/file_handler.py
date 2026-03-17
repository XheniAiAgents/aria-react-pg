"""
ARIA file handler — extracts text from uploaded files
Supports: PDF, DOCX, TXT, images (via Groq vision)
"""
import os
import base64
from pathlib import Path

async def extract_text_from_file(file_bytes: bytes, filename: str, mime_type: str) -> dict:
    """
    Returns: { "text": str, "type": "document"|"image", "name": str }
    """
    name = filename
    ext = Path(filename).suffix.lower()

    # ── IMAGES ──────────────────────────────────────────────────────────────
    if mime_type.startswith("image/") or ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        return {
            "type": "image",
            "name": name,
            "b64": b64,
            "mime_type": mime_type or "image/jpeg",
            "text": None
        }

    # ── PDF ──────────────────────────────────────────────────────────────────
    if mime_type == "application/pdf" or ext == ".pdf":
        try:
            import pypdf
            import io
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            text = "\n\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()
            if not text:
                text = "[PDF contains no extractable text — may be scanned/image-based]"
            return {"type": "document", "name": name, "text": text[:12000]}
        except ImportError:
            return {"type": "document", "name": name, "text": "[pypdf not installed — cannot read PDF]"}
        except Exception as e:
            return {"type": "document", "name": name, "text": f"[Error reading PDF: {e}]"}

    # ── WORD DOCX ────────────────────────────────────────────────────────────
    if ext in [".docx", ".doc"] or "wordprocessingml" in mime_type:
        try:
            import docx
            import io
            doc = docx.Document(io.BytesIO(file_bytes))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return {"type": "document", "name": name, "text": text[:12000]}
        except ImportError:
            return {"type": "document", "name": name, "text": "[python-docx not installed — cannot read Word file]"}
        except Exception as e:
            return {"type": "document", "name": name, "text": f"[Error reading Word file: {e}]"}

    # ── PLAIN TEXT / MARKDOWN / CSV ──────────────────────────────────────────
    if ext in [".txt", ".md", ".csv", ".json", ".xml", ".html"] or mime_type.startswith("text/"):
        try:
            text = file_bytes.decode("utf-8", errors="replace")
            return {"type": "document", "name": name, "text": text[:12000]}
        except Exception as e:
            return {"type": "document", "name": name, "text": f"[Error reading text file: {e}]"}

    # ── UNSUPPORTED ──────────────────────────────────────────────────────────
    return {
        "type": "document",
        "name": name,
        "text": f"[Unsupported file type: {ext}]"
    }
