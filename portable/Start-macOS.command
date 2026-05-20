#!/bin/bash
cd "$(dirname "$0")"

PORT=8080
ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) SERVE="server/mac-arm64/miniserve" ;;
  *) SERVE="server/mac-x64/miniserve" ;;
esac

if [[ ! -f "$SERVE" ]]; then
  echo "Missing $SERVE"
  echo "This portable package is incomplete. Re-download the release or rebuild with: npm run build:portable"
  read -r -p "Press Enter to close..."
  exit 1
fi

if [[ ! -f dist/index.html ]]; then
  echo "Missing dist/index.html"
  echo "This portable package is incomplete. Re-download the release or rebuild with: npm run build:portable"
  read -r -p "Press Enter to close..."
  exit 1
fi

chmod +x "$SERVE" 2>/dev/null || true

echo "Shooting Script Liner - http://127.0.0.1:8080/index.html"
echo "Close this window to stop the server."
open "http://127.0.0.1:8080/index.html" 2>/dev/null || true
exec "./$SERVE" dist -p "$PORT" --interfaces 127.0.0.1
