#!/bin/bash
# Debian postinst — optionally run the store/locale configure wizard.
set -e
# Scripts are also shipped under the app resources via bundle.resources.
CONFIGURE=""
for candidate in \
  /usr/lib/POSR/linux/posr-desktop-configure.sh \
  /usr/lib/posr/linux/posr-desktop-configure.sh \
  /usr/lib/posr-desktop/linux/posr-desktop-configure.sh
do
  if [ -x "$candidate" ] || [ -f "$candidate" ]; then
    CONFIGURE="$candidate"
    break
  fi
done

# Prefer the copy next to this script if packaged alongside postinst resources.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)"
if [ -z "$CONFIGURE" ] && [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/posr-desktop-configure.sh" ]; then
  CONFIGURE="$SCRIPT_DIR/posr-desktop-configure.sh"
fi

if [ -n "${DISPLAY:-}" ] && [ -n "$CONFIGURE" ] && [ -f "$CONFIGURE" ]; then
  # Best-effort; never fail package install if the wizard is skipped/cancelled.
  bash "$CONFIGURE" || true
elif [ -n "$CONFIGURE" ] && [ -f "$CONFIGURE" ]; then
  bash "$CONFIGURE" --defaults || true
fi

exit 0
