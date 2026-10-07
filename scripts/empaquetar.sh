#!/usr/bin/env bash
# Construye la app en dist/app y copia la landing a dist/. BASE=/acopia/ para GitHub Pages sin dominio propio.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cp -R landing/. dist/
touch dist/.nojekyll
echo "dist listo (BASE=${BASE:-/})"; find dist -type f | sort
