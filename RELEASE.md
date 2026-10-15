# Release Process

## Versioning Convention

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (SemVer).

- **Tags**: `vMAJOR.MINOR.PATCH` (for example `v0.1.0`, `v0.2.0`, `v1.0.0`)
- **Pre-1.0**: Versions `0.x.y` indicate initial development. Breaking changes may occur between minor versions.
- **VERSION file**: Contains the plain version number without the `v` prefix (for example `0.1.0`).

## Branch Workflow

| Branch    | Purpose                                                  |
|-----------|----------------------------------------------------------|
| `main`    | Stable/release branch. Reflects the latest released tag. |
| `develop` | Active development branch. All feature/fix branches merge here first. |

Releases are triggered from `main`. Day-to-day development happens on `develop`.

## Release Preparation Steps

Follow these steps to create a new release:

### 1. Prepare `develop`

Ensure `develop` is up-to-date with all intended changes merged:

```bash
git checkout develop
git pull origin develop
```

Verify the working tree is clean (`git status`). All feature branches that should be part of the release must already be merged into `develop`.

### 2. Update the VERSION file

Update `VERSION` at the repository root with the new version number (plain SemVer, no `v` prefix):

```bash
echo "0.2.0" > VERSION
```

### 3. Update CHANGELOG.md

Add a new entry to `CHANGELOG.md` following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

```markdown
## [0.2.0] - YYYY-MM-DD

### Added

- Feature description here.

[0.2.0]: https://github.com/Macacoders/wayforge/releases/tag/v0.2.0
```

Be sure to update the version at the bottom link reference as well.

### 4. Create and push the release tag

Create a signed or annotated tag:

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
```

Or for a signed tag:

```bash
git tag -s v0.2.0 -m "Release v0.2.0"
```

Push the tag (but do not push `main` yet — push both together in step 6):

```bash
git push origin v0.2.0
```

### 5. Merge develop into main

```bash
git checkout main
git merge develop
```

Resolve any conflicts if they arise (conflicts should be rare if `main` only receives releases).

### 6. Push main and the tag

```bash
git push origin main
git push origin v0.2.0   # if not already pushed
```

Pushing `main` triggers the GitHub Actions release workflow (see [Release Automation](#release-automation)) which auto-creates the GitHub Release. The release version is read from the `VERSION` file, and the tag (`v<version>`) is derived from it by the workflow.

## Dry-Run Validation

Before performing an actual release, validate the steps using the dry-run helper:

```bash
npx tsx scripts/release.ts --set-version 0.2.0 --dry-run
```

The dry-run mode will:
- Verify the working tree is clean and you are on `develop`
- Validate the version format
- Show the planned VERSION file update
- Display the CHANGELOG entry that would be added
- Show the planned tag creation
- Exit without modifying any files or creating any tags

## Consuming-Repo Guidance

Consumers install the `wfg` CLI once per user, then install configuration into each target repository.

### Install the CLI

**Linux / macOS:**

```bash
curl -fsSL https://github.com/Macacoders/wayforge/releases/latest/download/install.sh | sh
```

**Windows** (PowerShell; use `-ExecutionPolicy Bypass` if execution policy blocks remote scripts):

```powershell
powershell -c "irm https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 | iex"
```

### Install config into a repo

Once `wfg` is on your PATH:

```bash
wfg install --repo /path/to/repo --providers openai
```

Pin to a specific release tag for reproducible production installs:

```bash
wfg install --repo /path/to/repo --ref v0.1.0 --providers openai
```

When `--ref` is specified, the installer:
1. Clones the wayforge repository at the specified tag/branch/commit
2. Installs from that release source
3. Records `ref:` in the `.wayforge-managed` manifest

Always pin to a specific tag for production consuming repositories to ensure reproducible installs.

**Note**: When a consuming repo re-installs with a newer `--ref`, the installer detects the version change via the `.wayforge-managed` file (see ADR-0009) and applies the appropriate upgrade logic.

### Install / uninstall contract

The one-shot installer is self-contained and does not require administrator privileges:

- **Dedicated prefix**:
  - Linux / macOS: `~/.wayforge`
  - Windows: `%LOCALAPPDATA%\wayforge`
- **Layout**:
  - `<prefix>/bin/wfg` (or `wfg.exe` on Windows)
  - `<prefix>/share/wayforge/base/**` (source snapshot)
  - `<prefix>/share/wayforge/VERSION`
  - `<prefix>/installed-projects.json` (per-user tracking)
- **PATH registration**:
  - Linux / macOS: prints the export line and best-effort appends a `# >>> wayforge >>>` marker block to `~/.bashrc` / `~/.zshrc`.
  - Windows: silently appends the `bin` directory to the **User** PATH via `[Environment]::SetEnvironmentVariable('Path', ..., 'User')`.
- **Self-uninstall**:
  - `install.sh --uninstall` / `install.ps1 -Uninstall` removes the prefix directory and the exact PATH marker it added.
  - `--dry-run` / `-DryRun` previews actions. Re-running uninstall is a no-op.

### Installing and Refreshing

The installer tracks all managed files in a single `.wayforge-managed` file at the root of the consuming repository:

```yaml
project_id: eb9c6ede-6f71-464a-b500-02e9c9d0e77c
# Generated by wayforge v0.1.0
version: 0.1.0
managed_paths:

- opencode.jsonc
- AGENTS.md
- .opencode/agents/planner.md
- ...
```

**Fresh install** (no existing `.wayforge-managed`):
The installer copies all source files from `base/opencode/`, generates runtime config, and writes the manifest.

**Refresh / re-install without `--force`** (existing `.wayforge-managed`):
The installer preserves `AGENTS.md` and runtime config (`opencode.jsonc` / `kilo.jsonc`) **unchanged** — existing content is never modified. Managed files under `.opencode/agents/**`, `.opencode/commands/**`, and `.opencode/skills/**` are refreshed from source templates to receive updates. The manifest is updated to track all current managed paths.

**Refresh / re-install with `--force`** (existing `.wayforge-managed`):
The installer performs a complete refresh as if it were a fresh installation: `AGENTS.md` is copied from source template, runtime config is regenerated from scratch, and all agent/command/skill files are refreshed. The manifest is rewritten with the current version and complete path list.

**How the manifest-driven refresh works:**
1. The installer reads the existing `.wayforge-managed` file.
2. For each path in `managed_paths`, it maps the path back to its source template (e.g., `.opencode/agents/planner.md` → `base/opencode/agents/planner.md`) and re-syncs the file.
3. It discovers new source files not yet in the manifest (new agents, commands, or skills) and syncs them too.
4. It writes an updated `.wayforge-managed` with the current version and complete path list.

This manifest-driven refresh replaces the earlier per-file sidecar marker approach. Old markers from previous installs are cleaned up during the refresh.

## First Release Procedure

The initial release (`v0.1.0`) requires a few extra steps because `main` is newly created and has no history:

1. Ensure `main` already exists locally (created during Phase 1 of this documentation effort).
2. Follow steps 1-4 above on `develop`.
3. Push the tag first:
   ```bash
   git push origin v0.1.0
   ```
4. Push `main` to the remote for the first time:
   ```bash
   git push -u origin main
   ```
5. Create the GitHub Release manually if the automation (Phase 3) is not yet in place:
    - Go to https://github.com/Macacoders/wayforge/releases/new
   - Select the `v0.1.0` tag
   - Title: `v0.1.0`
   - Description: Paste the `CHANGELOG.md` entry for `0.1.0`
   - Publish release

After the initial release, subsequent releases follow the standard steps above.

## Release Automation

The following automation tools are now available:

- **GitHub Actions workflow** (`.github/workflows/release.yml`): Auto-creates a GitHub Release when code is pushed or merged to `main`. The release version is read from the `VERSION` file (the tag `v<version>` is derived from it), and the latest CHANGELOG entry is used as the release body. The workflow runs on the project's self-hosted Linux x64 runner (`runs-on: [self-hosted, linux, x64]`); the trigger is `push: branches: [main]` — pushing the tag alone does not trigger it.
- **Helper script** (`scripts/release.ts`): Automates preparation steps — update VERSION, update CHANGELOG, create annotated tag, and validate the working tree. Use `--dry-run` to preview operations.

### Using the helper script

```bash
# Preview a release to version 0.2.0
npx tsx scripts/release.ts --set-version 0.2.0 --dry-run

# Prepare a release (updates VERSION, CHANGELOG, creates tag)
npx tsx scripts/release.ts --set-version 0.2.0
```

The script validates that the working tree is clean and that you are on the `develop` branch before making changes. After preparation, push the tag and merge to `main`:

```bash
git push origin main v0.2.0
```

The GitHub Actions workflow will detect the push to `main` and create the release automatically.

### Release artifact generation and attachment

The `.github/workflows/release.yml` workflow builds and attaches the following artifacts automatically when a release is created:

- **Platform binaries** cross-compiled on the single self-hosted Linux x64 runner via `bun build --compile --target=<target>` (one matrix job per target; artifact names are unchanged):
  - `wayforge-linux-x64`
  - `wayforge-linux-arm64`
  - `wayforge-darwin-x64`
  - `wayforge-darwin-arm64`
  - `wayforge-win32-x64.exe`
  - `wayforge-win32-arm64.exe`

  The runner must carry the default labels `[self-hosted, linux, x64]` and have these prerequisites installed: `git`, `curl`, `unzip`, `tar`, `ca-certificates`, `python3`, `gawk`, and `gh` (GitHub CLI). Because all six binaries are cross-compiled on a Linux host, the Windows and macOS binaries cannot be smoke-executed on the runner — for those targets verification is compile-only; run the downloaded asset on the matching platform to confirm it executes.
- **Share archives** containing `base/` + `VERSION` at archive root:
  - `wayforge-share-<version>.tar.gz` (POSIX installer)
  - `wayforge-share-<version>.zip` (Windows installer)
- **One-shot installer scripts** uploaded as release assets so the `releases/latest/download/` URLs resolve:
  - `install.sh`
  - `install.ps1`

The release workflow runs only at release time; source changes to `install/install.sh` or `install/install.ps1` are validated locally via `bash -n` and smoke tests against `--url-base` fixtures.
