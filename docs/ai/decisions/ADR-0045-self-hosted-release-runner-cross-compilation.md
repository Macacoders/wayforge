# ADR-0045: Self-Hosted Runner for Release Builds via Bun Cross-Compilation

Date: 2026-10-15
Status: Accepted

## Context

`.github/workflows/release.yml` previously built release binaries on a per-OS GitHub-hosted matrix (`ubuntu-latest`, `ubuntu-24.04-arm`, `macos-13`, `macos-latest`, `windows-latest`) and compiled natively on each runner. The project maintains a single self-hosted Linux x64 runner, and Bun can cross-compile every supported target from one Linux x64 host via `bun build --compile --target=…`.

Moving release builds onto a persistent self-hosted runner changes deployment topology and the trust boundary: the runner holds state between jobs, and the `release` job carries `permissions: contents: write` plus a `GITHUB_TOKEN`. This ADR records the decision and the constraint that keeps that boundary acceptable.

## Decision

1. Both the `build-binaries` and `release` jobs run on the self-hosted runner labeled `[self-hosted, linux, x64]` (`runs-on: [self-hosted, linux, x64]`).

2. All six platform binaries are cross-compiled from that single Linux x64 host. Each matrix entry carries a `target:` value passed to `bun build --compile --target=<target>`:
   - `bun-linux-x64`, `bun-linux-arm64`
   - `bun-darwin-x64`, `bun-darwin-arm64`
   - `bun-windows-x64`, `bun-windows-arm64`

   Artifact names and on-disk filenames are unchanged (`wayforge-<os>-<arch>[.exe]`), preserving the `install/install.sh` (`wayforge-${OS}-${ARCH}`) and `install/install.ps1` (`wayforge-win32-${Arch}.exe`) download contracts and the `release` job's artifact glob.

3. The release workflow triggers on `push: branches: [main]` **only** — never `pull_request` or `pull_request_target`. This is the constraint that makes a persistent runner acceptable: only code already merged to `main` executes on it, so contributors cannot run arbitrary code against the runner's persisted state or the release token.

4. Windows and macOS binaries are **compile-only** verified on the runner (they cannot be executed on Linux). Execution on the target platform remains a human validation step.

5. The runner must carry the default labels `[self-hosted, linux, x64]` and host prerequisites `git`, `curl`, `unzip`, `tar`, `ca-certificates`, `python3`, `gawk`, and `gh`.

## Alternatives considered

- **(a) Self-hosted runner + cross-compilation (chosen):** one Linux host emits all six binaries; no per-OS toolchain provisioning; reduces hosted-runner minutes.
- **(b) Keep the GitHub-hosted per-OS matrix:** GitHub-managed ephemeral runners with a smaller trust footprint, at the cost of hosted minutes and per-OS provisioning.
- **(c) Ship a single bundled `index.js` run by the provisioned Node:** removes cross-compilation and collapses the matrix, but is a larger installer/packaging change — tracked separately, not part of this decision.

## Consequences

- A single runner serializes the six builds, so release wall-clock is the sum of six compiles rather than parallel. Accepted.
- The trust boundary moves to the host. The runner persists between jobs and its `release` job holds `contents: write`/`GITHUB_TOKEN`. **Never relax the trigger to `pull_request`/`pull_request_target` without re-reviewing this boundary.**
- Cross-compilation correctness depends on `--target`: an invalid or missing target silently produces a host-architecture binary that is mislabeled. Mitigation: per-target smoke builds verified with `file` (validated for darwin-arm64, windows-x64, and linux-arm64).
- x64 SIMD baseline: if end users report `Illegal instruction` on x64, switch the x64 targets to their `-baseline` variants. Known lever, not applied.
- Amends ADR-0044's note on `--define process.env.WAYFORGE_VERSION`: the injected value is now emitted as a JSON5 string (`:'<version>'`) because bun >=1.4 rejects the bare value as invalid JSON5 (the pre-existing unquoted form failed the build).

## Related

- ADR-0044 (Wayforge Rename) — references the `--define process.env.WAYFORGE_VERSION` injection in the Makefile and release workflow; lightly amended here re: JSON5 string quoting.
- ADR-0035 (One-Shot CLI Installer) — the release-artifact distribution surface this pipeline feeds.
- Plan: `docs/ai/plans/2026-10-15_083234-self-hosted-release-runner.md`

## Review provenance

The plan declared `required_gates.architect_review: true`. The `architect` subagent was unavailable (model rate limit) at review time, so the boundary review (deployment topology + self-hosted-runner trust) and this ADR were produced by the `delivery` agent as a documented fallback. A formal `architect` sign-off should be re-confirmed when the subagent is available.
