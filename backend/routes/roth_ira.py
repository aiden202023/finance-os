import json
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
import models
import schemas

router = APIRouter()


def _get_or_create(user_id: int, db: Session) -> models.RothIRARecord:
    record = db.query(models.RothIRARecord).filter(
        models.RothIRARecord.user_id == user_id
    ).first()
    if not record:
        record = models.RothIRARecord(user_id=user_id)
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


def _to_response(record: models.RothIRARecord) -> schemas.RothIRAResponse:
    allocations = None
    if record.allocations:
        try:
            allocations = [schemas.RothIRAAllocation(**a) for a in json.loads(record.allocations)]
        except Exception:
            allocations = None
    return schemas.RothIRAResponse(
        balance=record.balance,
        contributed=record.contributed,
        allocations=allocations,
    )


@router.get("/", response_model=schemas.RothIRAResponse)
def get_roth_ira(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = _get_or_create(current_user.id, db)
    current_year = datetime.now().year
    # Reset contributed amount when a new tax year begins
    if record.contributed_year and record.contributed_year != current_year:
        record.contributed = 0.0
        record.contributed_year = current_year
        db.commit()
    return _to_response(record)


@router.put("/", response_model=schemas.RothIRAResponse)
def update_roth_ira(
    data: schemas.RothIRAUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = _get_or_create(current_user.id, db)
    record.balance = data.balance
    record.contributed = data.contributed
    record.contributed_year = datetime.now().year
    if data.allocations is not None:
        record.allocations = json.dumps([a.model_dump() for a in data.allocations])
    db.commit()
    return _to_response(record)
