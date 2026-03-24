"""
ARIA v4 — Chat router
Covers: /chat, /chat/file, /memories, /history
"""
import os
from fastapi import APIRouter, HTTPException, Request, File, UploadFile, Form
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.database import (
    get_conversation_history,
    get_memories, delete_memory,
)
from backend.aria import chat
from backend.file_handler import extract_text_from_file

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# ── Request models ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    user_id: int
    mode: str = "work"
    lang: str = "en"
    user_local_time: str = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/history/{user_id}")
async def get_history(user_id: int, mode: str = "work", limit: int = 30):
    history = await get_conversation_history(user_id, mode=mode, limit=limit)
    return {"messages": history}


@router.post("/chat")
@limiter.limit("30/minute")
async def chat_endpoint(req: ChatRequest, request: Request):
    if not req.message.strip():
        raise HTTPException(400, "Empty message")
    try:
        response = await chat(req.user_id, req.message, req.mode, req.lang, req.user_local_time)
        return {"response": response, "mode": req.mode}
    except Exception as e:
        import traceback
        print(f"[chat] ERROR for user {req.user_id}: {e}")
        print(traceback.format_exc())
        raise HTTPException(500, str(e))


@router.post("/chat/file")
async def chat_with_file(
    user_id: int = Form(...),
    mode: str = Form("work"),
    lang: str = Form("en"),
    message: str = Form(""),
    file: UploadFile = File(...),
):
    try:
        file_bytes = await file.read()
        mime_type = file.content_type or ""
        extracted = await extract_text_from_file(file_bytes, file.filename, mime_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if extracted["type"] == "image":
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        user_prompt = message if message.strip() else "Describe this image and extract any useful information."
        try:
            response = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{extracted['mime_type']};base64,{extracted['b64']}"}},
                        {"type": "text", "text": user_prompt}
                    ]
                }]
            )
            aria_response = response.choices[0].message.content
        except Exception:
            aria_response = f"I received your image ({extracted['name']}) but couldn't process it visually."
    else:
        file_context = f"[ATTACHED FILE: {extracted['name']}]\n{extracted['text']}\n[END OF FILE]\n\n"
        user_msg = file_context + (message if message.strip() else "Please analyze this document and give me a summary.")
        aria_response = await chat(user_id, user_msg, mode, lang)

    return {"response": aria_response, "filename": file.filename, "type": extracted["type"]}


@router.get("/memories/{user_id}")
async def get_memories_endpoint(user_id: int):
    return {"memories": await get_memories(user_id)}


@router.delete("/memories/{memory_id}")
async def delete_memory_endpoint(memory_id: int, user_id: int):
    await delete_memory(memory_id, user_id)
    return {"status": "deleted"}
