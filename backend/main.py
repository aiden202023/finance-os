from datetime import datetime, date

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

from auth import get_current_user
from database import Base, engine, get_db
import models
from routes import accounts, auth_routes, goals, transactions

Base.metadata.create_all(bind=engine)

# Migrate existing DB — add columns introduced after initial schema
with engine.connect() as _conn:
    for _col, _typedef in [
        ("reset_token", "TEXT"),
        ("reset_token_expires", "DATETIME"),
    ]:
        try:
            _conn.execute(__import__("sqlalchemy").text(f"ALTER TABLE users ADD COLUMN {_col} {_typedef}"))
            _conn.commit()
        except Exception:
            pass

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Finance OS API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
app.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
app.include_router(goals.router, prefix="/goals", tags=["goals"])


@app.get("/dashboard/summary")
def dashboard_summary(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_accounts = (
        db.query(models.Account).filter(models.Account.user_id == current_user.id).all()
    )
    net_worth = sum(a.balance for a in user_accounts)

    recent_txns = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
        .order_by(models.Transaction.date.desc())
        .limit(5)
        .all()
    )

    return {
        "net_worth": net_worth,
        "accounts_count": len(user_accounts),
        "goals_count": db.query(models.Goal)
        .filter(models.Goal.user_id == current_user.id)
        .count(),
        "accounts": [
            {"id": a.id, "name": a.name, "type": a.type, "balance": a.balance}
            for a in user_accounts
        ],
        "recent_transactions": [
            {
                "id": t.id,
                "account_name": t.account.name,
                "type": t.type,
                "amount": t.amount,
                "description": t.description,
                "date": t.date,
            }
            for t in recent_txns
        ],
    }


@app.get("/dashboard/net-worth-history")
def net_worth_history(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txns = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Account.user_id == current_user.id)
        .order_by(models.Transaction.date.asc())
        .all()
    )

    if not txns:
        # Return current net worth as a single point
        accounts = (
            db.query(models.Account).filter(models.Account.user_id == current_user.id).all()
        )
        net_worth = sum(a.balance for a in accounts)
        return [{"date": date.today().isoformat(), "net_worth": net_worth}]

    # Build daily cumulative snapshots
    daily: dict[str, float] = {}
    running = 0.0
    for t in txns:
        running += t.amount if t.type == "deposit" else -t.amount
        key = t.date.date().isoformat()
        daily[key] = running

    result = [{"date": k, "net_worth": v} for k, v in sorted(daily.items())]

    # Ensure today is included
    today_key = date.today().isoformat()
    if result[-1]["date"] != today_key:
        result.append({"date": today_key, "net_worth": running})

    return result
