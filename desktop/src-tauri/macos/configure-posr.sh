#!/bin/bash
# macOS postinstall helper — prompts for store/locale and writes installer-settings.json
set -euo pipefail
APP_DATA="${HOME}/Library/Application Support/com.posr.desktop"
mkdir -p "$APP_DATA"
OUT="$APP_DATA/installer-settings.json"

STORE_NAME=$(osascript -e 'text returned of (display dialog "Store name" default answer "My Store")' 2>/dev/null || echo "My Store")
LOCALE=$(osascript -e 'text returned of (display dialog "Locale (e.g. en-US)" default answer "en-US")' 2>/dev/null || echo "en-US")
CURRENCY=$(osascript -e 'text returned of (display dialog "Currency code" default answer "USD")' 2>/dev/null || echo "USD")
LANG_CODE=$(osascript -e 'text returned of (display dialog "Default language" default answer "en")' 2>/dev/null || echo "en")

python3 - <<PY
import json
data = {
  "store": {"store_name": "$STORE_NAME", "store_address": ""},
  "locale": {
    "default_language": "$LANG_CODE",
    "locale": "$LOCALE",
    "currency": "$CURRENCY",
    "currency_symbol": "",
    "decimal_places": 2,
    "timezone": "UTC",
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
with open("$OUT", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
print("Wrote $OUT")
PY
