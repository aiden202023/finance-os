#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Activate virtualenv if present
if [ -f "$ROOT/backend/.venv/bin/activate" ]; then
  source "$ROOT/backend/.venv/bin/activate"
fi

# Check backend deps
if ! command -v uvicorn &>/dev/null; then
  echo "Error: uvicorn not found. Run: cd backend && pip install -r requirements.txt"
  exit 1
fi

# Check .env
if [ ! -f "$ROOT/backend/.env" ]; then
  echo "Error: backend/.env not found. Run: echo \"SECRET_KEY=\$(python3 -c 'import secrets; print(secrets.token_hex(32))')\" > backend/.env"
  exit 1
fi

# Install frontend deps if missing
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

echo "Starting Finance OS..."

cd "$ROOT/backend"
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "  Backend PID $BACKEND_PID → http://localhost:8000"

cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  Frontend PID $FRONTEND_PID → http://localhost:5173"

echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
