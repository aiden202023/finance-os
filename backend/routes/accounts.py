from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
import models
import schemas

router = APIRouter()


@router.get("/", response_model=list[schemas.AccountResponse])
def list_accounts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.Account).filter(models.Account.user_id == current_user.id).all()


@router.post("/", response_model=schemas.AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    data: schemas.AccountCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.type not in schemas.VALID_ACCOUNT_TYPES:
        raise HTTPException(400, detail=f"type must be one of {schemas.VALID_ACCOUNT_TYPES}")

    account = models.Account(
        user_id=current_user.id,
        name=data.name,
        type=data.type,
        balance=data.initial_balance,
    )
    db.add(account)
    db.flush()

    if data.initial_balance > 0:
        txn = models.Transaction(
            account_id=account.id,
            type="deposit",
            amount=data.initial_balance,
            description="Initial balance",
            date=datetime.utcnow(),
        )
        db.add(txn)

    db.commit()
    db.refresh(account)
    return account


@router.get("/{account_id}", response_model=schemas.AccountResponse)
def get_account(
    account_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _get_owned(account_id, current_user.id, db)
    return account


@router.patch("/{account_id}", response_model=schemas.AccountResponse)
def update_account(
    account_id: int,
    data: schemas.AccountUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _get_owned(account_id, current_user.id, db)
    if data.name is not None:
        account.name = data.name
    if data.type is not None:
        if data.type not in schemas.VALID_ACCOUNT_TYPES:
            raise HTTPException(400, detail="Invalid account type")
        account.type = data.type
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _get_owned(account_id, current_user.id, db)
    db.delete(account)
    db.commit()


def _get_owned(account_id: int, user_id: int, db: Session) -> models.Account:
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == user_id,
    ).first()
    if not account:
        raise HTTPException(404, detail="Account not found")
    return account
