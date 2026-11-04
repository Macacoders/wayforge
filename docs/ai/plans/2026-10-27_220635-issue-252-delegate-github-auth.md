---
status: completed
created: 2026-10-27
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Delegate `/issue` authentication to supplied credentials (Issue #252) — Implementation plan

**Goal:** Remove the homegrown GitHub App device flow and make `/issue` use an environment token or an already-authenticated `gh` CLI, without leaving consumers with obsolete setup instructions.

**Architecture:** Keep `gh-issue.ts` and its native GitHub REST API calls; replace only token acquisition with `GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token`, failing closed with actionable setup guidance. Remove device-flow code and installer Client ID provisioning; teach the new contract in the installed skill, onboarding docs and ADRs. Do not read or migrate the old token cache.

**Tech Stack:** TypeScript (Node.js, `npx tsx`, Commander), vitest, shell-based installer integration tests, Markdown ADRs.

**Scope classification:** `multi-task`

**Risk:** full — authentication/secrets boundary and installer CLI contract change.

**Issue/intent:** GitHub issue #252 (claimed). Its proposed token order, intentionally breaking removal of device flow, no persisted credentials, and explicit out-of-scope alternatives are the approved product boundary for this draft.

**Pre-handoff conditions:** Work is currently on `develop`, not an issue branch. The pre-existing `package-lock.json` modification is unrelated and must be preserved, not staged or reset. A human or the authorized delivery role must switch to an issue branch before implementation; this planning role does not perform git writes.

**Plan acceptance criteria:**
- A `/issue` API operation obtains credentials in the stated order, never prints a resolved token, and exits 1 with both scoped-PAT and machine-wide `gh auth login` guidance when no source is available. `check` and `labels-check` remain the repo-access gates.
- Device-flow source/tests and active references are gone from shipped code, installer, skill and current-facing documentation; historical plans/logs remain untouched. Existing installs are told their cached token no longer works, without silently reading or deleting it.
- Fresh and repeat installs, including a directory without a git origin, do not request a GitHub App Client ID, create `.gh-config/app.yml`, or require auth during installation. Advisory output is nonblocking and suppressed for non-interactive installs.
- `npx vitest run tests/typescript/gh-issue/`, `npm run typecheck`, and `make check` pass; installer regression coverage passes.

**Interpretation to confirm before approval:** The current `install` command has no `--no-interactive` flag (`cli/src/index.ts`), and `cli/src/lib/prompt.ts::isInteractive()` defines interactive as both stdin and stdout being TTYs. This draft treats issue wording “silent under `--no-interactive`” as “silent when non-interactive (non-TTY)”, without adding a new CLI flag. If a literal flag is desired, revise Task 2 before approval.

## Tasks

### Task 1: `/issue` delegates token resolution safely

**Status:** accepted
**Depends on:** none

**Objective:** Replace device-flow authentication with an environment-first, CLI-fallback credential chain, and remove the obsolete auth implementation and its dedicated tests.

**Context:**
- `base/opencode/skills/shared-task/scripts/gh-issue.ts::resolveToken` currently returns `getValidToken()` after `GITHUB_TOKEN` and `GH_TOKEN`; `execFileSync` is already imported for git operations, and `main()` skips token acquisition under help/dry-run.
- `tests/typescript/gh-issue/gh-issue.test.ts` mocks `execFileSync` and the auth module, exports `resolveToken` tests, and uses env tokens for most tests. `tests/typescript/gh-issue/e2e.test.ts` has a separate auth-script block and help/dry-run regressions.
- The installed source of truth is `base/opencode/**`, not root `.opencode/**`. `gh-issue.ts` continues to use native `fetch`; `gh` is optional and only a token source.

**Acceptance criteria:**
- When both env vars are present, `GITHUB_TOKEN` wins; when only `GH_TOKEN` is present it wins; in either case `gh` is not invoked. With neither, a successful `gh auth token` supplies the authorization token without emitting it to stdout/stderr.
- Missing `gh`, unauthenticated `gh`, and empty CLI token all produce a controlled error and exit 1; the error explains `GITHUB_TOKEN` (fine-grained PAT for this repo) versus `gh auth login` (machine-wide credential for all repos), and contains no token or raw credential-bearing subprocess output. No browser prompt or legacy cache read occurs.
- `base/opencode/skills/shared-task/scripts/gh-app-auth.ts` and `tests/typescript/gh-issue/gh-app-auth.test.ts` are deleted; the obsolete auth E2E block and auth mock are gone. Help and dry-run still work without credentials. `check`/`labels-check` still exercise repo-scoped access as before.

**Constraints:**
- Run `gh auth token` internally with `execFileSync` argument array and a bounded timeout; suppress inherited subprocess output. Do not run it as an agent command or document a command that displays its token. Do not add credential persistence, an OAuth implementation, or a forge adapter.
- Avoid network-dependent tests for fallback/error paths: use existing process mocks or controlled subprocess fixtures. Preserve unrelated issue/PR behavior.

**Validations:**
- `agent`: `npx vitest run tests/typescript/gh-issue/` — expected: auth precedence/failure cases and existing issue E2E tests pass.
- `agent`: `npm run typecheck` — expected: no dangling auth import or type errors.

**Proposed commit message:** `refactor(shared-task): delegate issue auth to environment or gh (Issue #252)`

### Task 2: Installer stops provisioning GitHub App identity

**Status:** accepted
**Depends on:** Task 1

**Objective:** Remove the Client ID installer contract and give interactive users a brief, nonblocking `/issue` credential advisory on all successful install paths.

**Context:**
- `cli/src/index.ts` declares `--gh-app-client-id`; `cli/src/types.ts::InstallOptions` carries it; `cli/src/commands/interactive.ts` prompts for it and shows it in the summary.
- `cli/src/commands/install.ts::doInstall` writes `.gh-config/app.yml` and warns about legacy PAT files on the fresh-install path only. The managed-install refresh path returns early around line 308; ensure any common advisory accounts for both paths. `cli/src/lib/prompt.ts::isInteractive()` is the existing TTY convention.
- `cli/tests/integration/run.sh` creates target directories without git remotes and invokes `npx tsx cli/src/index.ts install` in a non-TTY context. Prefer extending that smoke coverage (or a focused CLI test) over building a new test harness.

**Acceptance criteria:**
- No Client ID prompt, summary item, option/type, `.gh-config/app.yml` write/template, or stale legacy-PAT warning remains in current installer code or CLI help. Existing `.gh-config` credentials are not deleted.
- A fresh install to a directory without `origin` succeeds without a GitHub auth check; a refresh also succeeds. Interactive successful installs show the short `GITHUB_TOKEN` fine-grained PAT (Issues RW, Pull requests RW, Contents R) or `gh auth login` machine-wide advisory; non-interactive installs produce no auth advisory and never wait for auth.
- Dry-run does not write auth-related files; the guidance never outputs an actual token.

**Constraints:**
- No `gh auth status` at install time and no new credential file, `.env.example`, or generated `opencode.jsonc` secret. Do not add a `--no-interactive` option unless the issue's interpretation is explicitly changed before approval.
- Preserve current installer safety semantics (`--dry-run`, `--force`, unmanaged files, tracking); reuse the existing TTY detection rather than inventing auth probing.

**Validations:**
- `agent`: `cli/tests/integration/run.sh` — expected: no-origin smoke installs still pass and assert absence of auth-file creation/non-TTY guidance.
- `agent`: `npx vitest run cli/tests/` — expected: existing installer/unit coverage passes, including any focused advisory tests.
- `agent`: `npm run typecheck` — expected: removed option has no dangling references.
- `human`: run a fresh and a refresh interactive install in a disposable repo with a TTY — expected: the advisory appears once per successful install and no Client ID prompt appears; no real GitHub auth is needed.

**Proposed commit message:** `refactor(cli): remove GitHub App client-id setup (Issue #252)`

### Task 3: Document the breaking credential contract and retire active guidance

**Status:** accepted
**Depends on:** Task 1, Task 2

**Objective:** Make shipped guidance and architectural memory agree with the new security boundary, including migration instructions for existing users.

**Context:**
- `base/opencode/skills/shared-task/SKILL.md` currently describes Device Flow and env bypass; root `README.md` has an entire GitHub App setup section (lines ~168–188). `docs/ai/README.md` routes durable memory; `docs/ai/architecture.md` describes installed source boundaries.
- ADR-0016 makes the old auth decision; ADR-0019's comparison assumes Device Flow and includes stale code/test/dependency figures. ADR-0017's concrete `gh-issue.ts` outcome also states the obsolete direct import and no-`gh` dependency. Historical `docs/ai/plans/**` and logs are records, not current guidance.
- `.gitignore` already ignores `.env`, `.env.*` and `.gh-config`, but not `.envrc`. Root `package.json` declares `open`, originally associated with the deleted device-flow implementation; confirm whether other code uses it before proposing dependency removal (avoid the unrelated pre-existing lockfile change).

**Acceptance criteria:**
- Installed `SKILL.md` explains `GITHUB_TOKEN` → `GH_TOKEN` → internally delegated `gh auth token`, advises fine-grained repo-scoped PATs versus machine-wide gh login, and prohibits agents from printing tokens or running `gh auth token` directly.
- README and a short agent-neutral `docs/ai/` auth section give PAT permissions (Issues/PRs read-write, Contents read for PR operations), secure local injection options (e.g. secret manager/direnv/keyring), setup/check commands, and a breaking-change note for users of `.gh-config/github-token.json` / `.gh-config/app.yml`. No plaintext token examples, file creation, or automatic legacy credential cleanup.
- `.gitignore` ignores `.envrc`. ADR-0016 explicitly supersedes/reverses its auth decision; ADR-0019 preserves the TypeScript/native-REST vs MCP decision but updates its auth claims and stale figures without speculative precision; ADR-0017 corrects its active auth/no-`gh` statements. No active reference outside historical `docs/ai/` records directs users to Device Flow.
- If `open` is proven otherwise unused, remove its now-obsolete dev dependency without overwriting the pre-existing unrelated `package-lock.json` edit; if safely isolating the lockfile change is not possible, report the dependency cleanup as a follow-up rather than absorbing unrelated modifications.

**Constraints:**
- ADR amendments must distinguish historical rationale from the new decision instead of rewriting history invisibly. Do not rewrite old plans/logs or change installer/skill behavior already accepted in Tasks 1–2.

**Validations:**
- `agent`: `make check` — expected: typecheck, lint, format and duplication gates pass.
- `agent`: `npx vitest run tests/typescript/gh-issue/` — expected: credential behavior still passes after documentation/dependency changes.
- `agent`: inspect active source/docs for `gh-app-auth`, `gh-app-client-id`, `GH_APP_CLIENT_ID`, `app.yml` — expected: no active instructions/imports; historical plans/logs and explicitly labeled migration notes may remain.

**Proposed commit message:** `docs: document delegated GitHub issue auth and migration (Issue #252)`

## Delivery notes

- An architecture review is required because this reverses ADR-0016 and changes the secrets/trust boundary. The memory gate covers the ADRs and lasting auth guidance.
- Report human TTY-install verification separately; no agent should execute interactive authentication or print a real token during validation.
- Keep `package-lock.json`'s pre-existing changes out of issue commits unless the user explicitly authorizes ownership of that change; avoid incidental dependency updates.
