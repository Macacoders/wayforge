---
status: completed
created: 2026-10-06
task: 4/4
required_gates:
  architect_review: true
  memory_update: true
---

# Node.js install-time provisioning Implementation plan

**Goal:** Make ai-config installs usable on a fresh machine by guaranteeing Node.js (with npm/npx) is available: the release one-shot installer provisions a user-local Node >= 18 automatically, and `ai-config install --repo` / `interactive` fail fast with remediation when Node is missing.

**Architecture:** Add Node detection to both one-shot installers (`install/install.sh`, `install/install.ps1`). When Node >= 18 is absent, the installer downloads the official Node toolchain into the ai-config prefix (user-owned, no admin), adds it to PATH, and verifies it before continuing. Add a small `cli/src/lib/prereq.ts` consumed by `doInstall` (and therefore `interactive`) that detects Node >= 18 up front and refuses to install when it is missing, unless `--skip-node-check` is passed; `--dry-run` only reports.

**Tech Stack:** POSIX sh, PowerShell 5.1+, TypeScript + Commander, vitest, bats, Pester.

**Scope classification:** `multi-task` (4 tasks).

## Grounding facts

- `install/install.sh` and `install/install.ps1` currently download only the compiled binary + `base/` share archive and register `bin` on PATH. Neither checks for Node.js.
- The installed workflow runs `npx tsx` at use time: `base/opencode/skills/ai-memory/scripts/ai-memory.ts`, `base/opencode/skills/shared-task/scripts/{gh-issue,gh-app-auth}.ts`, and `base/opencode/commands/init.md`.
- `cli/package.json` declares `"engines": { "node": ">=18.0.0" }` — use 18 as the floor.
- `cli/src/commands/install.ts` (`doInstall`) has no prerequisite check; `interactive.ts` delegates to `doInstall`.
- No existing tests reference `install/install.sh` / `install/install.ps1`. `bats` tests live in `tests/bash/` and run via `make check-bats`; Pester tests in `tests/powershell/` run via `make check-pester`; default `make check` runs vitest + tsc/eslint/prettier + jscpd only.
- Prior art exists in the frozen `install/legacy/bootstrap-thin.ps1` (winget/MSI Node fallback), but the canonical surface is now the one-shot installers (ADR-0035).
- ADR-0035 (Context, line 9) claims "no runtime dependency on Node.js for end users"; ADR-0017 says Node is "already a requirement for OpenCode itself". Both need reconciliation.

## Proposed defaults (confirm before implementation)

1. **Node version strategy:** pin a `NODE_VERSION` constant (e.g. current LTS) in each installer and bump it at release; enforce a `>= 18` minimum separately. Rejected: parsing `nodejs.org/dist/index.json` in POSIX sh (fragile).
2. **Provisioned Node location and uninstall:** install under the owned prefix (`~/.ai-config/node`, `%LOCALAPPDATA%\ai-config\node`) and remove it (plus its PATH entries) on `--uninstall`, consistent with ADR-0035 Decision 6 ("everything lives under the one owned directory").
3. **Opt-out flag name:** `--skip-node-check` (`install.sh`), `-SkipNodeCheck` (`install.ps1`), `--skip-node-check` (CLI).
4. **ADR handling:** amend ADR-0035 (Context + amendment block) and clarify the ADR-0017 Node note rather than opening a new ADR.

## Blocking decisions

- **D1 — Node version strategy** (pinned vs resolved-latest-LTS): choose before Task 1. Recommendation: pinned.
- **D2 — Provisioned Node lifetime**: prefix-owned + removed on uninstall vs persistent user dir kept after uninstall. Recommendation: prefix-owned + removed, documented.
- **D3 — Actual network provisioning validation** is `human`: downloading Node from nodejs.org on a clean/non-Node shell cannot be validated by an agent in this environment.

## Tasks

### Task 1: POSIX one-shot installer provisions Node.js

**Objective:** `install/install.sh` detects Node >= 18 and, when missing or too old, installs a user-local Node into the ai-config prefix, adds it to PATH, and verifies it; `--dry-run` and `--skip-node-check` are honored.

**Files:**
- Modify: `install/install.sh`
- Create: `tests/bash/install_sh.bats`

**Step 1: Establish expected behaviour**

- With no Node on PATH, `install.sh` downloads `node-v<NODE_VERSION>-<os>-<arch>.tar.gz` from `https://nodejs.org/dist`, extracts it to `${PREFIX}/node`, prepends `${PREFIX}/node/bin` to PATH (marker block in `~/.bashrc`/`~/.zshrc` and current-session `export`), then verifies `node --version` reports >= 18.
- With Node >= 18 already on PATH, no provisioning occurs.
- `--dry-run` prints the detection/provision plan and downloads nothing.
- `--skip-node-check` bypasses detection and provisioning entirely.
- If provisioning fails, exit non-zero with an actionable message.
- `--uninstall` removes `${PREFIX}/node` and its PATH marker (per D2).

**Step 2: Add or update validation**

- Create `tests/bash/install_sh.bats` network-free cases using a controlled `PATH`, a stub `node`, and `--dry-run`/`--skip-node-check`:
  - stub `node` printing `v18.20.0` -> output contains `Node.js v18.20.0 detected` and no provisioning line.
  - no `node` on PATH + `--dry-run` -> output contains `[dry-run] would install Node.js`.
  - `--skip-node-check` -> output contains no Node lines.
- Run (owner: agent): `make check-bats` (skips cleanly if bats is absent).

**Step 3: Write minimal implementation**

- Parse `--skip-node-check` into `SKIP_NODE=0`.
- Add constants: `NODE_MIN_MAJOR=18`, `NODE_VERSION=<pinned LTS>`, `NODE_BASE_URL="https://nodejs.org/dist"` (allow override for tests).
- Add `node_major()` using `command -v node` + `node --version`; add `install_local_node()` that reuses the existing `download()` helper, extracts with `tar -xzf --strip-components=1`, and calls `append_path_block` for `${PREFIX}/node/bin`.
- Add `ensure_node()` and call it in `run_install` after `detect_downloader`, before asset downloads; handle `SKIP_NODE` and `DRY_RUN`; abort on failure.
- Extend `usage()` and the `--dry-run` output.
- Update `run_uninstall` to remove `${PREFIX}/node` and its PATH marker.

**Step 4: Run test to verify pass**

- Run: `make check-bats`; Expected: all bats cases pass.
- Run (agent): `sh install/install.sh --dry-run --prefix /tmp/ai-config-node-test`; Expected: plan includes Node detection/provision lines, nothing written.
- Run (human, D3): on a shell without Node, execute the release `curl -fsSL .../install.sh | sh`; Expected: `node --version` reports >= 18 afterwards.

**Step 5: Commit**

- `git add install/install.sh tests/bash/install_sh.bats`
- `git commit -m "feat: provision Node.js in the POSIX one-shot installer"`

### Task 2: Windows one-shot installer provisions Node.js

**Objective:** `install/install.ps1` detects Node >= 18 and, when missing or too old, installs a user-local Node zip into the prefix, updates the User PATH, and verifies it; `-DryRun` and `-SkipNodeCheck` are honored.

**Files:**
- Modify: `install/install.ps1`
- Create: `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

- Same behaviour as Task 1 on Windows: download `node-v<NODE_VERSION>-win-<arch>.zip`, extract to `$Prefix\node`, add its directory to the User PATH via `Add-UserPathEntry`, prepend to `$env:Path` for the current session, verify `node --version` >= 18.
- `-DryRun` prints the plan; `-SkipNodeCheck` bypasses; failure exits with a clear error.
- `-Uninstall` removes `$Prefix\node` and its User PATH entry (per D2).

**Step 2: Add or update validation**

- Create `tests/powershell/install.Tests.ps1` (Pester) asserting:
  - `-DryRun` output contains the Node detection/provision lines.
  - `-SkipNodeCheck` output omits Node lines when Node is absent.
  - Node >= 18 detected when a stub `node` reports `v18.20.0`.
- Run (owner: agent): `make check-pester`.

**Step 3: Write minimal implementation**

- Add `[switch]$SkipNodeCheck` to the param block.
- Add helpers `Get-NodeMajor`, `Install-LocalNode`, `Ensure-Node` mirroring Task 1; reuse `Invoke-WebRequest`, `Expand-Archive`, `Add-UserPathEntry`/`Remove-UserPathEntry`.
- Call `Ensure-Node` inside `Install-AiConfig` after resolving the version, before downloads; handle `$DryRun`/`$SkipNodeCheck`; error on failure.
- Extend `Uninstall-AiConfig` to remove `$Prefix\node` and the PATH entry.

**Step 4: Run test to verify pass**

- Run: `make check-pester`; Expected: all Pester cases pass.
- Run (human, D3): on Windows without Node, execute the release `irm .../install.ps1 | iex`; Expected: `node --version` reports >= 18 afterwards.

**Step 5: Commit**

- `git add install/install.ps1 tests/powershell/install.Tests.ps1`
- `git commit -m "feat: provision Node.js in the Windows one-shot installer"`

### Task 3: CLI repo-install Node prerequisite gate

**Objective:** `ai-config install --repo` and `ai-config interactive` refuse to install managed files when Node >= 18 is unavailable, unless `--skip-node-check` is passed; `--dry-run` reports the check without failing.

**Files:**
- Create: `cli/src/lib/prereq.ts`
- Create: `cli/tests/unit/prereq.test.ts`
- Modify: `cli/src/commands/install.ts`
- Modify: `cli/src/index.ts`
- Modify: `cli/src/types.ts`

**Step 1: Establish expected behaviour**

- `checkNode()` returns `{ ok: true, version }` when `node --version` reports >= 18; returns `{ ok: false, reason: 'not found' | 'too old (vN)' }` otherwise.
- `doInstall` runs the check before any filesystem mutation. Missing/too old -> log `[ai-config] error: Node.js >= 18 is required (install corepack/npm or run the ai-config release installer)` and `process.exit(1)`.
- `options.skipNodeCheck` bypasses the check.
- `options.dryRun` logs the check result and continues.

**Step 2: Add or update validation**

- Create `cli/tests/unit/prereq.test.ts` using an injected runner (no real process spawn):
  - runner returns `v20.11.0` -> `ok: true`.
  - runner returns `v16.20.0` -> `ok: false`, reason `too old`.
  - runner throws (`ENOENT`) -> `ok: false`, reason `not found`.
  - `parseNodeMajor` handles `v18.0.0`, `18.0.0`, and garbage.
- Run (owner: agent): `npx vitest run cli/tests/unit/prereq.test.ts`.

**Step 3: Write minimal implementation**

- `cli/src/lib/prereq.ts`: export `MIN_NODE_MAJOR = 18`, `parseNodeMajor(version: string): number | undefined`, and `checkNode(opts?: { runner?: (cmd: string, args: string[]) => string; minMajor?: number })` with a default runner using `child_process.execFileSync('node', ['--version'])`.
- `cli/src/types.ts`: add `skipNodeCheck: boolean` to `InstallOptions`.
- `cli/src/index.ts`: add `.option('--skip-node-check', 'Skip the Node.js prerequisite check', false)` and map it into `installOptions`.
- `cli/src/commands/install.ts`: call `checkNode()` at the top of `doInstall` (after the repo-exists guard), honoring `skipNodeCheck` and `dryRun`.

**Step 4: Run test to verify pass**

- Run: `npx vitest run`; Expected: new + existing unit tests pass.
- Run: `make check-node`; Expected: tsc + eslint + prettier clean.

**Step 5: Commit**

- `git add cli/src/lib/prereq.ts cli/tests/unit/prereq.test.ts cli/src/commands/install.ts cli/src/index.ts cli/src/types.ts`
- `git commit -m "feat: fail fast when Node.js is missing during repo install"`

### Task 4: Document Node.js prerequisite and reconcile ADRs

**Objective:** Documentation states Node.js >= 18 as a repo-install prerequisite and that the release one-shot installer provisions it, and the contradictory ADR wording is corrected.

**Files:**
- Modify: `README.md` (Install section)
- Modify: `docs/ai/architecture.md` (Runtime Boundary / One-shot installer)
- Modify: `docs/ai/decisions/ADR-0035-one-shot-cli-installer.md` (Context + amendment block)
- Modify: `docs/ai/decisions/ADR-0017-single-ts-gh-issue.md` (Node requirement note)

**Step 1: Establish expected behaviour**

- No doc claims end users have no Node.js dependency. README says the one-shot installer provisions Node.js (>= 18) user-locally, and `ai-config install --repo` requires Node >= 18 on PATH.

**Step 2: Add or update validation**

- Run (owner: agent): `rg -n "no runtime dependency on Node" .` -> no stale matches.
- Manual read-through of the updated Install section and ADR amendment.

**Step 3: Write minimal implementation**

- README Install section: add a short "Requirements" note (Node >= 18; auto-provisioned by the one-shot installer; required for `--repo` install).
- `architecture.md`: extend the installer/runtime-boundary bullets with the Node provisioning behavior and prefix layout (`node/`).
- ADR-0035: amend Context and add an `**Amended**` line recording that the one-shot installer provisions a user-local Node >= 18, resolving the "no runtime dependency" statement.
- ADR-0017: clarify that the `npx tsx` requirement is now guaranteed by the installer rather than assumed.

**Step 4: Run test to verify pass**

- Run: `rg -n "Node" README.md docs/ai/architecture.md docs/ai/decisions/ADR-0035-one-shot-cli-installer.md`
- Expected: consistent, non-contradictory statements.

**Step 5: Commit**

- `git add README.md docs/ai/architecture.md docs/ai/decisions/ADR-0035-one-shot-cli-installer.md docs/ai/decisions/ADR-0017-single-ts-gh-issue.md`
- `git commit -m "docs: document Node.js provisioning and reconcile installer ADRs"`

## Task budget rationale

4 tasks: the two one-shot installers are separate languages/platforms with independent test harnesses (bats vs Pester) and are independently reviewable; the CLI gate is a distinct surface with vitest coverage; docs/ADR reconciliation is cross-cutting. Merging the platform installers into one task would produce an unreviewably large change.

## Required gates

- `architect_review: true` — this changes the runtime boundary (new Node dependency and ADR amendment).
- `memory_update: true` — update `docs/ai/architecture.md` and record the decision; add a monthly log entry at close.

## Validation ownership summary

| Validation | Owner |
|---|---|
| `npx vitest run`, `make check-node` (CLI) | agent |
| `make check-bats`, `make check-pester` | agent |
| `install.sh`/`install.ps1` `--dry-run` inspection | agent |
| Real Node download on a clean/non-Node machine (network) | human |
