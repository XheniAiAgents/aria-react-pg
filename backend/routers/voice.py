"""
ARIA v4 — Voice router
Covers: /voice/transcribe (Groq Whisper STT), /voice/speak (ElevenLabs TTS)
"""
import os
import io
import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq

router = APIRouter(prefix="/voice")


def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(500, "GROQ_API_KEY not configured")
    return Groq(api_key=api_key)


# ── STT: Groq Whisper ─────────────────────────────────────────────────────────

@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    lang: str = Form("en"),
):
    """
    Receive audio blob, return transcribed text via Groq Whisper.
    Supports any language — pass lang hint for better accuracy.
    """
    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(400, "Empty audio file")

        client = get_groq_client()

        # Map lang code to Whisper language hint (optional but improves accuracy)
        lang_hint = lang if lang != "auto" else None

        # Groq expects a file-like with a name so it can detect format
        filename = audio.filename or "recording.webm"

        transcription = client.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
            file=(filename, audio_bytes, audio.content_type or "audio/webm"),
            language=lang_hint,
            response_format="text",
        )

        # transcription is a plain string when response_format="text"
        text = transcription if isinstance(transcription, str) else transcription.text
        return {"text": text.strip()}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[voice/transcribe] ERROR: {e}")
        raise HTTPException(500, f"Transcription failed: {e}")


# ── TTS: ElevenLabs ───────────────────────────────────────────────────────────

class SpeakRequest(BaseModel):
    text: str
    voice_id: str = None   # defaults to env var or "aria" voice


@router.post("/speak")
async def speak(req: SpeakRequest):
    """
    Convert text to speech using ElevenLabs.
    Streams back audio/mpeg so the frontend can play it immediately.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(500, "ELEVENLABS_API_KEY not configured")

    voice_id = req.voice_id or os.getenv("ELEVENLABS_VOICE_ID", "cgSgspJ2msm6clMCkdW9")
    # ^ default: "Jessica" — warm, clear, English/multilingual

    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Empty text")

    # Strip markdown formatting for cleaner speech
    import re
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)   # bold
    text = re.sub(r'\*(.*?)\*',     r'\1', text)    # italic
    text = re.sub(r'`(.*?)`',       r'\1', text)    # inline code
    text = re.sub(r'#{1,6}\s',      '',    text)    # headings
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)  # links

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",   # fast, multilingual
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.80,
            "style": 0.20,
            "use_speaker_boost": True,
        },
        "output_format": "mp3_44100_128",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                err = response.text[:200]
                print(f"[voice/speak] ElevenLabs error {response.status_code}: {err}")
                raise HTTPException(502, f"ElevenLabs error: {response.status_code}")

            audio_data = response.content

        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-cache"},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[voice/speak] ERROR: {e}")
        raise HTTPException(500, f"TTS failed: {e}")
