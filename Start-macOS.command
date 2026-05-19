#!/bin/bash
cd "$(dirname "$0")"

PORT=8080
APP="portable/dist"
ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) SERVE="portable/server/mac-arm64/miniserve" ;;
  *) SERVE="portable/server/mac-x64/miniserve" ;;
esac

ensure_portable() {
  if [[ -f "$APP/index.html" && -f "$SERVE" ]]; then
    return 0
  fi

  echo ""
  echo "  The offline app is not ready yet."
  echo ""

  [[ ! -f "$SERVE" ]] && echo "  Missing: $SERVE" && echo ""
  [[ ! -f "$APP/index.html" ]] && echo "  Missing: $APP/index.html" && echo ""

  if [[ -f package.json ]] && command -v npm >/dev/null 2>&1; then
    echo "  Node.js found — building portable package now..."
    echo "  This may take a minute."
    echo ""
    npm run build:portable
    if [[ -f "$APP/index.html" && -f "$SERVE" ]]; then
      return 0
    fi
  fi

  echo "  To fix:"
  echo "    1. Get a full copy that includes portable/dist, OR"
  echo "    2. Install Node.js, then run:"
  echo "         npm install"
  echo "         npm run build:portable"
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
}

ensure_portable
chmod +x "$SERVE" 2>/dev/null || true

echo ""
echo "Shooting Script Liner - http://127.0.0.1:$PORT"
echo "Close this window to stop the server."
open "http://127.0.0.1:$PORT" 2>/dev/null || true
exec "./$SERVE" "$APP" -p "$PORT" --interfaces 127.0.0.1
