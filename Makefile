.PHONY: help install start stop restart logs login status shell db migrate backup upgrade down clean

up: ## 🚀 Zero-setup local test: everything in Docker (auto .env, auto-migrate, auto gh token)
	./scripts/up.sh

go: ## Dev mode on your host (hot-reload). Requires Node/pnpm/claude CLI installed
	./scripts/go.sh

bootstrap: ## Lower-level: just bootstrap without running the app
	./scripts/bootstrap.sh

gh-token: ## Copy your current `gh` CLI token into .env as GITHUB_PAT (fastest local setup)
	@if ! command -v gh >/dev/null 2>&1; then echo "✘ gh CLI not installed. Install: https://cli.github.com/"; exit 1; fi
	@if ! gh auth status >/dev/null 2>&1; then echo "✘ gh CLI not authenticated. Run: gh auth login"; exit 1; fi
	@./scripts/set-env.sh GITHUB_PAT "$$(gh auth token)"
	@echo "✔ GITHUB_PAT written to .env — you can skip the GitHub App for local testing."

encode-pem: ## Encode a GitHub App .pem into a one-line .env value (FILE=path/to/key.pem)
	@if [ -z "$(FILE)" ]; then echo "Usage: make encode-pem FILE=path/to/key.pem"; exit 1; fi
	./scripts/encode-pem.sh $(FILE)

dev: ## Run the Next.js dashboard in dev mode (terminal A)
	pnpm dev

worker: ## Run the BullMQ agent worker (terminal B)
	pnpm worker

dev-up: ## Start local Postgres + Redis for dev (Docker)
	docker compose -f docker-compose.dev.yml up -d

dev-down: ## Stop local Postgres + Redis
	docker compose -f docker-compose.dev.yml down

dev-reset: ## Wipe local dev DB + Redis (confirm prompt)
	@read -p "Wipe local Postgres and Redis data? Type 'yes': " c && [ "$$c" = "yes" ]
	docker compose -f docker-compose.dev.yml down -v

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## First-time install (requires DOMAIN=your.domain.com)
	@if [ -z "$(DOMAIN)" ]; then echo "Usage: make install DOMAIN=studio.example.com [EMAIL=you@example.com]"; exit 1; fi
	./install.sh $(DOMAIN) $(EMAIL)

start: ## Start all services
	docker compose up -d

stop: ## Stop all services (keep data)
	docker compose stop

restart: ## Restart all services
	docker compose restart

logs: ## Tail logs from all services (ctrl-c to exit)
	docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f --tail=100

status: ## Show service status
	docker compose -f docker-compose.yml -f docker-compose.local.yml ps
	@echo ""
	@echo "Health check:"
	@curl -s http://localhost/api/health || echo "  dashboard not reachable"

login: ## Authenticate Claude MAX inside the worker container (interactive, one-time)
	@echo "▶ Running 'claude login' inside the worker container."
	@echo "  Copy the URL it prints, open it in your browser, paste the code back."
	docker compose -f docker-compose.yml -f docker-compose.local.yml exec worker claude login
	@echo "▶ Verifying session:"
	docker compose -f docker-compose.yml -f docker-compose.local.yml exec worker claude /status

shell: ## Open a shell in the worker container
	docker compose -f docker-compose.yml -f docker-compose.local.yml exec worker sh

db: ## Open a psql shell against the Niko database
	docker compose -f docker-compose.yml -f docker-compose.local.yml exec postgres psql -U niko -d niko

migrate: ## Apply pending DB migrations
	docker compose -f docker-compose.yml -f docker-compose.local.yml exec web pnpm db:deploy

backup: ## Dump Postgres to ./backups/niko-<timestamp>.sql.gz
	@mkdir -p backups
	@file="backups/niko-$$(date -u +%Y%m%dT%H%M%SZ).sql.gz"; \
	docker compose -f docker-compose.yml -f docker-compose.local.yml exec -T postgres pg_dump -U niko niko | gzip > "$$file" && \
	echo "✔ Backup saved to $$file"

upgrade: ## Pull latest code, rebuild, migrate, restart
	git pull --ff-only
	docker compose build
	docker compose up -d
	docker compose -f docker-compose.yml -f docker-compose.local.yml exec web pnpm db:deploy

down: ## Stop and remove containers (volumes preserved)
	docker compose -f docker-compose.yml -f docker-compose.local.yml down

clean: ## ⚠️  Remove ALL data (containers + volumes). Irreversible.
	@read -p "This will delete the DB, Redis, workspaces, Caddy data, and Claude session. Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ]
	docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
