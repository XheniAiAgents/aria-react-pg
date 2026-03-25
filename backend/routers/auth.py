"""
ARIA v4 — Auth router (JWT version)
"""
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.database import (
    get_or_create_user, get_user_by_id,
    register_user, login_user,
    create_reset_token, verify_reset_token, reset_password,
    verify_password, hash_password,
    get_pool,
)
from backend.email_service import send_welcome_email, send_reset_email
from backend.routers.jwt_auth import create_token, get_current_user
from fastapi import Depends

router  = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class RegisterRequest(BaseModel):
    name:     str
    email:    str
    password: str

class EmailLoginRequest(BaseModel):
    email:    str
    password: str

class LoginRequest(BaseModel):
    name:        str
    telegram_id: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str


@router.post("/auth/register")
@limiter.limit("10/minute")
async def auth_register(req: RegisterRequest, request: Request):
    if not req.name.strip() or not req.email.strip() or not req.password:
        raise HTTPException(400, "Name, email and password are required")
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user = await register_user(req.name, req.email, req.password)
    if not user:
        raise HTTPException(409, "Email already registered")
    asyncio.create_task(send_welcome_email(req.email, req.name.strip()))
    token = create_token(user["id"], user["name"], user["email"])
    safe_user = {k: v for k, v in user.items() if k not in ("password_hash", "password_salt")}
    return {"user": safe_user, "token": token}


@router.post("/auth/login")
@limiter.limit("20/minute")
async def auth_login(req: EmailLoginRequest, request: Request):
    user = await login_user(req.email, req.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")
    if user.get("is_disabled"):
        raise HTTPException(403, "Account disabled. Please contact support.")
    token = create_token(user["id"], user["name"], user["email"])
    safe_user = {k: v for k, v in user.items() if k not in ("password_hash", "password_salt")}
    return {"user": safe_user, "token": token}


@router.post("/login")
async def legacy_login(req: LoginRequest):
    """Legacy Telegram bot login — do not use from frontend."""
    if not req.name.strip():
        raise HTTPException(400, "Name required")
    user = await get_or_create_user(req.name.strip(), req.telegram_id)
    return {"user": user}


@router.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(req: ForgotPasswordRequest, request: Request):
    token = await create_reset_token(req.email.strip().lower())
    if token:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row  = await conn.fetchrow(
                "SELECT name FROM users WHERE LOWER(email) = LOWER($1)", req.email
            )
            name = row["name"] if row else "there"
        asyncio.create_task(send_reset_email(req.email.strip().lower(), name, token))
    return {"status": "If that email exists, a reset link has been sent."}


@router.get("/auth/verify-reset-token")
async def check_reset_token(token: str):
    user = await verify_reset_token(token)
    if not user:
        raise HTTPException(400, "Invalid or expired token")
    return {"valid": True, "name": user["name"]}


@router.post("/auth/reset-password")
async def do_reset_password(req: ResetPasswordRequest):
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    success = await reset_password(req.token, req.new_password)
    if not success:
        raise HTTPException(400, "Invalid or expired token")
    return {"status": "Password updated successfully"}


@router.post("/auth/change-password")
async def change_password(req: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    user = await get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    if not user.get("password_hash"):
        raise HTTPException(400, "No password set")
    if not verify_password(req.current_password, user["password_hash"], user["password_salt"]):
        raise HTTPException(401, "Current password is incorrect")
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    hashed, salt = hash_password(req.new_password)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET password_hash=$1, password_salt=$2 WHERE id=$3",
            hashed, salt, int(current_user["sub"]),
        )
    return {"status": "Password updated"}


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Validate token and return current user info."""
    return {"user_id": int(current_user["sub"]), "name": current_user["name"], "email": current_user["email"]}
