import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
import models
import schemas

router = APIRouter()


def _serialize(txn: models.Transaction) -> dict:
    return {
        "id": txn.id,
        "account_id": txn.account_id,
        "type": txn.type,
        "amount": txn.amount,
        "description": txn.description,
        "date": txn.date,
        "created_at": txn.created_at,
        "account_name": txn.account.name if txn.account else None,
        "account_type": txn.account.type if txn.account else None,
        "category": txn.category,
        "is_recurring": txn.is_recurring or False,
    }


@router.get("/", response_model=list[schemas.TransactionResponse])
def list_transactions(
    account_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
    )
    if account_id is not None:
        q = q.filter(models.Transaction.account_id == account_id)
    txns = q.order_by(models.Transaction.date.desc()).all()
    return [_serialize(t) for t in txns]


@router.post("/", response_model=schemas.TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    data: schemas.TransactionCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.query(models.Account).filter(
        models.Account.id == data.account_id,
        models.Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(404, detail="Account not found")

    if data.type not in ("deposit", "withdrawal"):
        raise HTTPException(400, detail="type must be 'deposit' or 'withdrawal'")

    if data.amount <= 0:
        raise HTTPException(400, detail="amount must be positive")

    txn = models.Transaction(
        account_id=account.id,
        type=data.type,
        amount=data.amount,
        description=data.description,
        date=data.date or datetime.utcnow(),
        category=data.category,
        is_recurring=data.is_recurring,
    )
    db.add(txn)

    if data.type == "deposit":
        account.balance += data.amount
    else:
        account.balance -= data.amount

    db.commit()
    db.refresh(txn)
    return _serialize(txn)


@router.patch("/{txn_id}", response_model=schemas.TransactionResponse)
def update_transaction(
    txn_id: int,
    data: schemas.TransactionUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txn = _get_owned_txn(txn_id, current_user.id, db)
    if data.description is not None:
        txn.description = data.description
    if data.date is not None:
        txn.date = data.date
    if data.category is not None:
        txn.category = data.category
    if data.is_recurring is not None:
        txn.is_recurring = data.is_recurring
    db.commit()
    db.refresh(txn)
    return _serialize(txn)


@router.delete("/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    txn_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txn = _get_owned_txn(txn_id, current_user.id, db)
    account = txn.account

    # Reverse the balance effect
    if txn.type == "deposit":
        account.balance -= txn.amount
    else:
        account.balance += txn.amount

    db.delete(txn)
    db.commit()


@router.post("/apply-recurring")
def apply_recurring(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    templates = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(
            models.Account.user_id == current_user.id,
            models.Transaction.is_recurring == True,
        )
        .all()
    )

    created = 0
    for tmpl in templates:
        already_exists = (
            db.query(models.Transaction)
            .filter(
                models.Transaction.account_id == tmpl.account_id,
                models.Transaction.type == tmpl.type,
                models.Transaction.amount == tmpl.amount,
                models.Transaction.description == tmpl.description,
                models.Transaction.date >= month_start,
            )
            .first()
        )
        if not already_exists:
            new_txn = models.Transaction(
                account_id=tmpl.account_id,
                type=tmpl.type,
                amount=tmpl.amount,
                description=tmpl.description,
                category=tmpl.category,
                date=now,
                is_recurring=False,
            )
            db.add(new_txn)
            if tmpl.type == "deposit":
                tmpl.account.balance += tmpl.amount
            else:
                tmpl.account.balance -= tmpl.amount
            created += 1

    db.commit()
    return {"created": created}


@router.post("/import")
async def import_csv(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(404, detail="Account not found")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, detail="File must be a CSV")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # strips BOM if present
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, detail="CSV has no headers")

    # Normalize headers for flexible matching
    headers = {h.strip().lower(): h for h in reader.fieldnames}

    date_col = _find_col(headers, ["transaction date", "date", "posted date", "post date"])
    amount_col = _find_col(headers, ["amount"])
    desc_col = _find_col(headers, ["description", "payee", "memo", "name", "narrative", "details"])

    if not date_col or not amount_col:
        raise HTTPException(400, detail="CSV must have at least a date column and an amount column")

    imported, skipped = 0, []
    balance_delta = 0.0

    for i, row in enumerate(reader, start=2):
        try:
            raw_amount = row[amount_col].strip().replace("$", "").replace(",", "")
            amount = float(raw_amount)
        except (ValueError, KeyError):
            skipped.append(f"Row {i}: invalid amount")
            continue

        try:
            raw_date = row[date_col].strip()
            txn_date = _parse_date(raw_date)
        except ValueError:
            skipped.append(f"Row {i}: unrecognized date '{row[date_col].strip()}'")
            continue

        if amount == 0:
            skipped.append(f"Row {i}: zero amount")
            continue

        txn_type = "deposit" if amount > 0 else "withdrawal"
        abs_amount = abs(amount)
        description = row[desc_col].strip() if desc_col and desc_col in row else ""

        txn = models.Transaction(
            account_id=account.id,
            type=txn_type,
            amount=abs_amount,
            description=description,
            date=txn_date,
        )
        db.add(txn)
        balance_delta += amount
        imported += 1

    account.balance += balance_delta
    db.commit()

    return {"imported": imported, "skipped": len(skipped), "skipped_details": skipped[:10]}


def _find_col(headers: dict, candidates: list[str]) -> str | None:
    for name in candidates:
        if name in headers:
            return headers[name]
    # Partial match fallback
    for name in candidates:
        for h in headers:
            if name in h:
                return headers[h]
    return None


def _parse_date(raw: str) -> datetime:
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {raw}")


def _get_owned_txn(txn_id: int, user_id: int, db: Session) -> models.Transaction:
    txn = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Transaction.id == txn_id, models.Account.user_id == user_id)
        .first()
    )
    if not txn:
        raise HTTPException(404, detail="Transaction not found")
    return txn
