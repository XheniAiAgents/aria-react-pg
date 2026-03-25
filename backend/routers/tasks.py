"""
ARIA v4 — Tasks router (JWT protected)
"""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.database import get_tasks, add_task, complete_task, delete_task, update_task
from backend.routers.jwt_auth import get_current_user

router = APIRouter()


class TaskCreate(BaseModel):
    title: str
    reminder_at: Optional[str] = None

class TaskUpdate(BaseModel):
    title: str
    reminder_at: Optional[str] = None


@router.get("/tasks")
async def get_tasks_endpoint(only_pending: bool = True, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    return {"tasks": await get_tasks(user_id, only_pending)}


@router.post("/tasks")
async def create_task(req: TaskCreate, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    task_id = await add_task(user_id, req.title, req.reminder_at)
    return {"task_id": task_id}


@router.post("/tasks/{task_id}/complete")
async def complete_task_endpoint(task_id: int, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    await complete_task(task_id, user_id)
    return {"status": "completed"}


@router.delete("/tasks/{task_id}")
async def delete_task_endpoint(task_id: int, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    await delete_task(task_id, user_id)
    return {"status": "deleted"}


@router.put("/tasks/{task_id}")
async def update_task_endpoint(task_id: int, req: TaskUpdate, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    await update_task(task_id, user_id, req.title, req.reminder_at)
    return {"status": "updated"}
