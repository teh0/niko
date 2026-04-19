# Niko — AI Studio

A tiny studio of specialized AI agents that takes a client brief and builds
the product: specs, architecture, scaffolding, implementation, QA — every
step gated by a human review on GitHub.

## The team

| Role | Stack focus | What it does |
|---|---|---|
| **Product Manager** | — | Turns the brief into specs & user stories |
| **Tech Lead** | — | Picks stack, scaffolds repo, breaks down tickets, reviews |
| **Dev Web** | Next.js | Implements web tickets |
| **Dev Mobile** | Flutter | Implements mobile tickets |
| **Dev Backend** | NestJS (micro) / Next API | Implements API tickets |
| **DB Expert** | Postgres + Prisma (default) | Designs schema, writes migrations |
| **QA** | — | Reviews PRs, adds tests, signs off on releases |

## Flow

```
brief → PM specs PR → [you approve] → Tech Lead stack-plan PR → [you approve]
      → Tech Lead scaffold PR → [you approve] → DB Expert schema PR → [you approve]
      → Tech Lead breaks down tickets → Devs open PRs → QA reviews
      → [you approve & merge each] → QA sign-off → done
```

Every gate is a real GitHub PR you review with your usual tooling.

## Requirements

- Node 22+, pnpm 10+
- PostgreSQL 16+
- Redis 7+
- A **Claude MAX** subscription (the orchestrator uses the `claude` CLI
  authenticated via OAuth — no API key required)
- A **GitHub App** (recommended) or a fine-grained PAT

## Local test — **one command**

```bash
make up
```

That's it. The script:
- builds and starts postgres + redis + web + worker in Docker
- generates a `.env` with random secrets the first time
- injects your `gh` CLI token as `GITHUB_PAT` if it's logged in (so you
  can skip the GitHub App for the first test — just need `gh auth login`
  done once)
- prints the one remaining step: `make login` to authenticate Claude MAX
  inside the worker container (opens a URL you paste into your browser)

Dashboard: http://localhost:3000

Teardown:
```bash
make down     # stop (data preserved)
make clean    # nuke everything (DB, workspaces, Claude session)
```

### Alternative: dev mode on the host (hot-reload)

If you plan to tweak Niko itself, run it on your host for hot-reload:

```bash
make go
```

This uses `docker-compose.dev.yml` (just postgres + redis in Docker) and
runs web + worker directly on your host via pnpm. Requires Node 22, pnpm,
Docker, and the `claude` CLI installed locally.

## GitHub: App vs PAT

### GitHub App (recommended)

1. Go to https://github.com/settings/apps/new
2. Permissions:
   - **Contents**: Read & write (to push branches/commits)
   - **Pull requests**: Read & write (to open/review/comment)
   - **Metadata**: Read
3. Subscribe to events: `Pull request`, `Pull request review`, `Push`, `Issue comment`
4. Webhook URL: `${PUBLIC_URL}/api/webhooks/github`
5. Webhook secret: generate a random string, put it in both GitHub and `.env`
6. Generate a **private key**, paste it into `GITHUB_APP_PRIVATE_KEY` (replace
   real newlines with `\n` or quote the whole PEM)
7. Install the App on each repo you want the studio to work on.
8. Copy the **Installation ID** from the install URL (`/settings/installations/<id>`)
   into the project creation form.

### PAT (fallback)

Generate a fine-grained PAT with Contents R/W + Pull requests R/W on the
relevant repos, put it in `GITHUB_PAT`. No webhooks — less reactive.

## Deployment on a VPS (one-command install)

**Prerequisites on the VPS:**
- Fresh Ubuntu 22.04+ or Debian 12+, 2 GB RAM minimum (4 GB recommended
  because of Playwright Chromium)
- Root (or sudo) access
- DNS A/AAAA record pointing `studio.example.com` → your VPS IP

**Install** — one command:

```bash
curl -fsSL https://raw.githubusercontent.com/teh0/niko/main/install.sh \
  | bash -s -- studio.example.com you@example.com
```

What the script does, idempotently:
1. Installs Docker + compose plugin if missing.
2. Opens ports 22, 80, 443 in `ufw`.
3. Clones the repo into `/opt/niko`.
4. Generates `.env` with strong random passwords + webhook secret.
5. Builds images and starts all services (Caddy + web + worker + postgres + redis).
6. Applies DB migrations.
7. Prints the next steps (fill in GitHub App creds, run `make login`).

**Post-install:**

```bash
cd /opt/niko

# 1. Edit .env — paste your GitHub App credentials (and optionally FIGMA_API_KEY).
nano .env

# 2. Authenticate Claude MAX once, interactively:
make login
# The CLI prints a URL + code. Open in your browser, copy the code back.
# Credentials persist in a named Docker volume across restarts.

# 3. Restart to pick up .env changes:
make restart

# 4. Check everything is green:
make status
```

Caddy gets an automatic Let's Encrypt cert the first time someone hits
`https://studio.example.com`. The GitHub webhook URL you paste into your
App's settings is:

```
https://studio.example.com/api/webhooks/github
```

**Common operations** (see `make help` for the full list):

| Command | What it does |
|---|---|
| `make logs` | Tail logs from all services |
| `make status` | Show containers + health endpoint |
| `make login` | Re-auth Claude MAX (rare; OAuth refreshes itself) |
| `make upgrade` | `git pull` + rebuild + migrate + restart |
| `make backup` | Gzipped Postgres dump in `./backups/` |
| `make db` | Drop into psql |
| `make shell` | Shell inside the worker container |
| `make clean` | ⚠️  Destroy all data (asks confirmation) |

## MCP tools + feedback loops

Agents are plugged into three MCP servers — see
[src/lib/agents/mcp.ts](src/lib/agents/mcp.ts):

- **Context7** (`@upstash/context7-mcp`) — live, indexed docs for libraries
  & frameworks. Every agent is explicitly instructed to consult it BEFORE
  writing code against any library. This neutralizes the #1 failure mode
  (hallucinated APIs from stale training data).
- **Figma Context MCP** (`figma-developer-mcp`) — read access to Figma
  files. Enabled only when `FIGMA_API_KEY` is set. Given to PM, Dev Web,
  Dev Mobile so they can pull exact design tokens and frame structure.
- **Playwright MCP** (`@playwright/mcp`) — real headless Chromium for
  visual feedback loops. Given to Dev Web + QA so they can render pages,
  screenshot them, and compare to Figma frames. Chromium is pre-installed
  in the Docker image so the first run is fast.

Every agent's system prompt is prefixed with a global preamble enforcing:
1. **Consult docs via Context7** before using any library (kills hallucinations).
2. **Read existing code** before adding new files (preserves conventions).
3. **Close the feedback loop** — tests must pass, UI must be visually
   verified, no PR submitted on a red build.
4. **Structured JSON output** for the orchestrator.

See [src/lib/agents/base.ts](src/lib/agents/base.ts) for the full preamble.

When creating a project you can paste a Figma URL — it's stored on the
Project and surfaced to UI-facing agents in every run's context.

## Rate limits and 24/7 operation

Claude MAX has rolling 5-hour usage windows. The worker:
- Caps parallel runs at `MAX_CONCURRENT_AGENTS` (default 4)
- Detects rate-limit errors from the CLI
- **Pauses the queue** for `RATE_LIMIT_PAUSE_MINUTES` (default 60) when hit,
  then auto-resumes

For heavier usage, either:
- Upgrade to MAX 20×, or
- Set `ANTHROPIC_API_KEY` for pay-as-you-go fallback (the CLI will prefer
  this env var if set — remove it to go back to MAX-only)

## Isolation: studio code vs. project code

The studio and the projects it builds live in **completely separate
directories**:

```
studio (this repo)            project workspaces (WORKSPACE_DIR)
─────────────────             ────────────────────────────────
/app (or wherever             /var/lib/niko/workspaces/
 niko is deployed)              ├── <projectId-1>/  ← git clone of client repo 1
  ├── src/                      ├── <projectId-2>/  ← git clone of client repo 2
  ├── prisma/                   └── <projectId-3>/
  └── … studio code             (each is a full clone of that project's repo)
```

When an agent runs:
- Its `cwd` is pinned to `${WORKSPACE_DIR}/<projectId>/`.
- The Claude Code CLI scopes all filesystem tools (Read/Write/Edit/Bash) to
  that directory.
- The studio's own source code is not visible to the agent — no cross-talk,
  no risk of an agent modifying the orchestrator itself.

At boot, the studio refuses to start if `WORKSPACE_DIR` is inside the studio
repo (see [src/lib/agents/workspace.ts](src/lib/agents/workspace.ts)).

In Docker the workspace is a named volume (`workspaces:`), persistent across
container restarts but isolated from the image.

## Project layout

```
src/
  app/                       Next.js dashboard + API + webhooks
  lib/
    agents/                  Agent framework + 7 specialized agents
      base.ts                BaseAgent + runtime orchestration
      runtime.ts             Claude Agent SDK wrapper (spawns `claude` CLI)
      workspace.ts           git clone / branch / commit / push
      {pm,tech-lead,dev-*,db-expert,qa}.ts
    github/                  Octokit (App or PAT), PR helpers, webhooks
    orchestrator/flow.ts     Project state machine (decideNext)
    workers/                 BullMQ workers (agents + orchestrator)
    queue.ts, db.ts, env.ts
prisma/schema.prisma         Data model
docker-compose.yml           web + worker + postgres + redis
```

## Next steps / ideas

- Live agent transcript stream in the dashboard (SSE over `AgentRun.transcript`)
- Cost tracking (aggregate `tokensIn`/`tokensOut` per project)
- Per-agent choice of model (e.g. Haiku for lightweight runs)
- Auto-retry a ticket when QA requests changes (feed findings back to the dev)
- Slack/Discord notifications on gate opens
