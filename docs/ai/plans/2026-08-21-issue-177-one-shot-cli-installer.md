---
status: completed
created: 2026-08-21
phase: 4/4
required_gates:
  test_verdict: true
  architect_review: true
  memory_update: true
---

# Issue #177 (+ #50): One-shot CLI installer (curl | sh / irm | iex)

## Goal

Replace the ad-hoc install surface with a Bun-style **one-shot installer** so `ai-config` is a first-class global CLI on Linux, macOS, and Windows — resolving #50 (global CLI installation) through #177 (standard install mechanism).

The finalized model is **not** `./configure && make && make install`. Since the distributable is a prebuilt `bun build --compile` binary plus a static `base/` snapshot (no user-facing build flags, no runtime deps for end users), the install ceremony reduces to "fetch two artifacts and place them in a prefix." The standard flow becomes:

```bash
# Linux / macOS
curl -fsSL https://github.com/Macacoders/ai-config/releases/latest/download/install.sh | sh
ai-config install --repo /path/to/your-project
ai-config uninstall --repo /path/to/your-project   # remove config from a repo

# Windows
powershell -c "irm https://github.com/Macacoders/ai-config/releases/latest/download/install.ps1 | iex"
ai-config install --repo C:\path\to\project
```

This **replaces** the `./configure && make && make install` goal recorded in #177. The goal change is documented in a #177 comment (see "Decisions To Record").

## Two meanings, now separated

The ambiguity that motivated #177 is resolved by naming four distinct operations:

| Operation | Surface | State |
|---|---|---|
| Install the **CLI** (self) | `install.sh` / `install.ps1` | **new** (this work) |
| Install **config into a repo** | `ai-config install --repo <path>` | exists |
| Uninstall the **CLI** (self) | `install.sh --uninstall` / `install.ps1 -Uninstall` | **new** (this work) |
| Uninstall **config from a repo** | `ai-config uninstall --repo <path>` | exists |

## Confirmed Decisions

1. **Option A — two artifacts**, not an embedded self-contained binary. The release publishes the compiled binary **and** a `share` archive (`base/` + `VERSION`). The installer places both. A single embedded binary (Option B) is the cleaner end-state but is a larger rewrite deferred to a post-1.0 simplification.
2. **Retire the `make` install surface entirely.** `./configure`, `make install`, and `make uninstall` are not created. The Makefile keeps only `cli-binary` (contributor/CI build), `check`, `clean`, and the existing QA targets.
3. **Dedicated self-contained prefix** (Bun/Rust/Homebrew pattern), not a shared `~/.local`:
   - Linux/macOS: `~/.ai-config/` (already the de-facto user dir — `bootstrap.sh` caches binaries there today)
   - Windows: `%LOCALAPPDATA%\ai-config\`
   - Layout: `bin/ai-config`, `share/ai-config/` (snapshot), `installed-projects.json` (per-user tracking)
4. **PATH registration**: Linux/macOS — print the export line + best-effort append to `~/.bashrc`/`~/.zshrc` behind a marker block (never touch unrelated content). Windows — silently add the `bin` dir to the **User** PATH (`SetEnvironmentVariable ... 'User'`, admin-free).
5. **Uninstall** = `--uninstall` / `-Uninstall` flag on the same installer. Removes the install directory (one `rm -rf`) + the exact PATH entry it added. `--dry-run` supported. No file manifest needed because everything lives under one owned directory.
6. **Snapshot granularity**: full `base/` + `VERSION` (small; avoids subset fragility).
7. **Runtime resolution** gains a location-based `../share/ai-config` rung (details in Phase 1). `AI_CONFIG_HOME` remains the explicit override escape hatch.
8. **Tracking relocation**: `installed-projects.json` moves from `sourceDir` (which becomes a shared/possibly-read-only `share/` dir) to the per-user prefix.

## Scope Classification

- **Size**: Medium-Large (CLI internals + CI/release + two new installer scripts + docs/ADR/retirement)
- **Phase budget**: 4
- **Phase budget rationale**: Four independent reviewable surfaces — (1) CLI foundation, (2) release artifacts, (3) user-facing installers, (4) retirement + docs/memory. Phases 1 and 2 are mutually independent; 3 depends on 1+2; 4 depends on 3. Compressing would mix testable TS changes with CI and shell-script work.
- **Quick delivery eligible**: No — multi-surface, cross-platform, release-impacting.
- **Split required**: No.
- **Architect review**: Required — Phase 1 touches cross-module API (`resolveSourceDir`) + persistence location (`installed-projects.json`); Phase 2 touches deployment/distribution topology (release artifacts, Windows runners, installer asset hosting). See "Delivery Notes".

## Delivery Notes

- **Branch**: work on a feature branch off `develop` (e.g. `feature/issue-177-one-shot-installer`); PR back to `develop`. This work spans issues **#177** and **#50**.
- **Phase ordering / parallelism**: Phase 1 and Phase 2 are independent and may run in separate sessions in parallel. Phase 3 requires both 1 and 2. Phase 4 requires 3.
- **Soft cross-phase dependency**: Phase 2's release workflow uploads `install.sh`/`install.ps1` as release assets, but those files are *created* in Phase 3. That is fine — the workflow only runs at release time, after all phases have landed. Do not block Phase 2 on the scripts' existence.
- **Architect review-only scope** (delivery step 0): on Phase 1, confirm `resolveSourceDir()` precedence + tracking-location change reconcile with ADR-0032 (second amendment) and ADR-0031 (Windows parity). On Phase 2, confirm the release-artifact/installer-hosting topology reconciles with the new ADR and ADR-0033 (legacy freeze). The new ADR itself is authored by planner in Phase 4; the architect may review it but must not author code/phases.
- **ADR number is tentative**: Phase 4 uses `ADR-0034` as a placeholder; the session should confirm the next free number on disk (`ls docs/ai/decisions/`) before writing.
- **Deferred validation** (not blockers): Windows `install.ps1` smoke and end-to-end `curl | sh` against a live release cannot run on a Linux dev box or without a published release. They are validated on first release, not as phase gates.
- **`test` invocation**: Phase 1 is the only phase with opt-in unit-test changes (updating existing test files, no new test files). Phases 2–4 are CI/docs/scripts and carry an explicit no-new-tests rationale.

## Phases

### Phase 1: CLI foundation — runtime resolution + tracking relocation

**Files to touch**: `cli/src/lib/source-dir.ts`, `cli/src/lib/tracking.ts`, `cli/src/commands/install.ts`, `cli/src/commands/uninstall.ts`, `cli/tests/unit/source-dir.test.ts`, `cli/tests/unit/tracking.test.ts`, `cli/tests/unit/uninstall.test.ts`.

**Scope**:

1. `cli/src/lib/source-dir.ts` — extend `resolveSourceDir()` to three rungs, location-based (no `process.versions.bun` discriminator):
   1. `AI_CONFIG_HOME` (non-empty) → `path.resolve(env)`
   2. `path.join(path.dirname(process.execPath), '..', 'share', 'ai-config')` — **only if `base/` exists there**
   3. dev fallback `path.resolve(__dirname, '..', '..', '..')`

   The `base/`-existence guard is what makes rung 2 safe: under `npx tsx` the `execPath` is the `node` binary (e.g. `/usr/bin/node` → `/usr/share/ai-config`, no `base/`), so it falls through to dev; under a compiled binary at `~/.ai-config/bin/ai-config` it resolves `~/.ai-config/share/ai-config`. This is the "runtime-relative fallback" that ADR-0032 deferred to this issue.

2. `cli/src/lib/tracking.ts` — write `installed-projects.json` to the per-user prefix instead of `sourceDir`/`rootDir`:
   - Add `resolveStateDir()` (Linux/macOS `~/.ai-config`, Windows `%LOCALAPPDATA%\ai-config`).
   - `trackInstalledProject` / `removeTrackingEntry` use `path.join(resolveStateDir(), 'installed-projects.json')`; drop the now-unused `rootDir` param and update call sites in `cli/src/commands/install.ts` and `cli/src/commands/uninstall.ts`.
   - No new env var (YAGNI); `~/.ai-config` / `%LOCALAPPDATA%\ai-config` is the canonical state dir.

3. Tests — update `cli/tests/unit/source-dir.test.ts` (add the `../share/ai-config` rung: fires when `base/` exists at `execPath/../share/ai-config`, falls through otherwise — use a temp `share/ai-config/base` fixture and stub `process.execPath`), and `cli/tests/unit/tracking.test.ts` (assert writes land in the state dir, not `sourceDir`). Adjust `cli/tests/unit/uninstall.test.ts` for the `removeTrackingEntry` signature change.

**Atomic stages**:

1. `resolveSourceDir()` three-rung change + `source-dir.test.ts` update → validate `npx vitest run cli/tests/unit/source-dir.test.ts`.
2. `tracking.ts` state-dir relocation + `install.ts`/`uninstall.ts` call-site updates + `tracking.test.ts`/`uninstall.test.ts` updates → validate `npx vitest run cli/tests/unit/tracking.test.ts cli/tests/unit/uninstall.test.ts`.

**Acceptance criteria**:

- [ ] `resolveSourceDir()` has exactly three rungs; no `process.versions.bun` reference.
- [ ] Installed-layout resolution works: binary at `<prefix>/bin/ai-config` + snapshot at `<prefix>/share/ai-config/base` resolves the snapshot.
- [ ] Dev fallback unchanged for `npx tsx` (no `base/` beside the node binary).
- [ ] `installed-projects.json` is written to/read from the per-user state dir on both platforms.
- [ ] `make check` passes (vitest + `tsc --noEmit` + ESLint + Prettier + jscpd).

**Validation**: `make check` (final gate); `npx vitest run` per stage above.

**Risks**:

- `process.execPath` stubbing + temp-fixture test is fiddly; keep it to the minimal cases (guard fires / guard falls through / env override wins).
- WSL: `process.platform` is linux, so `~/.ai-config` (Linux home) is used — consistent with how `bootstrap.sh` already caches under `~/.ai-config/bin`.

### Phase 2: Release artifacts — Windows binaries + share archive + installer hosting

**Files to touch**: `.github/workflows/release.yml` only.

**Scope**:

1. Add Windows runners to the `build-binaries` matrix: `windows-latest` with `win32-x64` and `win32-arm64`. Bun `--compile` must emit a `.exe` on Windows → asset name `ai-config-win32-<arch>.exe` (Linux/darwin keep the extensionless `ai-config-<os>-<arch>`).
2. Produce a **share archive** per release containing `base/` + `VERSION` at archive root (extraction yields `base/...` and `VERSION`):
   - `ai-config-share-<version>.tar.gz` (POSIX installer uses it)
   - `ai-config-share-<version>.zip` (Windows installer uses it)
   - Build in the release job (ubuntu) — tar.gz via `tar -czf`; zip via `python3 -m zipfile -c` or `bsdtar` (no `zip` package assumption).
3. **Upload the installer scripts as release assets** so `releases/latest/download/install.sh` and `releases/latest/download/install.ps1` resolve: add `install/install.sh` and `install/install.ps1` to the `gh release upload` step. (Files are created in Phase 3; the workflow runs only at release time, after they exist.)

**Atomic stages**:

1. Windows runners in the matrix.
2. Share archive creation + inclusion in the upload.
3. Installer-script asset upload.

(No local validation — this is CI-only; correctness is confirmed on the next release/tag push.)

**Acceptance criteria**:

- [ ] Matrix produces `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64.exe`, `win32-arm64.exe`.
- [ ] `ai-config-share-<version>.tar.gz` and `.zip` are attached to the release; both contain `base/` + `VERSION` at root.
- [ ] `install.sh` and `install.ps1` are attached as release assets (names exactly `install.sh` / `install.ps1`, matching the `latest/download/` URLs).
- [ ] Binary/asset names are stable and deterministic (Phase 3 installers depend on the exact URL scheme).

**Validation**: none locally (CI-only). Review is by workflow YAML inspection + `git diff`; first-real-release smoke is deferred.

**Risks**:

- Windows binary naming (`.exe` suffix) and whether the existing `gh release upload dist/ai-config-*` glob still matches — it will, `.exe` files are matched by `ai-config-*`.
- Zip tooling on the ubuntu runner — use `python3 -m zipfile -c` (always present) rather than assuming `zip`.
- Installer-script asset upload must match the exact `latest/download/` names or `curl | sh` 404s.

### Phase 3: One-shot installers + uninstall

**Files to touch**: `install/install.sh` (new), `install/install.ps1` (new).

**Scope**:

1. `install/install.sh` (POSIX sh, `set -euo pipefail`):
   - Detect OS/arch (linux/darwin, x64/arm64; clear error on unsupported).
   - Options: `--prefix <dir>` / `AI_CONFIG_INSTALL_DIR` (default `~/.ai-config`), `--version <v>` (default latest release), `--uninstall`, `--dry-run`, `--url-base <base>` (test override, default `https://github.com/Macacoders/ai-config/releases/<ref>/download`).
   - Install: mkdir `bin` + `share`; download binary → `<prefix>/bin/ai-config` (+`chmod +x`); download share tarball → extract to `<prefix>/share/ai-config`; verify `<prefix>/share/ai-config/base` exists; print the PATH export line and best-effort append to `~/.bashrc`/`~/.zshrc` behind a `# ai-config` marker block (only when absent; never edit other content).
   - Uninstall: remove `<prefix>/bin/ai-config`, `<prefix>/share/ai-config`, `<prefix>/installed-projects.json`, and the exact marker PATH block; `--dry-run` prints actions only. Idempotent (re-run overwrites).
2. `install/install.ps1` (PowerShell 5.1+, the `irm | iex` target):
   - Same behavior in PowerShell: detect AMD64/ARM64 (reject x86); default `%LOCALAPPDATA%\ai-config`; download `ai-config-win32-<arch>.exe` → `bin\ai-config.exe`; download share zip → `share\ai-config\`; add `bin` to **User** PATH via `[Environment]::SetEnvironmentVariable('Path', …, 'User')` (no elevation); `-Uninstall` removes dir + User PATH entry; `-DryRun`.
3. Both scripts: clear, stable error messages; zero dependencies beyond `curl`/`wget` (sh) and `Invoke-WebRequest`/`Expand-Archive` (pwsh); no elevated privileges.

**Atomic stages**:

1. `install.sh` — install path (+ `--prefix`, `--version`, `--url-base`, `--dry-run`).
2. `install.sh` — uninstall path (`--uninstall`) + PATH marker append/remove.
3. `install.ps1` — install path (+ User PATH set) then uninstall path (`-Uninstall`) + `-DryRun`.

**Acceptance criteria** (smoke; scripts are not unit-tested):

- [ ] `install.sh --dry-run` prints the correct download/place/PATH actions with no side effects.
- [ ] `install.sh` against a local mock URL (`--url-base`) installs binary + snapshot to `~/.ai-config` with the exact layout; a compiled `ai-config` then resolves `share/ai-config/base` (Phase 1 rung).
- [ ] `install.sh --uninstall` removes the directory + PATH marker; re-run is a no-op.
- [ ] `install.ps1 -DryRun` / install / `-Uninstall` behave analogously on Windows; User PATH entry added/removed without elevation.
- [ ] Idempotent re-install overwrites cleanly.

**Validation**: `bash -n install/install.sh` (syntax) + `install.sh --dry-run` + `install.sh --url-base <local fixture>` round-trip on Linux. PowerShell: `-DryRun`/install/`-Uninstall` on a Windows host (deferred if unavailable). No `make check` impact (duplication gate is TS-only).

**Risks**:

- Shell portability — target POSIX `sh` compatible with bash/dash; avoid bashisms.
- Windows execution-policy friction with `irm | iex` — document `-ExecutionPolicy Bypass` guidance in README (Phase 4), not a code workaround.
- End-to-end download can't be automated without a live release → rely on `--url-base` override + fixture smoke tests.

### Phase 4: Retire legacy entrypoints + docs/memory/ADR + issue ops

**Files to touch**: `install/bootstrap.sh` (→ legacy), `install/bootstrap.ps1` (→ legacy), `README.md`, `RELEASE.md`, `docs/ai/architecture.md`, new ADR, amended `ADR-0032`, `ADR-0033`, monthly log, plan frontmatter.

**Scope**:

1. Move `install/bootstrap.sh` → `install/legacy/bootstrap-thin.sh` and `install/bootstrap.ps1` → `install/legacy/bootstrap-thin.ps1` (frozen reference; non-colliding names beside the existing `bootstrap-legacy.*`). Their only remaining value (`--ref` install) is a CLI flag (`ai-config install --ref <tag>`), not a wrapper concern.
2. Docs:
   - `README.md` — lead with the one-shot install (`curl … | sh` / `irm … | iex`); clearly separate "install the CLI" from "install config into a repo"; document self-uninstall; drop `./install/bootstrap.sh` and `npx tsx` as primary paths; note Windows execution-policy guidance.
   - `RELEASE.md` — document the new release artifacts (Windows binaries + share archives + installer scripts) and the install/uninstall contract.
   - `docs/ai/architecture.md` — update "Installed Surface": one-shot installer, dedicated prefix layout, tracking-file location, `resolveSourceDir()` three rungs.
3. Memory:
   - New ADR (next free number on disk; `ADR-0034` is a placeholder) — dedicated prefix, two-artifact distribution, install/uninstall split, PATH policy.
   - Amend `ADR-0032` — `resolveSourceDir()` gains the `../share/ai-config` rung (second amendment; note it is now location-based, guarded by `base/` existence).
   - Note in `ADR-0033` — the frozen legacy set now also includes the retired thin `bootstrap-thin.{sh,ps1}` entrypoints.
   - Monthly log entry + plan frontmatter (`phase`, then `status: completed`).
4. Issue ops (via `npx tsx .opencode/skills/shared-task/scripts/gh-issue.ts`):
   - Close #50 (resolved by this work).
   - Comment on #177 recording the goal change (`./configure && make && make install` → one-shot installer), Option A, and the dedicated-prefix decision.

**Atomic stages**:

1. Move `bootstrap.{sh,ps1}` → `install/legacy/`; grep to confirm zero live references.
2. Docs: README, RELEASE, architecture.
3. Memory: new ADR + amend ADR-0032/0033 + monthly log + plan frontmatter.
4. Issue ops: close #50 + comment #177.

**Acceptance criteria**:

- [ ] `install/bootstrap.sh`/`.ps1` moved to `install/legacy/`; full-repo grep shows zero live references outside historical plans/logs.
- [ ] README leads with the one-shot installer; the two install meanings and two uninstall meanings are separated.
- [ ] RELEASE.md + architecture.md updated.
- [ ] New ADR written; ADR-0032 amended; ADR-0033 note added.
- [ ] #50 closed; #177 commented with the goal-change decision.
- [ ] `make check` passes.

**Validation**: `make check`; `rg "bootstrap\.(sh|ps1)" -g '!docs/ai/plans/**' -g '!docs/ai/logs/**'` returns no live references; ADR number confirmed via `ls docs/ai/decisions/`.

**Risks**:

- Hidden consumer references to `bootstrap.sh` — ruled out pre-plan by the thin-wrapper architecture (only README/RELEASE/architecture reference it; verified in #176/#178 work).
- Users on older clones lose the wrapper — accepted (retired, frozen reference remains under `legacy/`).

## Validation Strategy

- **Gate**: `make check` (vitest + `tsc --noEmit` + ESLint + Prettier + jscpd). Duplication gate is TS-only (`--pattern "**/*.ts"`), so the new shell/pwsh scripts do not affect it.
- **Unit (approved, Phase 1)**: `resolveSourceDir()` three-rung precedence; tracking writes to state dir — covered by updated `source-dir.test.ts` / `tracking.test.ts` (existing opt-in unit budget; no new test files beyond updating these).
- **Smoke (manual, Phase 3)**: `install.sh --dry-run`; `install.sh --url-base <fixture>` install/uninstall round-trip; `install.ps1 -DryRun`/install/`-Uninstall` on Windows. End-to-end download validated against the first real release.
- **No-new-tests rationale (Phases 2–4)**: CI workflow, shell/PowerShell installer scripts, and docs/memory have no unit-test harness and carry no repeatable pure logic worth a new test file; they are covered by syntax checks, smoke round-trips, and git-evidence review.
- **Deferred**: full cross-platform CI install/uninstall matrix (needs a published release); embedded-single-binary (Option B) as a post-1.0 simplification.

## Definition of Done

- [ ] All four phases implemented, reviewed, and merged to `develop`.
- [ ] `make check` green; Phase 1 unit tests updated and passing.
- [ ] `install.sh`/`install.ps1` + `ai-config-share-*` + Windows binaries present on the next GitHub release.
- [ ] README/RELEASE/architecture lead with the one-shot installer; `bootstrap.{sh,ps1}` retired to `legacy/`.
- [ ] New ADR + ADR-0032/0033 amendments recorded; #50 closed; #177 commented with the goal change.
- [ ] Plan frontmatter `status: completed`; monthly log entry written.

## Decisions To Record

1. One-shot installer replaces `./configure && make && make install` (goal change) → #177 comment + new ADR + monthly log.
2. Option A (two artifacts) over embedded single binary → new ADR; Option B deferred as a recorded follow-up.
3. Dedicated prefix `~/.ai-config` / `%LOCALAPPDATA%\ai-config` → new ADR; replaces the shared-`~/.local` default in #177.
4. `resolveSourceDir()` third rung (location-based `../share/ai-config`, guarded by `base/` existence) → ADR-0032 second amendment.
5. `installed-projects.json` relocation from `sourceDir` to per-user state dir → new ADR; resolves the read-only/share-prefix regression risk.
6. `make install`/`uninstall`/`configure` never created; `make cli-binary` retained as contributor/CI build only → architecture.md.
7. Four named operations (CLI install/uninstall vs repo install/uninstall) → README + architecture.md.
