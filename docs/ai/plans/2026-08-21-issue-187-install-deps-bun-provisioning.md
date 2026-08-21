---
status: completed
created: 2026-08-21
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: true
---

# Issue #187: make install-deps does not provision bun, but make cli-binary requires it

## Goal

Make `qa/install-deps` auto-provision `bun` via the official platform installers (no manual PATH handling) so a fresh `make install-deps` leaves a machine able to run `make cli-binary`.

## Confirmed decisions

- **Install method** — official platform installers, exactly as in bun's documentation:
  - Linux: `curl -fsSL https://bun.com/install | bash`
  - Windows (Git Bash/MSYS): `powershell -c "irm bun.sh/install.ps1|iex"`
  - macOS (Darwin): same curl installer as Linux.
- **PATH** — `install-deps` does not manipulate PATH or shell profiles; provisioning is delegated to the official `install` / `install.ps1` scripts.
- **Scope** — `qa/install-deps` only; no Makefile or CI workflow changes.
- **Auto-install** — unattended, no version pin (matches `oven-sh/setup-bun@v2` latest).

## Scope Classification

- **Size**: Small (single bash file, ~20–30 added lines).
- **Phase budget**: 1.
- **Phase budget rationale**: One-file, self-contained QA provisioning edit with a single reviewable deliverable. Splitting further adds ceremony without review value.
- **Quick delivery eligible**: Yes (small, low-risk, single file) — but user elected the staged/planned path.
- **Split required**: No.
- **Architect review**: Not required (no architecture-boundary change; no ADR).

## Phase 1: Auto-provision `bun` in `qa/install-deps`

**Scope**: Edit `qa/install-deps` only.

1. Update the top comment block (line 8) to list `bun` as a verified/auto-installed dependency.
2. Add a `==> Checking bun` section before the final `Verifying installed tools` block:
   - `command -v bun` → if present, skip install.
   - else detect OS (`uname -s`) and run:
     - `MINGW*`/`MSYS*`/`CYGWIN*` → `powershell -c "irm bun.sh/install.ps1|iex"`
     - otherwise (`Linux`, `Darwin`) → `curl -fsSL https://bun.com/install | bash`
   - Tolerant verify after install: pass if `command -v bun` **or** `[ -x "$HOME/.bun/bin/bun" ]`; print the "restart shell / re-source profile" note when only the binary path is present; exit non-zero only if the install truly failed.
3. Add `bun` to the `Verifying installed tools` block using the same tolerant check (aligns with criterion #1 without false-failing a same-session fresh install).

**Acceptance criteria**:

- [ ] `qa/install-deps` verifies `bun` alongside the existing `node`/`npm` checks.
- [ ] Missing `bun` triggers unattended install via the platform-appropriate official installer; install failure exits non-zero.
- [ ] Top comment block (line 8) reflects `bun` as a verified dependency.
- [ ] `bash -n qa/install-deps` passes; `make check-bash` (shfmt + ShellCheck) clean.
- [ ] On a machine without `bun`: `make install-deps` installs it; in a **new** shell, `bun --version` and `make cli-binary` succeed.
- [ ] No regression: `shellcheck`, `shfmt`, `bats`, `node`, `npm`, `pwsh` checks still pass.

**Risks**:

- Network dependency (curl/irm download) and `~/.bun/bin` PATH nuance — mitigated by tolerant verification + restart note.
- `unzip` is a Linux prerequisite for the bun installer; if absent, the official script fails — surfaced via non-zero exit + bun's own error output.

## Validation Strategy

- `bash -n qa/install-deps` (syntax) — always run.
- `make check-bash` (shfmt + ShellCheck) — validates style/lint on the edited script.
- `make install-deps` then `bun --version` in a fresh shell (author/manual or CI-side verification; requires network + a bun-less environment).
- **No new tests recommended** — provisioning script with an external network side effect; existing bash lint (`check-bash`) already covers it, and a bats test for auto-install would require live network + `bun`, adding little regression value.

## Decisions To Record

- `install-deps` auto-installs `bun` via official platform installers; PATH provisioning delegated to the official script (no profile editing in-repo). Record as a monthly-log note; no ADR and no `architecture.md` change (not an architectural boundary).
