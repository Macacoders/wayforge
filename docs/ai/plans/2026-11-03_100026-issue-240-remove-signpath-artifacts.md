---
status: completed
created: 2026-11-03
task: 2/2
required_gates:
  architect_review: true
  memory_update: true
---

# Remove SignPath artifacts and document the unsigned Windows release posture

**Goal:** Delete the SignPath application artifacts, remove the false claim that Windows artifacts are Authenticode-signed, and document that no free public-trust signing option is viable for the current direct-download distribution.

**Architecture:** Remove the SignPath-specific policy and artifact configuration, replace the README signing claim with an honest status note, and add `docs/security/windows-code-signing.md` recording the SignPath denial, the alternatives evaluated, and the SHA-256/SmartScreen guidance. Preserve historical plans and logs; mark the superseded signing plan explicitly instead of rewriting history.

**Tech Stack:** Markdown, git, existing documentation conventions. No application code changes.

**Scope classification:** `multi-task`

**Task budget rationale:** Two separable deliverables: (1) destructive removal of the live SignPath application artifacts and stale public claims, and (2) durable documentation plus historical supersession. Each has its own validation loop and review surface.

## Repository facts

- `.signpath/artifact-configuration.xml` exists and is tracked; it is the only file under `.signpath/`.
- `CODE_SIGNING_POLICY.md` exists and is tracked; it is SignPath-specific.
- `README.md` contains the only live reference: a `### Code signing policy` section that claims Windows artifacts are Authenticode-signed via SignPath Foundation and links to the policy.
- `git grep` finds no other live reference to SignPath, Authenticode, or code signing outside the old plan; historical plans and logs may retain references by design.
- The current signing plan is `docs/ai/plans/2026-10-28_113250-issue-240-installer-signing-edr-hardening.md` (`status: in-progress`, `task: 0/4`). It is blocked on SignPath approval, and Tasks 2-4 were never started: `.github/workflows/release.yml` still uses self-hosted runners, there is no `sign-windows` job, `install/install.ps1` has no Authenticode check, and ADR-0048 does not exist.
- `docs/security/` does not exist yet. Issue #271 tracks `docs/security/installer-trust.md`; the new `docs/security/windows-code-signing.md` is a separate page and must not duplicate #271's installer-hardening content.
- `CHANGELOG.md` has an `[Unreleased]` section. `docs/ai/logs/2026-11.md` does not exist yet.

## Decision

SignPath Foundation declined the project. Remove the SignPath-specific application artifacts and do not ship a dormant SignPath job.

The documentation must be precise about the remaining options:

- **No viable free public-trust Authenticode option exists for the current direct-download distribution** (`install.ps1` + `wayforge-win32-*.exe` from GitHub Releases).
- **Microsoft Store MSIX is free** but requires Store distribution, MSIX packaging, and Store certification; it is not a drop-in for the current installer and is not adopted by this plan.
- **OSSign / Necessary Code Signing** are free but require an established user base or public track record; they are not viable for this project now.
- **Self-signed** certificates are free but are not public trust; they are not acceptable for public releases.
- **Paid alternatives** (Certum Open Source, Azure Artifact Signing) exist but are not adopted.

Do not claim that no free option exists in absolute terms. State that no free option is viable for the current distribution model, and record MSIX as the free alternative that was evaluated and rejected for now.

## Out of scope

- Reapplying to SignPath Foundation, or creating a new SignPath project/policy.
- Implementing Microsoft Store MSIX packaging or publishing to the Store.
- Buying or integrating Certum, Azure Artifact Signing, or any other paid provider.
- The GitHub-hosted runner migration (#270).
- Installer hardening, `-DryRun`, `-NoPath`, or cosign manifest signing (#271).
- SHA-256 verification changes (#243, already delivered).
- Rewriting historical plans, logs, or ADRs to remove every SignPath mention.

## Tasks

### Task 1: Remove the SignPath application artifacts and stale claims

**Objective:** Delete the two SignPath application artifacts and remove the README claim/link so no live document advertises signing.

**Files:**
- Delete: `.signpath/artifact-configuration.xml`
- Delete: `CODE_SIGNING_POLICY.md`
- Modify: `README.md:29-31` (remove the `### Code signing policy` section)
- Validate: repository-wide `git grep` excluding historical plans and logs

**Step 1: Establish expected behaviour**

- `.signpath/artifact-configuration.xml` no longer exists; the empty `.signpath/` directory is gone from git.
- `CODE_SIGNING_POLICY.md` no longer exists.
- `README.md` contains no `SignPath`, `Authenticode-signed`, or `CODE_SIGNING_POLICY.md` reference.
- Historical plans and logs may still mention SignPath; do not rewrite them.

**Step 2: Add or update validation**

- Agent: `Test-Path .signpath/artifact-configuration.xml` and `Test-Path CODE_SIGNING_POLICY.md` both return `False`.
- Agent: `git grep -n -i "signpath\|CODE_SIGNING_POLICY\|Authenticode-signed" -- . ":!docs/ai/plans/**" ":!docs/ai/logs/**"` returns no matches. `git grep` exits 1 when there are no matches; that is the expected result.
- Agent: `git diff --check` is clean.

**Step 3: Write minimal implementation**

- Remove both tracked files with `git rm`.
- Remove the README `### Code signing policy` section and its blank-line spacing so the surrounding sections remain well formed.

**Step 4: Run test to verify pass**

Run:
`Test-Path .signpath/artifact-configuration.xml; Test-Path CODE_SIGNING_POLICY.md`
Expected: `False` and `False`.

Run:
`git grep -n -i "signpath\|CODE_SIGNING_POLICY\|Authenticode-signed" -- . ":!docs/ai/plans/**" ":!docs/ai/logs/**"`
Expected: no output; exit code 1.

Run:
`git diff --check`
Expected: no output.

**Step 5: Commit**

`git add -A .signpath CODE_SIGNING_POLICY.md README.md`
`git commit -m "docs: remove SignPath application artifacts (Issue #240)"`

### Task 2: Document the unsigned Windows posture and supersede the old plan

**Objective:** Add a durable status page for Windows signing, replace the removed README claim with an honest note, update release documentation, and mark the old SignPath plan superseded.

**Files:**
- Create: `docs/security/windows-code-signing.md`
- Modify: `README.md` (add a short `### Windows code signing` note linking to the new page)
- Modify: `RELEASE.md` (release asset note)
- Modify: `CHANGELOG.md` (`[Unreleased]` Removed/Changed entry)
- Modify: `docs/ai/plans/2026-10-28_113250-issue-240-installer-signing-edr-hardening.md` (`status: superseded` plus pointer note)
- Create: `docs/ai/logs/2026-11.md` (short monthly log entry)
- Validate: documentation greps and `make check`

**Step 1: Establish expected behaviour**

- `docs/security/windows-code-signing.md` states:
  - Windows release artifacts are currently unsigned.
  - SignPath Foundation declined the application because the project did not yet show sufficient public visibility/reputation; record the denial date and reason from the denial email.
  - No free public-trust Authenticode option is viable for the current direct-download distribution.
  - Microsoft Store MSIX is free but Store-only and not a drop-in for `install.ps1`/`wfg.exe`; it was evaluated and is out of scope.
  - OSSign/Necessary Code Signing require an established user base; self-signed certificates are not public trust.
  - Paid alternatives (Certum Open Source, Azure Artifact Signing) exist but are not adopted.
  - Integrity is currently verified with `wayforge-checksums.txt` (SHA-256); SmartScreen may show an unknown-publisher warning, and users should only run assets from the official release.
  - Revisit when SignPath visibility improves or a funded provider is approved.
- `README.md` contains a concise `### Windows code signing` note that says the artifacts are unsigned and links to the new page. It must not claim signing.
- `RELEASE.md` release-asset section notes that the Windows binaries and `install.ps1` are unsigned and points at the new page.
- The old plan frontmatter becomes `status: superseded`, with a blockquote pointer to the new plan. Its body remains a historical record.
- `CHANGELOG.md` records the removal and the unsigned status under `[Unreleased]`.
- `docs/ai/logs/2026-11.md` records the denial, the decision, and the new page.

**Step 2: Add or update validation**

- Agent: `git grep -n -i "SignPath Foundation" -- README.md RELEASE.md docs/security .github` finds no claim that artifacts are signed. The new page may mention SignPath only as the declined provider.
- Agent: `git grep -n -i "Authenticode-signed" -- README.md RELEASE.md docs/security` returns no matches.
- Agent: verify the new page contains the sections `Status`, `Alternatives evaluated`, `Verification`, and `Revisit trigger`.
- Agent: `make check` is green (no code changes; this confirms the docs-only change did not break the gate).
- Agent: `git diff --check` is clean.
- Human: compare the denial date/reason and alternative wording against the SignPath email; confirm the MSIX caveat is accurate and that the page does not overstate the absence of free options.

**Step 3: Write minimal implementation**

- Create `docs/security/windows-code-signing.md` with the status, denial reason, alternatives table, verification guidance, and revisit trigger.
- Replace the removed README section with a short `### Windows code signing` note.
- Add the unsigned-assets note to `RELEASE.md`.
- Add the `[Unreleased]` entry to `CHANGELOG.md`.
- Change the old plan frontmatter to `status: superseded` and add a blockquote after the frontmatter:
  `> Superseded on 2026-11-03 by \`docs/ai/plans/2026-11-03_100026-issue-240-remove-signpath-artifacts.md\`. SignPath Foundation declined; the project now ships unsigned Windows artifacts.`
- Create `docs/ai/logs/2026-11.md` with a short entry.

**Step 4: Run test to verify pass**

Run:
`git grep -n -i "Authenticode-signed" -- README.md RELEASE.md docs/security`
Expected: no output; exit code 1.

Run:
`git grep -n -i "SignPath Foundation" -- README.md RELEASE.md docs/security`
Expected: matches only in the new page's declined-provider context, never a claim that artifacts are signed.

Run:
`make check`
Expected: green.

Run:
`git diff --check`
Expected: no output.

**Step 5: Commit**

`git add docs/security/windows-code-signing.md README.md RELEASE.md CHANGELOG.md docs/ai/plans/2026-10-28_113250-issue-240-installer-signing-edr-hardening.md docs/ai/logs/2026-11.md`
`git commit -m "docs: record unsigned Windows releases and no free signing option (Issue #240)"`

## Acceptance criteria mapping

| Criterion | Owning task | Validation |
|---|---|---|
| Delete SignPath artifact configuration | 1 | `Test-Path` false; `git ls-files` clean |
| Delete SignPath code signing policy | 1 | `Test-Path` false; README link gone |
| Remove live claim that Windows artifacts are signed | 1 | `git grep` for `Authenticode-signed` outside historical files |
| Document that no free signing option is viable for the current distribution | 2 | new security page + human review |
| Record the SignPath denial and the alternatives evaluated | 2 | page sections and denial date/reason |
| Preserve historical plan/log references | 2 | old plan marked superseded; body unchanged |
| Keep checksum and SmartScreen guidance accurate | 2 | page `Verification` section; human review |

## Validation ownership

| Validation | Owner |
|---|---|
| File deletion checks, `git grep`, `git diff --check` | agent |
| `make check` | agent |
| Denial date/reason accuracy, MSIX caveat, wording review | human |
| Confirmation that the superseded plan should remain in history | human |
| Architect review of the unsigned release trust posture | human/architect |

## Blocking decisions and gates

1. **Denial record (resolved 2026-11-03).** SignPath Foundation denied the application on 2026-11-03; the security page and monthly log record that date and reason.
2. **"No free alternative" wording (resolved 2026-11-03).** The page scopes the claim to the current direct-download distribution and records Microsoft Store MSIX as the free public-trust alternative that was evaluated and rejected; it will not be used. No absolute "no free option exists" claim is published.
3. **Artifact deletion.** `CODE_SIGNING_POLICY.md` and `.signpath/artifact-configuration.xml` are deleted, not kept dormant. Git history remains the recovery path if SignPath is reconsidered.
4. **Historical records.** The old plan is marked `superseded`; historical plans/logs/ADRs are not rewritten.
5. **Gates.** `architect_review: true` to confirm the unsigned posture is consistent with the release trust model and the new documentation. `memory_update: true` for the security page, README/RELEASE/CHANGELOG, superseded plan, and monthly log.
6. **Dependencies.** None. This plan removes the SignPath dependency and does not require #270, #271, or #243.

## Open questions

- Resolved 2026-11-03: SignPath Foundation denied the application on 2026-11-03.
- Resolved 2026-11-03: Microsoft Store MSIX will not be used; it remains documented as the free public-trust alternative that was evaluated and rejected.
- Resolved 2026-11-03: no copy of `.signpath/artifact-configuration.xml` is retained; git history is the recovery path.

## Closure

Both tasks are complete. SignPath Foundation denied the application on 2026-11-03, the SignPath application artifacts are removed, and the project documents unsigned Windows releases with SHA-256 checksum verification. Microsoft Store MSIX will not be used.
