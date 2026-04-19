# Multi-stage build: one image, two entrypoints (web / worker).
FROM node:22-bookworm-slim AS base

# git + openssh for cloning project repos; ca-certs for HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates openssh-client tini \
      # Playwright MCP needs Chromium + its system libs for visual feedback loops.
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Install the Claude Code CLI globally so the SDK can spawn it.
# (On the VPS you still need to `claude login` once interactively; see README.)
RUN npm install -g @anthropic-ai/claude-code

# Pre-install Playwright's Chromium so the Playwright MCP starts instantly.
RUN npx -y playwright@latest install chromium

# ─── Dependencies ───────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# ─── Build ──────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate && pnpm build

# ─── Runtime ────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# IMPORTANT: copy node_modules from `build`, not `deps` — `build` ran
# `prisma generate` which writes the Prisma client INTO node_modules.
# If we copied from `deps` the runtime image would be missing
# .prisma/client/default, and every Prisma call would 500.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Non-root user for security; mount ~/.claude as a volume so `claude login`
# credentials survive container restarts.
RUN useradd -m -u 1001 niko && chown -R niko:niko /app
USER niko

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
