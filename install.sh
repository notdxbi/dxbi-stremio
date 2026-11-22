#!/usr/bin/env bash
# dx.bi installer for Stremio Enhanced (Linux / macOS)
#   curl -fsSL https://github.com/notdxbi/dxbi-stremio/releases/latest/download/install.sh | bash
set -euo pipefail

BASE_URL="${DXBI_BASE_URL:-https://github.com/notdxbi/dxbi-stremio/releases/latest/download}"

case "$(uname -s)" in
  Darwin) DATA="$HOME/Library/Application Support/stremio-enhanced" ;;
  *)      DATA="$HOME/.config/stremio-enhanced" ;;
esac

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
red()  { printf '\033[1;31m%s\033[0m\n' "$*"; }

bold "DX.BI — installing into: $DATA"
mkdir -p "$DATA/plugins"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() {
  local name="$1" dest="$2"
  printf '  downloading %-18s' "$name"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --retry-delay 2 --retry-connrefused "$BASE_URL/$name" -o "$tmp/$name"
  else
    wget -q --tries=4 --waitretry=2 --retry-connrefused -O "$tmp/$name" "$BASE_URL/$name"
  fi
  # sanity check: the file must be the real dx.bi mod, not an error page
  if ! head -c 400 "$tmp/$name" | grep -q "@name dx.bi"; then
    echo
    red "Download of $name looks wrong — aborting, nothing was changed."
    exit 1
  fi
  mv "$tmp/$name" "$dest/$name"
  echo " ok"
}

fetch dxbi.plugin.js "$DATA/plugins"

echo
bold "Done. Now in Stremio Enhanced:"
echo "  1. Restart the app"
echo "  2. Settings → Enhanced → Plugins → switch \"dx.bi\" on (the theme is built in)"
echo
echo "Made for Stremio Enhanced 1.2.0 (the latest full release, not a preview build)."
echo "Tip: turn off Dynamic Hero, Horizontal Navigation, Enhanced Covers and Enhanced Title Bar if you use them."
