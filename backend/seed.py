"""
Creates a demo user with realistic sample data.

Usage:
  cd backend
  python3 seed.py

Demo credentials:
  Email:    demo@example.com
  Password: Demo1234!
"""
import json
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
load_dotenv()

from database import Base, engine, SessionLocal
import models
from auth import hash_password

Base.metadata.create_all(bind=engine)

# Apply any pending column migrations (mirrors main.py)
import sqlalchemy as _sa
with engine.connect() as _c:
    for _table, _col, _type in [
        ("users",        "reset_token",           "TEXT"),
        ("users",        "reset_token_expires",    "DATETIME"),
        ("users",        "recurring_applied_at",   "DATETIME"),
        ("transactions", "category",               "TEXT"),
        ("transactions", "is_recurring",           "INTEGER DEFAULT 0"),
        ("roth_ira",     "allocations",            "TEXT"),
    ]:
        try:
            _c.execute(_sa.text(f"ALTER TABLE {_table} ADD COLUMN {_col} {_type}"))
            _c.commit()
        except Exception:
            pass

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "Demo1234!"

def run():
    db = SessionLocal()

    existing = db.query(models.User).filter(models.User.email == DEMO_EMAIL).first()
    if existing:
        print(f"Demo user already exists ({DEMO_EMAIL}). Delete it first to re-seed.")
        db.close()
        sys.exit(0)

    # ── User ─────────────────────────────────────────────────────────────────
    user = models.User(email=DEMO_EMAIL, hashed_password=hash_password(DEMO_PASSWORD))
    db.add(user)
    db.flush()

    # ── Accounts ─────────────────────────────────────────────────────────────
    checking  = models.Account(user_id=user.id, name="Chase Checking",    type="checking",  balance=0)
    hysa      = models.Account(user_id=user.id, name="Marcus HYSA",       type="hysa",      balance=0)
    roth      = models.Account(user_id=user.id, name="Fidelity Roth IRA", type="roth_ira",  balance=0)
    taxable   = models.Account(user_id=user.id, name="Fidelity Taxable",  type="taxable",   balance=0)
    for acct in (checking, hysa, roth, taxable):
        db.add(acct)
    db.flush()

    # ── Transactions ─────────────────────────────────────────────────────────
    today = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0, tzinfo=None)

    def txn(account, type_, amount, description, days_ago, category=None, recurring=False):
        return models.Transaction(
            account_id=account.id,
            type=type_,
            amount=amount,
            description=description,
            date=today - timedelta(days=days_ago),
            category=category,
            is_recurring=recurring,
        )

    transactions = [
        # ── Paychecks (biweekly) ──────────────────────────────────────────
        txn(checking, "deposit",    3_200, "Paycheck — Acme Corp",        1,  "income", True),
        txn(checking, "deposit",    3_200, "Paycheck — Acme Corp",        15, "income", True),
        txn(checking, "deposit",    3_200, "Paycheck — Acme Corp",        29, "income", True),
        txn(checking, "deposit",    3_200, "Paycheck — Acme Corp",        43, "income", True),
        txn(checking, "deposit",    3_200, "Paycheck — Acme Corp",        57, "income", True),
        txn(checking, "deposit",    3_200, "Paycheck — Acme Corp",        71, "income", True),

        # ── Rent ──────────────────────────────────────────────────────────
        txn(checking, "withdrawal", 1_800, "Rent — Oakwood Apartments",   2,  "housing", True),
        txn(checking, "withdrawal", 1_800, "Rent — Oakwood Apartments",   32, "housing", True),
        txn(checking, "withdrawal", 1_800, "Rent — Oakwood Apartments",   62, "housing", True),

        # ── Utilities ─────────────────────────────────────────────────────
        txn(checking, "withdrawal", 95,   "Electric — ConEd",             5,  "housing", True),
        txn(checking, "withdrawal", 95,   "Electric — ConEd",             35, "housing", True),
        txn(checking, "withdrawal", 95,   "Electric — ConEd",             65, "housing", True),
        txn(checking, "withdrawal", 60,   "Internet — Spectrum",          6,  "housing", True),
        txn(checking, "withdrawal", 60,   "Internet — Spectrum",          36, "housing", True),
        txn(checking, "withdrawal", 60,   "Internet — Spectrum",          66, "housing", True),

        # ── Groceries ─────────────────────────────────────────────────────
        txn(checking, "withdrawal", 142,  "Trader Joe's",                 3,  "food & dining"),
        txn(checking, "withdrawal", 98,   "Whole Foods",                  10, "food & dining"),
        txn(checking, "withdrawal", 167,  "Trader Joe's",                 17, "food & dining"),
        txn(checking, "withdrawal", 88,   "Target — Groceries",           24, "food & dining"),
        txn(checking, "withdrawal", 155,  "Trader Joe's",                 31, "food & dining"),
        txn(checking, "withdrawal", 112,  "Whole Foods",                  38, "food & dining"),
        txn(checking, "withdrawal", 144,  "Trader Joe's",                 45, "food & dining"),
        txn(checking, "withdrawal", 91,   "Target — Groceries",           52, "food & dining"),
        txn(checking, "withdrawal", 163,  "Trader Joe's",                 59, "food & dining"),
        txn(checking, "withdrawal", 105,  "Whole Foods",                  66, "food & dining"),

        # ── Dining out ────────────────────────────────────────────────────
        txn(checking, "withdrawal", 54,   "Chipotle",                     4,  "food & dining"),
        txn(checking, "withdrawal", 87,   "Dinner — The Smith",           8,  "food & dining"),
        txn(checking, "withdrawal", 32,   "Sweetgreen",                   12, "food & dining"),
        txn(checking, "withdrawal", 63,   "Brunch — Sadelle's",           19, "food & dining"),
        txn(checking, "withdrawal", 41,   "Chipotle",                     25, "food & dining"),
        txn(checking, "withdrawal", 78,   "Dinner — Don Angie",           33, "food & dining"),
        txn(checking, "withdrawal", 29,   "Sweetgreen",                   40, "food & dining"),
        txn(checking, "withdrawal", 95,   "Brunch — Balthazar",           47, "food & dining"),
        txn(checking, "withdrawal", 44,   "Chipotle",                     54, "food & dining"),
        txn(checking, "withdrawal", 68,   "Dinner — Via Carota",          61, "food & dining"),

        # ── Transport ─────────────────────────────────────────────────────
        txn(checking, "withdrawal", 47,   "Shell — Gas",                  7,  "transport"),
        txn(checking, "withdrawal", 52,   "Shell — Gas",                  21, "transport"),
        txn(checking, "withdrawal", 44,   "BP — Gas",                     35, "transport"),
        txn(checking, "withdrawal", 49,   "Shell — Gas",                  49, "transport"),
        txn(checking, "withdrawal", 51,   "BP — Gas",                     63, "transport"),
        txn(checking, "withdrawal", 18,   "Lyft",                         9,  "transport"),
        txn(checking, "withdrawal", 24,   "Lyft",                         22, "transport"),

        # ── Subscriptions ─────────────────────────────────────────────────
        txn(checking, "withdrawal", 17,   "Netflix",                      6,  "entertainment", True),
        txn(checking, "withdrawal", 17,   "Netflix",                      36, "entertainment", True),
        txn(checking, "withdrawal", 17,   "Netflix",                      66, "entertainment", True),
        txn(checking, "withdrawal", 11,   "Spotify",                      6,  "entertainment", True),
        txn(checking, "withdrawal", 11,   "Spotify",                      36, "entertainment", True),
        txn(checking, "withdrawal", 11,   "Spotify",                      66, "entertainment", True),

        # ── Health ────────────────────────────────────────────────────────
        txn(checking, "withdrawal", 30,   "Equinox Gym",                  8,  "health", True),
        txn(checking, "withdrawal", 30,   "Equinox Gym",                  38, "health", True),
        txn(checking, "withdrawal", 30,   "Equinox Gym",                  68, "health", True),
        txn(checking, "withdrawal", 145,  "CVS Pharmacy",                 14, "health"),
        txn(checking, "withdrawal", 25,   "Co-pay — Dr. Patel",           28, "health"),

        # ── Shopping ──────────────────────────────────────────────────────
        txn(checking, "withdrawal", 67,   "Amazon",                       11, "shopping"),
        txn(checking, "withdrawal", 134,  "Amazon",                       23, "shopping"),
        txn(checking, "withdrawal", 48,   "Amazon",                       41, "shopping"),
        txn(checking, "withdrawal", 89,   "Amazon",                       55, "shopping"),
        txn(checking, "withdrawal", 210,  "Apple — AirPods",              44, "shopping"),

        # ── HYSA transfers ────────────────────────────────────────────────
        txn(checking, "withdrawal", 500,  "Transfer to HYSA",             13, "savings", True),
        txn(hysa,     "deposit",    500,  "Transfer from Checking",       13, "savings"),
        txn(checking, "withdrawal", 500,  "Transfer to HYSA",             43, "savings", True),
        txn(hysa,     "deposit",    500,  "Transfer from Checking",       43, "savings"),
        txn(checking, "withdrawal", 500,  "Transfer to HYSA",             73, "savings", True),
        txn(hysa,     "deposit",    500,  "Transfer from Checking",       73, "savings"),
        txn(hysa,     "deposit",    200,  "HYSA Interest",                5,  "income"),
        txn(hysa,     "deposit",    198,  "HYSA Interest",                35, "income"),
        txn(hysa,     "deposit",    195,  "HYSA Interest",                65, "income"),
        # Starting balance for HYSA
        txn(hysa,     "deposit",    16_907, "Initial balance",            90, "savings"),

        # ── Roth IRA contributions ────────────────────────────────────────
        txn(roth,     "deposit",    583,  "Roth IRA Contribution",        14, "investment", True),
        txn(roth,     "deposit",    583,  "Roth IRA Contribution",        44, "investment", True),
        txn(roth,     "deposit",    583,  "Roth IRA Contribution",        74, "investment", True),
        txn(roth,     "deposit",    21_500, "Initial balance",            90, "investment"),

        # ── Taxable brokerage ─────────────────────────────────────────────
        txn(taxable,  "deposit",    300,  "VTI Purchase",                 10, "investment"),
        txn(taxable,  "deposit",    300,  "VTI Purchase",                 40, "investment"),
        txn(taxable,  "deposit",    300,  "VTI Purchase",                 70, "investment"),
        txn(taxable,  "deposit",    7_500, "Initial balance",             90, "investment"),
    ]

    # Calculate balances from transactions
    for t in transactions:
        db.add(t)
        acct = {checking.id: checking, hysa.id: hysa, roth.id: roth, taxable.id: taxable}[t.account_id]
        if t.type == "deposit":
            acct.balance += t.amount
        else:
            acct.balance -= t.amount

    # ── Goals ─────────────────────────────────────────────────────────────────
    goals = [
        models.Goal(
            user_id=user.id,
            name="Emergency Fund",
            target_amount=25_000,
            current_amount=hysa.balance,
            target_date=today + timedelta(days=180),
        ),
        models.Goal(
            user_id=user.id,
            name="House Down Payment",
            target_amount=80_000,
            current_amount=taxable.balance,
            target_date=today + timedelta(days=730),
        ),
        models.Goal(
            user_id=user.id,
            name="New Car",
            target_amount=15_000,
            current_amount=2_400,
            target_date=today + timedelta(days=365),
        ),
    ]
    for g in goals:
        db.add(g)

    # ── Roth IRA record ───────────────────────────────────────────────────────
    roth_record = models.RothIRARecord(
        user_id=user.id,
        balance=roth.balance,
        contributed=1_749,
        contributed_year=today.year,
        allocations=json.dumps([
            {"ticker": "VTI",  "pct": 75, "rate": 0.10, "color": "#6366f1"},
            {"ticker": "VXUS", "pct": 15, "rate": 0.08, "color": "#10b981"},
            {"ticker": "QQQM", "pct": 5,  "rate": 0.12, "color": "#f59e0b"},
            {"ticker": "GLD",  "pct": 5,  "rate": 0.05, "color": "#ef4444"},
        ]),
    )
    db.add(roth_record)

    final_balances = {
        "checking": checking.balance,
        "hysa": hysa.balance,
        "roth": roth.balance,
        "taxable": taxable.balance,
    }
    txn_count = len(transactions)

    db.commit()
    db.close()

    net_worth = sum(final_balances.values())
    print(f"Demo user created.")
    print(f"  Email:    {DEMO_EMAIL}")
    print(f"  Password: {DEMO_PASSWORD}")
    print(f"  Net worth: ${net_worth:,.0f}  ({', '.join(f'{k} ${v:,.0f}' for k, v in final_balances.items())})")
    print(f"  Transactions: {txn_count}")

if __name__ == "__main__":
    run()
