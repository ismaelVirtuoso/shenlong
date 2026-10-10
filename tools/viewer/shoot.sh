#!/usr/bin/env bash
# Renderiza o viewer em PNG com Chrome headless (WebGL via SwiftShader).
#   tools/viewer/shoot.sh out.png "appear=1&t=8000" [430x932]
set -euo pipefail
OUT="$1"; HASH="${2:-}"; SIZE="${3:-430x932}"
W="${SIZE%x*}"; H="${SIZE#*x}"
# perfil descartável: com o perfil padrão o Chrome servia um viewer.js antigo do cache
PROFILE="$(mktemp -d)"; trap 'rm -rf "$PROFILE"' EXIT
google-chrome --headless=new --user-data-dir="$PROFILE" --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --window-size="$W,$H" --virtual-time-budget=60000 \
  --screenshot="$OUT" "http://localhost:8099/tools/viewer/index.html#w=$W&h=$H&$HASH" >/dev/null 2>&1
echo "$OUT"
