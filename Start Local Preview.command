#!/bin/bash
# Double-click to run Northline on this Mac at http://localhost:3000
# Edits you save are picked up automatically — just refresh the browser.
cd "$(dirname "$0")" || exit 1
PORT=3000
clear
echo "=== Northline · local preview ==="

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js isn't installed on this Mac yet."
  echo "Opening the download page — install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi
echo "Node $(node -v)"

if [ ! -f .env ]; then
  cp .env.example .env
  echo
  echo "Created a .env settings file. Fill in DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD,"
  echo "save it, then double-click this file again."
  open -e .env
  read -n 1 -s -r -p "Press any key to close..."
  exit 0
fi

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "Installing packages (first run takes a minute)..."
  npm install || { echo "npm install failed."; read -n 1 -s -r; exit 1; }
  touch node_modules
fi

# Stop anything already using the port (e.g. a previous preview window)
lsof -ti tcp:$PORT | xargs kill 2>/dev/null

( sleep 3; open "http://localhost:$PORT/login" ) &
echo
echo "Starting at http://localhost:$PORT  —  close this window or press Ctrl+C to stop."
echo
PORT=$PORT npm run dev
