#!/bin/bash
cd "$(dirname "$0")"

PORT=8080
SERVE="server/linux-x64/miniserve"

if [[ ! -f "$SERVE" ]]; then
  echo "Missing $SERVE"
  echo "This portable package is incomplete. Re-download the release or rebuild with: npm run build:portable"
  exit 1
fi

if [[ ! -f dist/index.html ]]; then
  echo "Missing dist/index.html"
  echo "This portable package is incomplete. Re-download the release or rebuild with: npm run build:portable"
  exit 1
fi

chmod +x "$SERVE" 2>/dev/null || true

echo "Shooting Script Liner - http://127.0.0.1:8080/index.html"
echo "Press Ctrl+C to stop the server."
xdg-open "http://127.0.0.1:8080/index.html" 2>/dev/null || sensible-browser "http://127.0.0.1:8080/index.html" 2>/dev/null || true
exec "./$SERVE" dist -p "$PORT" --interfaces 127.0.0.1
