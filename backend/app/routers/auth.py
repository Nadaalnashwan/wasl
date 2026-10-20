from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import get_current_user, get_db
from app.models import User
from app.security.auth import create_local_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=200)


class LoginIn(BaseModel):
    email: str = Field(max_length=320)  # lookup only; format is validated at registration
    password: str = Field(max_length=128)


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    headline: str | None = Field(default=None, max_length=300)
    locale: str | None = Field(default=None, pattern="^(en|ar)$")


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "headline": u.headline, "locale": u.locale,
            "created_at": u.created_at.isoformat()}


@router.get("/config")
def auth_config():
    return {"mode": settings.auth_mode}


def _local_only():
    if settings.auth_mode != "local":
        raise HTTPException(400, "Password sign-in is handled by Supabase Auth in this deployment.")


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    _local_only()
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists.")
    u = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip())
    db.add(u)
    db.commit()
    return {"access_token": create_local_token(u.id), "token_type": "bearer", "user": user_out(u)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    _local_only()
    u = db.scalar(select(User).where(User.email == body.email.lower()))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    return {"access_token": create_local_token(u.id), "token_type": "bearer", "user": user_out(u)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v.strip() if isinstance(v, str) else v)
    db.add(user)
    db.commit()
    return user_out(user)


@router.delete("/me", status_code=204)
def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Deletes the account and all owned data (cascade)."""
    db.delete(user)
    db.commit()
