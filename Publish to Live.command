#!/bin/bash
# Double-click to send your saved changes to GitHub (kaguilardev/northline).
# Render redeploys the live site automatically after each push.
cd "$(dirname "$0")" || exit 1
clear
echo "=== Northline · publish to live ==="
echo

if ! git --version >/dev/null 2>&1; then
  echo "Git isn't set up on this Mac yet. A macOS prompt should appear offering to install"
  echo "the Command Line Developer Tools. Click Install, then double-click this file again."
  read -n 1 -s -r -p "Press any key to close..."; exit 1
fi

if [ ! -d .git ]; then
  git init -q -b main
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin https://github.com/kaguilardev/northline.git

if [ -n "$(git status --porcelain)" ]; then
  echo "Changes since last publish:"
  git status --short
  echo
  read -r -p "Describe this update (or press Enter for 'Site update'): " MSG
  MSG=${MSG:-Site update}
  git add -A && git commit -q -m "$MSG" || { echo "Commit failed."; read -n 1 -s -r; exit 1; }
fi

# Bring in anything already on GitHub (first run: the repo's starter README).
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git pull -q --no-rebase --no-edit origin main
else
  git pull -q --no-rebase --no-edit --allow-unrelated-histories -X ours origin main 2>/dev/null || true
fi

echo "Pushing to GitHub... (if asked to sign in, use your GitHub username and a personal access token)"
if git push -u origin main; then
  echo
  echo "Done. Render will deploy in a couple of minutes: https://dashboard.render.com"
else
  echo
  echo "The push didn't go through — see the message above."
fi
read -n 1 -s -r -p "Press any key to close..."
