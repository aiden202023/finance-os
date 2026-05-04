import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
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


def _apply_filters(q, account_id, type, category, search, date_from, date_to):
    if account_id is not None:
        q = q.filter(models.Transaction.account_id == account_id)
    if type is not None:
        q = q.filter(models.Transaction.type == type)
    if category is not None:
        q = q.filter(models.Transaction.category == category)
    if search:
        q = q.filter(models.Transaction.description.ilike(f"%{search}%"))
    if date_from:
        q = q.filter(models.Transaction.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Transaction.date <= datetime.fromisoformat(date_to))
    return q


@router.get("/", response_model=list[schemas.TransactionResponse])
def list_transactions(
    account_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
    )
    q = _apply_filters(q, account_id, type, category, search, date_from, date_to)
    txns = q.order_by(models.Transaction.date.desc()).all()
    return [_serialize(t) for t in txns]


@router.get("/export")
def export_transactions(
    account_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
    )
    q = _apply_filters(q, account_id, type, category, search, date_from, date_to)
    txns = q.order_by(models.Transaction.date.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Account", "Account Type", "Type", "Amount", "Description", "Category", "Recurring"])
    for t in txns:
        writer.writerow([
            t.date.date().isoformat(),
            t.account.name if t.account else "",
            t.account.type if t.account else "",
            t.type,
            t.amount,
            t.description,
            t.category or "",
            "yes" if t.is_recurring else "no",
        ])

    output.seek(0)
    filename = f"transactions-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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

    if data.type is not None and data.type not in ("deposit", "withdrawal"):
        raise HTTPException(400, detail="type must be 'deposit' or 'withdrawal'")
    if data.amount is not None and data.amount <= 0:
        raise HTTPException(400, detail="amount must be positive")

    # Recalculate account balance if amount or type is changing
    if data.amount is not None or data.type is not None:
        old_delta = txn.amount if txn.type == "deposit" else -txn.amount
        new_amount = data.amount if data.amount is not None else txn.amount
        new_type = data.type if data.type is not None else txn.type
        new_delta = new_amount if new_type == "deposit" else -new_amount
        txn.account.balance += new_delta - old_delta

    if data.type is not None:
        txn.type = data.type
    if data.amount is not None:
        txn.amount = data.amount
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

    # Only run once per calendar month per user
    last = current_user.recurring_applied_at
    if last and last.year == now.year and last.month == now.month:
        return {"created": 0, "already_applied": True}

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

    current_user.recurring_applied_at = now
    db.commit()
    return {"created": created, "already_applied": False}


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

    MAX_CSV_BYTES = 10 * 1024 * 1024  # 10 MB
    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(400, detail="File too large — maximum size is 10 MB")
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
