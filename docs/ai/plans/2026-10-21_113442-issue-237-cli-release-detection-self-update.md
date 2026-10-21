---
status: planned
created: 2026-10-21
issue: 237
parent_issue: 48
task: 0/2
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #237 (48a): CLI release detection, verified self-update, and checksums

**Goal:** Make the installed wayforge CLI notice new GitHub releases, inform the user without interrupting commands, and safely replace its own binary and `share/wayforge` snapshot after confirmation.

**Architecture:** Add a version helper and a cached release check, then a self-update module that downloads the release binary and share archive, verifies SHA-256 checksums, extracts the share, and replaces the install with backup/rollback. This slice does not touch managed projects, `.wayforge-managed`, or `installed-projects.json`, so it is independent of #229.

**Tech Stack:** TypeScript CLI (`cli/src/**`), Commander, Node 18+ `fetch`, Vitest, GitHub release assets, GitHub Actions release workflow.

**Scope classification:** `multi-task`

**Task count:** 2

## Verified facts

- The CLI version is `process.env.WAYFORGE_VERSION || '0.1.0'` (`cli/src/index.ts:14`); release builds inline the real version with `--define` (`.github/workflows/release.yml:58-65`).
- Installed layout: `<prefix>/bin/wfg` (`wfg.exe` on Windows), `<prefix>/share/wayforge/**` including `VERSION`, and `<prefix>/installed-projects.json` (`docs/ai/architecture.md:31-35`).
- `resolveSourceDir()` prefers `WAYFORGE_HOME`, then `<dir of process.execPath>/../share/wayforge` when `base/` exists (`cli/src/lib/source-dir.ts`). Replacing `share/wayforge` and the binary is sufficient for a new process.
- Release CI uploads `wayforge-<os>-<arch>[.exe]`, `wayforge-share-<version>.tar.gz` / `.zip`, and the installer scripts; it does not publish checksums.
- `install/install.sh` and `install/install.ps1` resolve latest through the `/releases/latest` redirect (`install/install.sh:294-326`, `install/install.ps1:98-125`). The CLI can use `fetch` with redirects instead of an API token.
- `install/install.ps1` replaces `bin/wfg.exe` with `Move-Item -Force` while the CLI may be running (`install/install.ps1:311-313`); self-update needs the Windows rename strategy.
- `cli/package.json` requires Node `>=18.0.0`; Node 18 provides `fetch`, `AbortSignal.timeout`, and `node:stream/promises`.
- Unit tests live in `cli/tests/unit/*.test.ts`; `make check` runs Vitest, typecheck, ESLint, Prettier, and jscpd.

## Tasks

### Task 1: Add release detection, cached notice, and version helpers

**Objective:** Wayforge can resolve the latest GitHub release, compare it with the installed version, cache the check for 24 hours, and print a one-line notice on eligible interactive commands.

**Files:**
- Create: `cli/src/lib/version.ts`
- Create: `cli/src/lib/release.ts`
- Modify: `cli/src/index.ts`
- Validate: `cli/tests/unit/version.test.ts`, `cli/tests/unit/release.test.ts`

**Step 1: Establish expected behaviour**

- `getCurrentVersion()` returns `process.env.WAYFORGE_VERSION` when non-empty; otherwise reads `VERSION` from `resolveSourceDir()` and falls back to `0.0.0`.
- `resolveLatestReleaseVersion()` fetches `${WAYFORGE_RELEASE_ROOT}/latest` (default `https://github.com/Macacoders/wayforge/releases`), follows redirects, parses the final `/tag/vX.Y.Z`, and validates SemVer.
- The update cache lives at `<stateDir>/update-check.json` with `{ schemaVersion, lastChecked, latestVersion, notifiedVersion }`.
- Automatic checks run at most once per 24 hours, only for an installed `wfg`/`wfg.exe`, only on a TTY, not in CI, not with `WAYFORGE_NO_UPDATE_CHECK=1`, and not for `update`, `hooks`, `uninstall`, `self-update`, `--help`, or `--version`.
- A 5-second timeout; network failures are silent.
- When a newer version exists, print to stderr:

  ```text
  [wayforge] update available: vX.Y.Z (current vA.B.C). Run 'wfg self-update' to upgrade.
  ```

- The notice is printed once per `latestVersion` and never fails the command.

**Step 2: Add validation**

`cli/tests/unit/version.test.ts`:

- SemVer comparison (`0.10.0 > 0.9.0`, equality, prerelease);
- `isNewer` true/false cases;
- `getCurrentVersion` prefers `WAYFORGE_VERSION` and falls back to `VERSION`.

`cli/tests/unit/release.test.ts`:

- latest-release parsing from a mocked redirect/final URL;
- rejection of non-tag URLs;
- cache read/write/TTL and corrupt-cache handling;
- notice printed once, opt-out respected, non-TTY/CI/not-installed skipped, network failure never throws.

**Step 3: Write minimal implementation**

- `cli/src/lib/version.ts`: `compareVersions`, `getCurrentVersion`, `isNewer`.
- `cli/src/lib/release.ts`: `releaseRoot`, `resolveLatestReleaseVersion`, cache helpers, `maybeNotifyUpdate`.
- `cli/src/index.ts`: use `getCurrentVersion()` for `--version`; call `maybeNotifyUpdate` before parsing with the first non-option command and `process.stdout.isTTY`.
- Use `fetch` with `redirect: 'follow'`, `AbortSignal.timeout(5000)`, and a `User-Agent: wayforge/<version>` header. Cache writes are best-effort.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/version.test.ts cli/tests/unit/release.test.ts
cd cli; npx tsc --noEmit
npx tsx cli/src/index.ts --help
```

Expected: tests pass, typecheck clean, help still works, and the notice is suppressed in a non-TTY test run.

**Step 5: Commit**

```sh
git add cli/src/lib/version.ts cli/src/lib/release.ts cli/src/index.ts cli/tests/unit/version.test.ts cli/tests/unit/release.test.ts
git commit -m "feat(cli): detect wayforge releases and notify users (Issue #237)"
```

### Task 2: Add verified self-update and release checksums

**Objective:** `wfg self-update` can replace the installed CLI with a newer release after verification, with rollback and a clear fallback if replacement fails.

**Files:**
- Create: `cli/src/lib/self-update.ts`
- Create: `cli/src/commands/self-update.ts`
- Modify: `cli/src/index.ts`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`, `RELEASE.md`, `docs/ai/architecture.md`
- Create: `docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md`
- Validate: `cli/tests/unit/self-update.test.ts`

**Step 1: Establish expected behaviour**

- `wfg self-update --check` reports current vs latest and exits 0.
- `wfg self-update --dry-run` reports the target version and asset URLs without downloading or writing.
- `wfg self-update` prompts `Update wayforge vA.B.C -> vX.Y.Z? [y/N]` unless `--yes`.
- Refuses to run from a dev checkout; prints instructions to use `install.sh` / `install.ps1` or update the checkout.
- Resolves the prefix from `WAYFORGE_INSTALL_DIR` when set, otherwise from the running binary path.
- Downloads the platform binary, the share archive (`.tar.gz` on Unix, `.zip` on Windows), and `wayforge-checksums.txt`.
- Verifies both SHA-256 hashes before touching the install; missing or mismatched checksums abort with no changes.
- Extracts the share to a temporary directory and verifies `VERSION` equals the target and `base/` exists.
- Replaces `share/wayforge` and `bin/wfg[.exe]` with backup/rollback.
- Windows: rename the running `wfg.exe` to `wfg.exe.old-<pid>`, place the new binary, and clean stale backups later.
- Unix: write the new binary to a temporary file, `chmod 0755`, and rename it over `bin/wfg`.
- On failure, restore backups, remove temp files, and print the one-shot installer fallback.

**Step 2: Add validation**

`cli/tests/unit/self-update.test.ts`:

- checksum parsing and verification from `wayforge-checksums.txt`;
- mismatch aborts before replacement;
- extraction verifies `base` and `VERSION`;
- replacement in a temporary prefix replaces binary/share and removes backups;
- injected failure restores the original binary/share;
- local HTTP server using `WAYFORGE_RELEASE_ROOT` serves a fake checksum file, dummy binary, and fixture share archive; `selfUpdate` with an explicit temp prefix updates the prefix.
- Windows rename strategy is exercised where possible; otherwise the backup/rollback contract is unit-tested and the real rename is human-validated.

**Step 3: Write minimal implementation**

- `cli/src/lib/self-update.ts`: `isInstalledBinary`, `resolveInstallPrefix`, `cleanupStaleBackups`, `selfUpdate`, and helpers for download, checksum, extraction, and replacement.
- `cli/src/commands/self-update.ts`: Commander wrapper with `--check`, `--yes`, `--dry-run`.
- `cli/src/index.ts`: register `self-update`.
- `.github/workflows/release.yml`: after creating the share archives, generate `wayforge-checksums.txt` with `sha256sum` for every `dist/wayforge-*` asset and both share archives; upload it.
- Docs: README notice/opt-out/self-update; RELEASE checksum asset and contract; architecture update; ADR-0047 decision record.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/release.test.ts cli/tests/unit/self-update.test.ts
cd cli; npx tsc --noEmit
npx tsx cli/src/index.ts self-update --help
```

Expected: tests pass, typecheck clean, help lists `--check`, `--yes`, `--dry-run`. Running `self-update --check` from the source checkout must refuse with the documented dev-checkout message.

Human validation (required):

- On Windows and one Unix-like host, install a build containing this feature and point `WAYFORGE_RELEASE_ROOT` at a test server serving a newer fake release (or publish a follow-up patch release). Run `wfg self-update --check`, then `wfg self-update --yes`; verify `wfg --version` reports the new version.
- Verify a checksum mismatch aborts without changing the install.
- Verify the Windows running-exe rename succeeds; if not, verify the fallback message is actionable.

**Step 5: Commit**

```sh
git add cli/src/lib/self-update.ts cli/src/commands/self-update.ts cli/src/index.ts .github/workflows/release.yml README.md RELEASE.md docs/ai/architecture.md docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md cli/tests/unit/self-update.test.ts
git commit -m "feat(cli): add verified self-update and release checksums (Issue #237)"
```

## Validation ownership

| Validation | Owner |
|---|---|
| Version/release helper tests | agent |
| Cache/notice tests | agent |
| Self-update checksum/extract/replace/rollback tests | agent |
| Local HTTP-server self-update test | agent |
| `make check` | agent |
| `self-update --help` smoke | agent |
| Real self-update on Windows (running exe rename) | human |
| Real self-update on Linux/macOS | human |
| Checksum mismatch abort on a real install | human |
| Checksums published on the next release | human |

## Acceptance criteria

- [ ] On eligible interactive commands, wayforge checks the latest release at most once per 24 hours, caches the result, and prints a one-line notice when a newer version exists.
- [ ] `WAYFORGE_NO_UPDATE_CHECK=1` disables the automatic notice.
- [ ] `wfg self-update --check` reports current and latest.
- [ ] `wfg self-update` prompts, verifies SHA-256 checksums, replaces the binary and `share/wayforge`, rolls back on failure, and reports the new version.
- [ ] Missing or mismatched checksums abort with no changes.
- [ ] Self-update refuses from a dev checkout and prints an actionable installer fallback.
- [ ] `.github/workflows/release.yml` publishes `wayforge-checksums.txt` covering every binary and both share archives.
- [ ] Tests cover version comparison, release resolution/cache/notice, checksum verification, replacement, and rollback.
- [ ] `make check` is green.

## Out of scope

- `wfg status`, `wfg update --all`, managed-project pruning, and Git hooks (#238).
- `installed-projects.json` and `.wayforge-managed` changes (#229).
- A daemon or OS scheduler that checks while the CLI is idle.
- Automatic installation without user confirmation.
- Runtime notifier plugins (#239).

## Dependencies and blockers

- Independent of #229.
- Requires the release workflow checksum change to land with or before the release that ships self-update.
- First release containing self-update must publish `wayforge-checksums.txt`; users install that release with the existing one-shot installer.
- Parent: #48.
