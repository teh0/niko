// NOTE: `./webhooks` is NOT re-exported here — it pulls in @octokit/webhooks
// which trips tsx's ESM resolution under Node when loaded via this barrel.
// Import from `@/lib/github/webhooks` directly where needed (only the
// webhook route needs it; the worker doesn't).
export * from "./client";
export * from "./prs";
