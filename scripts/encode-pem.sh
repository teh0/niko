#!/usr/bin/env bash
# Encode a GitHub App private key PEM into the single-line format expected
# by GITHUB_APP_PRIVATE_KEY in .env (newlines → literal \n).
#
# Usage:
#   scripts/encode-pem.sh path/to/key.pem
# or via make:
#   make encode-pem FILE=path/to/key.pem

set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "Usage: $0 path/to/key.pem" >&2
  exit 1
fi
if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

# Read, replace real newlines with literal \n, print quoted.
encoded="$(awk '{printf "%s\\n", $0}' "$FILE")"
echo ""
echo "Paste the following line (including quotes) into your .env:"
echo ""
echo "GITHUB_APP_PRIVATE_KEY=\"${encoded}\""
echo ""
