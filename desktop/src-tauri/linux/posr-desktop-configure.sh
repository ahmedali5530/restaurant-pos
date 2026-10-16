#!/usr/bin/env bash
# Configure POSR Desktop after .deb install (zenity when available).
set -euo pipefail

APP_ID="com.posr.desktop"
APP_DATA="${XDG_DATA_HOME:-$HOME/.local/share}/${APP_ID}"
mkdir -p "$APP_DATA"
OUT="$APP_DATA/installer-settings.json"
TEMPLATE="${POSR_INSTALLER_TEMPLATE:-/usr/share/posr-desktop/installer-settings.template.json}"

if [[ ! -f "$TEMPLATE" ]]; then
  TEMPLATE="$(cd "$(dirname "$0")" && pwd)/installer-settings.template.json"
fi

if [[ "${1:-}" == "--defaults" ]] || [[ -z "${DISPLAY:-}" ]]; then
  if [[ ! -f "$OUT" && -f "$TEMPLATE" ]]; then
    cp "$TEMPLATE" "$OUT"
    echo "Wrote defaults to $OUT"
  fi
  exit 0
fi

if ! command -v zenity >/dev/null 2>&1; then
  echo "zenity not found; copy template to $OUT and edit manually"
  [[ -f "$OUT" ]] || cp "$TEMPLATE" "$OUT"
  exit 0
fi

STORE_NAME=$(zenity --entry --title="POSR Desktop" --text="Store name" --entry-text="My Store" || true)
[[ -z "${STORE_NAME:-}" ]] && { [[ -f "$OUT" ]] || cp "$TEMPLATE" "$OUT"; exit 0; }
LOCALE=$(zenity --entry --title="POSR Desktop" --text="Locale (e.g. en-US)" --entry-text="en-US" || echo "en-US")
LANG_CODE=$(zenity --entry --title="POSR Desktop" --text="Default language" --entry-text="en" || echo "en")
CURRENCY=$(zenity --entry --title="POSR Desktop" --text="Currency code" --entry-text="USD" || echo "USD")
DECIMALS=$(zenity --entry --title="POSR Desktop" --text="Decimal places" --entry-text="2" || echo "2")
TZ_VAL=$(zenity --entry --title="POSR Desktop" --text="Timezone" --entry-text="UTC" || echo "UTC")

python3 - "$OUT" <<PY
import json, sys
out = sys.argv[1]
data = {
  "store": {"store_name": """$STORE_NAME""", "store_address": ""},
  "locale": {
    "default_language": """$LANG_CODE""",
    "locale": """$LOCALE""",
    "currency": """$CURRENCY""",
    "currency_symbol": "",
    "decimal_places": int("""$DECIMALS""" or "2"),
    "timezone": """$TZ_VAL""",
    "date_format": "yyyy-MM-dd",
    "time_format": "HH:mm",
  },
  "ai": {"enabled": False, "default_profile": "", "profiles": []},
  "integrations": {
    "token_encryption_key": "",
    "qbo_client_id": "",
    "qbo_client_secret": "",
    "qbo_redirect_uri": "",
    "qbo_env": "sandbox",
  },
  "applied": False,
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
print("Wrote", out)
PY
