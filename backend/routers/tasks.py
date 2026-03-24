"""
ARIA v4 — Tasks router
"""
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from backend.database import get_tasks, add_task, complete_task, delete_task, update_task

router = APIRouter()


class TaskCreate(BaseModel):
    user_id: int
    title: str
    reminder_at: Optional[str] = None

class TaskUpdate(BaseModel):
    user_id: int
    title: str
    reminder_at: Optional[str] = None


@router.get("/tasks/{user_id}")
async def get_tasks_endpoint(user_id: int, only_pending: bool = True):
    return {"tasks": await get_tasks(user_id, only_pending)}


@router.post("/tasks")
async def create_task(req: TaskCreate):
    task_id = await add_task(req.user_id, req.title, req.reminder_at)
    return {"task_id": task_id}


@router.post("/tasks/{task_id}/complete")
async def complete_task_endpoint(task_id: int, user_id: int):
    await complete_task(task_id, user_id)
    return {"status": "completed"}


@router.delete("/tasks/{task_id}")
async def delete_task_endpoint(task_id: int, user_id: int):
    await delete_task(task_id, user_id)
    return {"status": "deleted"}


@router.put("/tasks/{task_id}")
async def update_task_endpoint(task_id: int, req: TaskUpdate):
    await update_task(task_id, req.user_id, req.title, req.reminder_at)
    return {"status": "updated"}
