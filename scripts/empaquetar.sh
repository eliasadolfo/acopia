#!/usr/bin/env bash
# Construye la app (dist/app) y copia la landing estática a la raíz (dist/).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cp -R landing/. dist/
# Iconos PNG para iOS/Android a partir del SVG (qlmanage viene con macOS)
if command -v qlmanage >/dev/null 2>&1; then
  tmp=$(mktemp -d)
  qlmanage -t -s 512 -o "$tmp" public/icono.svg >/dev/null 2>&1 || true
  if [ -f "$tmp/icono.svg.png" ]; then
    cp "$tmp/icono.svg.png" dist/app/icono-512.png
    sips -z 192 192 "$tmp/icono.svg.png" --out dist/app/icono-192.png >/dev/null 2>&1 || cp "$tmp/icono.svg.png" dist/app/icono-192.png
  fi
  rm -rf "$tmp"
fi
echo "dist listo:"; find dist -type f | sort
