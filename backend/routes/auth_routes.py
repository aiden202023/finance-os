import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from auth import create_access_token, hash_password, verify_password
from database import get_db
from email_utils import send_reset_email
import models
import schemas

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, data: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Unable to create account with that email")

    user = models.User(
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"access_token": create_access_token(user.id), "token_type": "bearer"}


@router.post("/login", response_model=schemas.Token)
@limiter.limit("10/minute")
def login(request: Request, data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"access_token": create_access_token(user.id), "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(__import__("auth").get_current_user)):
    return current_user


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
def forgot_password(request: Request, data: schemas.ForgotPassword, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    # Always return 202 — never reveal whether the email exists
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        try:
            send_reset_email(user.email, token)
        except Exception as e:
            print(f"[Email error] {e}")
    return {"detail": "If that email exists, a reset link has been sent"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(data: schemas.ResetPassword, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.reset_token == data.token).first()
    if not user or not user.reset_token_expires:
        raise HTTPException(400, detail="Invalid or expired reset link")
    expires = user.reset_token_expires
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(400, detail="Invalid or expired reset link")

    user.hashed_password = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"detail": "Password updated"}
