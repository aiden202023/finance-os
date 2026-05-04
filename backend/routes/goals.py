from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
import models
import schemas

router = APIRouter()


@router.get("/", response_model=list[schemas.GoalResponse])
def list_goals(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.Goal).filter(models.Goal.user_id == current_user.id).all()


@router.post("/", response_model=schemas.GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    data: schemas.GoalCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = models.Goal(
        user_id=current_user.id,
        name=data.name,
        target_amount=data.target_amount,
        current_amount=data.current_amount,
        target_date=data.target_date,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.patch("/{goal_id}", response_model=schemas.GoalResponse)
def update_goal(
    goal_id: int,
    data: schemas.GoalUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = _get_owned(goal_id, current_user.id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = _get_owned(goal_id, current_user.id, db)
    db.delete(goal)
    db.commit()


def _get_owned(goal_id: int, user_id: int, db: Session) -> models.Goal:
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == user_id,
    ).first()
    if not goal:
        raise HTTPException(404, detail="Goal not found")
    return goal
