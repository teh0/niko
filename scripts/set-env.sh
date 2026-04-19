#!/usr/bin/env bash
# Upsert a KEY=VALUE line in .env without disturbing the rest.
# Usage: scripts/set-env.sh KEY "value"

set -euo pipefail
cd "$(dirname "$0")/.."

KEY="${1:-}"
VAL="${2:-}"
if [[ -z "$KEY" ]]; then
  echo "Usage: $0 KEY VALUE" >&2
  exit 1
fi
touch .env

# Build the replacement line. Quote the value so spaces/specials survive.
LINE="${KEY}=\"${VAL}\""

if grep -qE "^${KEY}=" .env 2>/dev/null; then
  # Portable sed in-place (macOS requires empty suffix arg).
  python3 - "$KEY" "$LINE" <<'PY' .env
import sys, pathlib, re
key, line, path = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(path)
text = p.read_text()
new = re.sub(rf'^{re.escape(key)}=.*$', lambda _: line, text, flags=re.M)
p.write_text(new)
PY
else
  echo "$LINE" >> .env
fi
