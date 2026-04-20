#!/usr/bin/env bash
# Single-command local runner.
#   make go   →   ./scripts/go.sh
#
# Everything that can be made idempotent + headless is. The two things
# that genuinely need YOUR browser once (and only once) are surfaced as
# clear prompts:
#   - `gh auth login`     (for repo access)
#   - `claude login`      (for Claude MAX OAuth)

set -euo pipefail
cd "$(dirname "$0")/.."

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
info() { printf "\033[36m▶\033[0m %s\n" "$*"; }
ok()   { printf "\033[32m✔\033[0m %s\n" "$*"; }
warn() { printf "\033[33m!\033[0m %s\n" "$*"; }
die()  { printf "\033[31m✘ %s\033[0m\n" "$*" >&2; exit 1; }

bold "═══ Niko — local runner ═══"

# ─── 1. Bootstrap if needed (deps, containers, .env, DB schema) ─────────
if [[ ! -d node_modules || ! -f .env ]]; then
  info "First run detected — bootstrapping…"
  ./scripts/bootstrap.sh
else
  # Fast path: just make sure containers are up and schema is applied.
  info "Ensuring Postgres + Redis are running…"
  docker compose -f docker-compose.dev.yml up -d >/dev/null
  info "Applying any pending DB migrations…"
  pnpm db:deploy >/dev/null 2>&1 || pnpm exec prisma migrate dev --skip-seed --name "auto-$(date +%s)" 2>&1 | tail -2 || true
fi

# ─── 2. gh CLI auth ──────────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  die "GitHub CLI 'gh' not installed. Install: https://cli.github.com/"
fi
if ! gh auth status >/dev/null 2>&1; then
  warn "gh CLI not logged in. Running 'gh auth login' now — follow the browser prompt."
  gh auth login
fi
ok "gh authenticated as $(gh api user -q .login 2>/dev/null || echo '?')."

# ─── 3. Copy gh token into .env if GITHUB_PAT is empty ──────────────────
CUR_PAT="$(grep -E '^GITHUB_PAT=' .env 2>/dev/null | sed -E 's/^GITHUB_PAT="?([^"]*)"?$/\1/' || true)"
CUR_APP_ID="$(grep -E '^GITHUB_APP_ID=' .env 2>/dev/null | sed -E 's/^GITHUB_APP_ID="?([^"]*)"?$/\1/' || true)"
if [[ -z "${CUR_PAT:-}" && -z "${CUR_APP_ID:-}" ]]; then
  info "No GitHub credentials in .env yet — injecting your current gh token as GITHUB_PAT."
  ./scripts/set-env.sh GITHUB_PAT "$(gh auth token)"
  ok "GITHUB_PAT set (you can replace this with a full GitHub App later)."
else
  ok "GitHub credentials present in .env."
fi

# ─── 4. Claude MAX auth ─────────────────────────────────────────────────
if ! command -v claude >/dev/null 2>&1; then
  die "Claude CLI not installed. Install: npm install -g @anthropic-ai/claude-code"
fi
if ! claude auth status >/dev/null 2>&1; then
  warn "Claude CLI not logged in. Running 'claude auth login' now — follow the browser prompt."
  claude auth login
fi
ok "Claude CLI ready."

# ─── 5. Launch web + worker together ────────────────────────────────────
bold "═══ Starting web (:3000) + worker — press Ctrl-C to stop both ═══"
echo ""
echo "  Dashboard:   http://localhost:3000"
echo ""
exec pnpm dev:all
