"""
ARIA v4 — Notes router
"""
from fastapi import APIRouter
from pydantic import BaseModel
from backend.database import get_notes, add_note, update_note, delete_note

router = APIRouter()


class NoteCreate(BaseModel):
    user_id: int
    title: str = "Untitled"
    content: str = ""
    tag: str = "personal"
    color: str = "gold"

class NoteUpdate(BaseModel):
    user_id: int
    title: str
    content: str
    tag: str = "personal"
    color: str = "gold"


@router.get("/notes/{user_id}")
async def get_notes_endpoint(user_id: int):
    return {"notes": await get_notes(user_id)}


@router.post("/notes")
async def create_note(req: NoteCreate):
    note_id = await add_note(req.user_id, req.title, req.content, req.tag, req.color)
    return {"note_id": note_id}


@router.put("/notes/{note_id}")
async def update_note_endpoint(note_id: int, req: NoteUpdate):
    await update_note(note_id, req.user_id, req.title, req.content, req.tag, req.color)
    return {"status": "updated"}


@router.delete("/notes/{note_id}")
async def delete_note_endpoint(note_id: int, user_id: int):
    await delete_note(note_id, user_id)
    return {"status": "deleted"}
