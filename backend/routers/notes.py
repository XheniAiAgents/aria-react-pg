"""
ARIA v4 — Notes router (JWT protected)
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.database import get_notes, add_note, update_note, delete_note
from backend.routers.jwt_auth import get_current_user

router = APIRouter()


class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""
    tag: str = "personal"
    color: str = "gold"

class NoteUpdate(BaseModel):
    title: str
    content: str
    tag: str = "personal"
    color: str = "gold"


@router.get("/notes")
async def get_notes_endpoint(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    return {"notes": await get_notes(user_id)}


@router.post("/notes")
async def create_note(req: NoteCreate, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    note_id = await add_note(user_id, req.title, req.content, req.tag, req.color)
    return {"note_id": note_id}


@router.put("/notes/{note_id}")
async def update_note_endpoint(note_id: int, req: NoteUpdate, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    await update_note(note_id, user_id, req.title, req.content, req.tag, req.color)
    return {"status": "updated"}


@router.delete("/notes/{note_id}")
async def delete_note_endpoint(note_id: int, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    await delete_note(note_id, user_id)
    return {"status": "deleted"}
