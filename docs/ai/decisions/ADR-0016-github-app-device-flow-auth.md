# ADR-0016: Authenticate gh-issue via GitHub App Device Flow

Date: 2026-06-22 (amended 2026-06-23)
Status: Accepted

## Context

The `gh-issue` scripts (Bash and PowerShell) previously relied on a personal access token (PAT) stored in `.gh-config/hosts.yml` for GitHub API authentication. This PAT had broad user-level permissions and was tied to an individual account rather than a purpose-scoped application.

A new GitHub App was created (Client ID `Iv23lizSyNH79b6RJr56`) with read/write permissions scoped to Issues and Pull Requests only — the minimum needed for shared-task operations.

## Decision

Switch `gh-issue` authentication from PAT to GitHub App OAuth Device Flow:

- The GitHub App acts as an OAuth app, supporting the Device Flow grant — only the Client ID is needed, no client secret or private key required.
- A TypeScript helper (`github-app-auth.ts`) implements the Device Flow: on first use, it prompts the user to authorize via browser (`https://github.com/login/device`); after authorization, the access token (and optional refresh token) are cached in `.gh-config/github-token.json` with `0o600` permissions.
- The helper exports `getValidToken()` — checks cached token validity, attempts silent refresh if expired, or launches the device flow if no valid token exists.
- The `gh-issue.ts` TypeScript script imports `getValidToken()` directly and wraps it with `GITHUB_TOKEN` / `GH_TOKEN` env var checks before falling back to device flow. Uses native `fetch` for API calls — no `gh` CLI dependency.
- `GITHUB_TOKEN` env var still takes precedence, preserving backward compatibility for headless/CI environments.

Token resolution order:
1. `GITHUB_TOKEN` env var
2. `GH_TOKEN` env var
3. Device Flow via `github-app-auth.ts` (cached token → refresh → new device flow)

## Consequences

- One-time browser authorization per machine replaces manual PAT provisioning.
- Token is scoped to the App's permissions (Issues + PRs only), reducing exposure.
- Cached tokens survive restarts; refresh tokens extend the session transparently.
- The exposed PATs in `.gh-config/hosts.yml` and `_config.yml` were removed.
- TypeScript dependency (`tsx`) is introduced for auth — lightweight, auto-downloaded via `npx`.

## Alternatives Considered

- **Keep PAT**: rejected — broad permissions, manual provisioning, token rotation burden.
- **GitHub App installation token** (JWT + private key): rejected — requires private key management; the Device Flow achieves the same scoped access with only the Client ID.
- **`gh auth login`**: rejected — `gh` CLI on github.com does not support custom OAuth Client IDs.
