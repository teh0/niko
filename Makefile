.PHONY: help install start stop restart logs login status shell db migrate backup upgrade down clean

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
	docker compose logs -f --tail=100

status: ## Show service status
	docker compose ps
	@echo ""
	@echo "Health check:"
	@curl -s http://localhost/api/health || echo "  dashboard not reachable"

login: ## Authenticate Claude MAX inside the worker container (interactive, one-time)
	@echo "▶ Running 'claude login' inside the worker container."
	@echo "  Copy the URL it prints, open it in your browser, paste the code back."
	docker compose exec worker claude login
	@echo "▶ Verifying session:"
	docker compose exec worker claude /status

shell: ## Open a shell in the worker container
	docker compose exec worker sh

db: ## Open a psql shell against the Niko database
	docker compose exec postgres psql -U niko -d niko

migrate: ## Apply pending DB migrations
	docker compose exec web pnpm db:deploy

backup: ## Dump Postgres to ./backups/niko-<timestamp>.sql.gz
	@mkdir -p backups
	@file="backups/niko-$$(date -u +%Y%m%dT%H%M%SZ).sql.gz"; \
	docker compose exec -T postgres pg_dump -U niko niko | gzip > "$$file" && \
	echo "✔ Backup saved to $$file"

upgrade: ## Pull latest code, rebuild, migrate, restart
	git pull --ff-only
	docker compose build
	docker compose up -d
	docker compose exec web pnpm db:deploy

down: ## Stop and remove containers (volumes preserved)
	docker compose down

clean: ## ⚠️  Remove ALL data (containers + volumes). Irreversible.
	@read -p "This will delete the DB, Redis, workspaces, Caddy data, and Claude session. Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ]
	docker compose down -v
