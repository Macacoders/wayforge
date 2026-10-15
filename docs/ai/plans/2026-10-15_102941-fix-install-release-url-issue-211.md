---
status: completed
created: 2026-10-15
task: 1/1
required_gates:
  architect_review: false
  memory_update: false
---

# Fix release asset URLs in install.sh / install.ps1

**Issue:** [#211](https://github.com/Macacoders/wayforge/issues/211)

**Goal:** Make the published one-shot installers download release assets from the correct `releases/download/<tag>/…` path so installs complete instead of 404ing.

**Architecture:** Both installers construct a release base URL the same way and share the identical bug — the path segments are in the wrong order (`releases/<tag>/download` instead of `releases/download/<tag>`). The fix is a one-line segment reorder in each script, locked in by network-free URL-shape assertions in the existing dry-run test harnesses.

**Tech Stack:** POSIX `sh` (`install/install.sh`), PowerShell 5.1 (`install/install.ps1`), bats (`tests/bash/install_sh.bats`), Pester (`tests/powershell/install.Tests.ps1`).

**Scope classification:** `single-task`

## Tasks

### Task 1: Correct the release URL order and lock it with regression tests

**Objective:** Both installers resolve `https://github.com/<repo>/releases/download/<ref>/<asset>`, and regression tests fail on the old segment order.

**Files:**
- Modify: `install/install.sh:337`
- Modify: `install/install.ps1:140`
- Validate: `tests/bash/install_sh.bats`
- Validate: `tests/powershell/install.Tests.ps1`

**Step 1: Establish expected behaviour**

With `REPO=Macacoders/wayforge` and tag `v1.0.0`, the base URL must be `https://github.com/Macacoders/wayforge/releases/download/v1.0.0`, so `…/wayforge-linux-x64` returns 200. Today both scripts emit `…/releases/v1.0.0/download`, which 404s.

**Step 2: Add or update validation**

In `tests/bash/install_sh.bats`, add (uses the existing `run_installer` helper: `--dry-run --version 9.9.9 --prefix …`):

```bash
@test "install.sh builds releases/download/<tag> URLs" {
	stub_node "v18.20.0"
	run_installer
	[ "$status" -eq 0 ]
	[[ "$output" == *"https://github.com/Macacoders/wayforge/releases/download/v9.9.9/wayforge-linux-x64"* ]]
	[[ "$output" != *"releases/v9.9.9/download"* ]]
}
```

In `tests/powershell/install.Tests.ps1`, add a Pester case that runs `install.ps1 -DryRun -Version 9.9.9 -SkipNodeCheck` (via `pwsh -NoProfile`) and asserts the dry-run output contains `releases/download/v9.9.9/wayforge-` and does not contain `releases/v9.9.9/download`.

**Step 3: Write minimal implementation**

- `install/install.sh:337`:

  ```sh
  printf 'https://github.com/%s/releases/download/%s\n' "$REPO" "$TAG"
  ```

- `install/install.ps1:140`:

  ```powershell
  return "https://github.com/${Repo}/releases/download/${ref}"
  ```

**Step 4: Run test to verify pass**

Run (agent, if `bats` is installed):

```sh
make check-bats
```

Run (agent, syntax + dry-run smoke, no network):

```sh
bash -n install/install.sh
sh install/install.sh --dry-run --skip-node-check --version 9.9.9 --prefix /tmp/wf-check \
  | grep -q 'https://github.com/Macacoders/wayforge/releases/download/v9.9.9/wayforge-linux-x64'
```

Run (human, requires PowerShell + Pester):

```powershell
make check-pester
```

Expected: new bats/Pester cases pass; the dry-run output shows `releases/download/v9.9.9/…`.

**Step 5: Commit**

```sh
git add install/install.sh install/install.ps1 tests/bash/install_sh.bats tests/powershell/install.Tests.ps1
git commit -m "fix(install): correct releases/download/<tag> URL order (Issue #211)"
```

## Post-merge (operational, not a task)

The broken script is the `install.sh` **asset on the v1.0.0 release**, so the public README command stays broken until a patch release publishes a fixed asset:

1. Merge `develop → main` via PR (branch protection forbids direct pushes), which triggers `release.yml`.
2. Ensure `VERSION` is bumped (e.g. `1.0.1`) beforehand so the workflow creates `v1.0.1`.
3. Verify: `curl -fsSL https://github.com/Macacoders/wayforge/releases/latest/download/install.sh | sh`.

## Acceptance criteria

- Both scripts resolve `releases/download/<ref>`.
- `tests/bash/install_sh.bats` and `tests/powershell/install.Tests.ps1` include a case that fails on the old order.
- A released `install.sh` asset contains `releases/download/%s`, and the public `curl | sh` command completes.
