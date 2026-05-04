from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        errors = []
        if len(v) < 12:
            errors.append("at least 12 characters")
        if not any(c.isupper() for c in v):
            errors.append("an uppercase letter")
        if not any(c.islower() for c in v):
            errors.append("a lowercase letter")
        if not any(c.isdigit() for c in v):
            errors.append("a number")
        if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in v):
            errors.append("a special character")
        if errors:
            raise ValueError("Password must contain: " + ", ".join(errors))
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str


# ── Accounts ──────────────────────────────────────────────────────────────────

VALID_ACCOUNT_TYPES = {"roth_ira", "hysa", "taxable", "checking"}


class AccountCreate(BaseModel):
    name: str
    type: str
    initial_balance: float = 0.0


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    type: str
    balance: float
    created_at: datetime


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    account_id: int
    type: str  # deposit | withdrawal
    amount: float
    description: str = ""
    date: Optional[datetime] = None


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    date: Optional[datetime] = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    type: str
    amount: float
    description: str
    date: datetime
    created_at: datetime
    account_name: Optional[str] = None
    account_type: Optional[str] = None


# ── Goals ─────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    target_date: Optional[datetime] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    target_date: Optional[datetime] = None


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    target_amount: float
    current_amount: float
    target_date: Optional[datetime] = None
    created_at: datetime
