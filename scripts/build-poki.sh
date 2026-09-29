#!/usr/bin/env bash
# Build de production de Xiao Swarm Attack pour Poki : vérifications, build Vite, zip.
# Usage : bash scripts/build-poki.sh          (vérifications + build + zip)
#         bash scripts/build-poki.sh --fast    (saute le test réseau et la simulation)
set -euo pipefail

cd "$(dirname "$0")/.."
FAST=0
[[ "${1:-}" == "--fast" ]] && FAST=1

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

step "Typecheck (monorepo + pureté des simulations)"
npm run typecheck

if [[ $FAST -eq 0 ]]; then
  step "Simulation headless (royale, 9 bots, 60 s)"
  npm run sim:headless -- royale 9 60
  step "Test réseau hôte + client"
  npm run sim:net
fi

step "Build + zip Poki"
npm run zip

printf '\n\033[1;32m✔ Prêt : %s/poki-build.zip\033[0m\n' "$(pwd)/games/xiao-swarm"
ls -lh games/xiao-swarm/poki-build.zip 2>/dev/null || ls -lh poki-build.zip
