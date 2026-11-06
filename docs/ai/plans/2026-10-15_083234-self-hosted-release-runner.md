---
status: completed
created: 2026-10-15
task: 1/1
required_gates:
  architect_review: true
  memory_update: true
---

# Self-hosted release runner with cross-compiled binaries Implementation plan

**Goal:** Make `.github/workflows/release.yml` build and publish every release artifact on the project's single self-hosted Linux x64 runner, by replacing native per-OS builds with Bun cross-compilation (`--target`).

**Architecture:** The `build-binaries` matrix currently runs a different GitHub-hosted runner per target and compiles natively. We pin both jobs to the registered self-hosted runner (`runs-on: [self-hosted, linux, x64]`) and add a `target:` field per matrix entry, passed to `bun build --compile --target=…`. Bun embeds each target's runtime, so one Linux x64 host emits all six platform binaries. Artifact **names are unchanged**, so `install/install.sh` / `install.ps1` download URLs and the `release` job's artifact glob keep working.

**Tech Stack:** GitHub Actions (self-hosted runner), Bun `--compile --target`, POSIX shell steps, Markdown docs.

**Scope classification:** `single-task` (one outcome: the release pipeline runs on the self-hosted runner)

## Preconditions (operational — not code changes)

These are done outside this plan but are required for it to work:

1. Self-hosted Linux x64 runner registered against `https://github.com/Macacoders/wayforge` and showing **Idle** under Settings → Actions → Runners. Its default labels provide `self-hosted`, `linux`, `x64`.
2. Runner host prerequisites installed: `git`, `curl`, `unzip`, `tar`, `ca-certificates`, `python3`, `gawk`, and `gh` (GitHub CLI).
3. Local clone remote updated: `git remote set-url origin git@github.com:Macacoders/wayforge.git` (keep the `git@` protocol).

## Target matrix → artifact mapping (invariant, must not drift)

| `target` (new) | artifact `os`-`arch` | On-disk file |
|---|---|---|
| `bun-linux-x64` | `linux-x64` | `wayforge-linux-x64` |
| `bun-linux-arm64` | `linux-arm64` | `wayforge-linux-arm64` |
| `bun-darwin-x64` | `darwin-x64` | `wayforge-darwin-x64` |
| `bun-darwin-arm64` | `darwin-arm64` | `wayforge-darwin-arm64` |
| `bun-windows-x64` | `win32-x64` | `wayforge-win32-x64.exe` |
| `bun-windows-arm64` | `win32-arm64` | `wayforge-win32-arm64.exe` |

`install/install.sh` builds `BINARY_NAME="wayforge-${OS}-${ARCH}"` (linux/darwin); `install/install.ps1` builds `wayforge-win32-${Arch}.exe`. Names above keep those contracts intact.

## Tasks

### Task 1: Retarget the release workflow to the self-hosted runner and document it

**Objective:** Both workflow jobs run on `[self-hosted, linux, x64]`, the six binaries are produced via cross-compilation, and `RELEASE.md` describes the new build topology.

**Files:**
- Modify: `.github/workflows/release.yml[:12-63]` (`build-binaries` job: runner + matrix + build step)
- Modify: `.github/workflows/release.yml[:65-67]` (`release` job: runner)
- Modify: `RELEASE.md[:229-272]` (Release Automation + artifact-generation sections)

**Step 1: Establish expected behaviour**

A push to `main` schedules `build-binaries` on the self-hosted runner. Each of the six matrix jobs runs `bun build --compile --target=<target>` on the Linux x64 host and uploads an artifact whose **name and filename are identical to today's** (`wayforge-linux-x64`, …, `wayforge-win32-arm64.exe`). The `release` job (also on the self-hosted runner) downloads all six artifacts, builds `wayforge-share-<version>.tar.gz`/`.zip`, and runs `gh release create` + `gh release upload` with `install/install.sh` and `install/install.ps1`. No change to artifact names, the changelog-extraction step, or the release body.

**Step 2: Add or update validation**

There is no existing automated test for the workflow YAML. Add validation:

- Static: run `actionlint .github/workflows/release.yml` if available (lints `runs-on`, expressions, `needs`).
- Behavioural (local, non-interactive): reproduce one cross-compile on the runner host to prove `--target` works and emits a foreign-format binary:
  ```bash
  bun build ./cli/src/index.ts --compile --target=bun-darwin-arm64 \
    --outfile /tmp/wayforge-darwin-arm64 --define "process.env.WAYFORGE_VERSION:$(cat VERSION)"
  file /tmp/wayforge-darwin-arm64   # expect: Mach-O 64-bit arm64
  ```
  Repeat for `bun-windows-x64` (expect `PE32+`/`MS Windows`) and `bun-linux-arm64` (expect `ELF … ARM aarch64`). This is the key risk: a missing/invalid `--target` silently produces a host-arch binary that is wrongly labelled.
- End-to-end (manual): see Step 4 human validation.

**Step 3: Write minimal implementation**

Replace the `build-binaries` job header/matrix (`.github/workflows/release.yml:12-40`):

```yaml
  build-binaries:
    runs-on: [self-hosted, linux, x64]
    strategy:
      matrix:
        include:
          - os: linux
            arch: x64
            target: bun-linux-x64
            ext: ''
          - os: linux
            arch: arm64
            target: bun-linux-arm64
            ext: ''
          - os: darwin
            arch: x64
            target: bun-darwin-x64
            ext: ''
          - os: darwin
            arch: arm64
            target: bun-darwin-arm64
            ext: ''
          - os: win32
            arch: x64
            target: bun-windows-x64
            ext: .exe
          - os: win32
            arch: arm64
            target: bun-windows-arm64
            ext: .exe
```

Update the build step (`.github/workflows/release.yml:54-58`) to pass `--target`:

```yaml
      - name: Build standalone binary
        shell: bash
        run: |
          mkdir -p dist
          bun build ./cli/src/index.ts --compile \
            --target=${{ matrix.target }} \
            --outfile "dist/wayforge-${{ matrix.os }}-${{ matrix.arch }}${{ matrix.ext }}" \
            --define "process.env.WAYFORGE_VERSION:$(cat VERSION)"
```

Point the `release` job at the runner (`.github/workflows/release.yml:65-67`):

```yaml
  release:
    runs-on: [self-hosted, linux, x64]
    needs: build-binaries
```

Update `RELEASE.md`:
- In **Release Automation** (line ~233) note the workflow runs on the project's self-hosted Linux x64 runner, and that the tag is derived from `VERSION` and `main` is the trigger (correct the stale "Pushing the tag triggers…" sentence at lines 95-96).
- In **Release artifact generation and attachment** (lines ~254-272) replace "Platform binaries produced by `bun build --compile`" with a note that all six binaries are cross-compiled on the single Linux x64 runner via `--target`, and list the runner prerequisite packages + label (`[self-hosted, linux, x64]`).
- Note the cross-compiled Windows/macOS binaries cannot be smoke-executed on the runner (compile-only verification for those targets).

Do **not** change: artifact names, share-archive names, the changelog-extraction `awk` step, `permissions`, or the `gh release` command.

**Step 4: Run test to verify pass**

Agent (bounded, local):
- `actionlint .github/workflows/release.yml` (if installed) → no errors.
- The three `bun build --target=…` smoke builds from Step 2 → `file` reports the expected foreign formats, and `make cli-binary` still builds the native binary (`dist/wayforge-linux-x64`).

Human (requires pushing to `main` / external infra):
- Confirm the runner is Idle, then push `main` and watch the run:
  ```bash
  git checkout main && git merge develop && git push origin main
  ```
  Expected: `build-binaries` runs six jobs on `self-hosted`, all green; `release` creates the GitHub Release with six binaries + `wayforge-share-<version>.tar.gz` + `.zip` + `install.sh` + `install.ps1`.
- Download a Windows/macOS asset and run it on the matching platform to confirm it executes (cannot be validated on the runner).

**Step 5: Commit**

`git add .github/workflows/release.yml RELEASE.md`
`git commit -m "ci: build release binaries on self-hosted runner via cross-compilation"`

---

## Validation ownership summary

| Validation | Owner |
|---|---|
| `actionlint` on the workflow; local `bun build --target` smoke builds; `file` format checks; `make cli-binary` | agent |
| Push `main` → verify six artifacts + release; execute Windows/macOS asset on real hardware | human |

## Required gates

- **architect_review: true** — this changes deployment topology (release builds move from GitHub-hosted to a self-hosted runner) and introduces a runner-trust security consideration. An ADR should record the self-hosted-runner + cross-compilation decision and the "release workflow is `push: main` only, never `pull_request`" constraint.
- **memory_update: true** — update `RELEASE.md` (Task 1) and record a `docs/ai/logs/` entry at completion.

## Blocking decisions

1. **Packaging model (A vs B).** This plan implements **A** — keep native per-platform binaries, cross-compile them from one runner. The alternative **B** — ship a single bundled `index.js` executed by the already-provisioned Node (see `install/install.sh` `ensure_node`, `cli/src/lib/prereq.ts`) — would collapse the matrix to one artifact and remove cross-compilation entirely, but is a larger change to installers and packaging. **Confirm A is intended for this release; B would be a separate plan.**
2. **`release` job location.** This plan moves the `release` job onto the self-hosted runner (requires `gh`, `python3`, `gawk` on the host). If preferred, keep `runs-on: ubuntu-latest` for that job only — it is lighter and `gh` is preinstalled there. **Confirm which.**
3. **Runner concurrency.** A single runner executes the six matrix jobs serially (not in parallel); total build time is the sum of six compiles. Acceptable, or add more runner workers? **Confirm acceptable.**
4. **x64 SIMD baseline.** If end users report `Illegal instruction` on x64, switch `bun-linux-x64`/`bun-windows-x64` to `-baseline` variants. Not applied now (insufficient evidence); recorded as a known lever.
5. **Repo rename sequencing.** The GitHub repo must already be renamed to `Macacoders/wayforge` and the runner registered against the new URL before the first run, or `actions/checkout` and `gh release` target the wrong repo.
6. **`RELEASE.md` trigger correction.** Lines 95-96 wrongly state the tag push triggers the workflow; the trigger is `push: branches: [main]`. Fixing it is in scope for Task 1 — confirm no objection to correcting unrelated-but-wrong text.

## Out of scope

- Option B (single JS artifact) and any installer/packaging changes.
- Registering the runner or installing host packages (operational preconditions above).
- Updating the local git remote URL (operational precondition).
- Version bump / tag creation / actual release cut.

## Post-completion follow-up: missing dependency install (2026-10-15)

The first live run of the retargeted workflow failed on every matrix job with:

```text
error: Could not resolve: "commander". Maybe you need to "bun install"?
```

**Root cause (pre-existing, not introduced by this plan):** `.github/workflows/release.yml` never had a dependency-install step. `actions/checkout` → `oven-sh/setup-bun@v2` → `bun build --compile` left `node_modules` empty, and `bun build` does not auto-install packages (bundler auto-install landed in a later Bun release, not 1.4.0). The same failure would have occurred on the original GitHub-hosted runners; it was latent from the day the workflow was written.

**Fix** (`70cc59a` `fix(ci): install dependencies before compiling release binaries`) adds, after `setup-bun`:

```yaml
      - name: Install dependencies
        shell: bash
        run: bun install --frozen-lockfile
```

Verified on a clean tree (no `node_modules`): `bun install --frozen-lockfile` installs the workspace deps, `bun build --compile --target=bun-linux-x64` compiles, and the resulting binary reports the expected version. Release `v1.0.0` was then produced successfully.

**Residual:** `--frozen-lockfile` is currently not pinning — no `bun.lock` is committed (the repo carries npm `package-lock.json`; `--frozen-lockfile` installs without erroring when no `bun.lock` exists). For reproducible CI installs, generate and commit `bun.lock` (`bun install`) and keep `--frozen-lockfile`, or switch the step to `actions/setup-node@v4` + `npm ci` to honor the existing npm lockfile. Not actioned.

**Learning:** any CI job that runs `bun build --compile` must install dependencies first; `bun install` present in local workflows does not imply it is present in CI.
