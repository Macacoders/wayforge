---
status: planned
created: 2026-10-21
issue: 238
parent_issue: 48
blocked_by:
  - 229
task: 0/3
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #238 (48b): Managed-project status, per-project updates, and manifest-scoped reinstall

**Goal:** Let wayforge show which tracked projects are behind the installed CLI, offer per-project updates, and update each project with a manifest-scoped clean reinstall that preserves user-owned files.

**Architecture:** Add a single-project update primitive that refreshes from a pre-resolved source and then prunes old manifest paths that the new source no longer produces. Build `wfg status` and `wfg update --all` on a read-only registry reader, and expose the primitive through opt-in Git hooks. This issue is **blocked by #229**: the manifest/registry contract and prune policy must be settled first.

**Tech Stack:** TypeScript CLI (`cli/src/**`), Commander, Vitest, POSIX `sh` Git hooks on Linux/macOS and Git for Windows.

**Scope classification:** `multi-task`

**Task count:** 3

## Blocking note

Do not start implementation until #229 has settled:

- the managed record format/identity and prune policy;
- the relationship between `.wayforge-managed` and `installed-projects.json`;
- transactional tracking and update convergence.

This plan records the target design. If #229 changes the contract, re-plan the affected files before coding.

## Verified facts

- `installed-projects.json` records `projectId`, `name`, `path`, `lastUpdated`, `wayforgeVersion`, and `installRef` (`cli/src/lib/tracking.ts:75-82`). It has no reader returning all projects and no runtime/provider data.
- `.wayforge-managed` records `project_id`, `version`, optional `ref`, and `managed_paths` (`cli/src/lib/manifest.ts:50-79`). `readManagedProjectId` exists; there is no reader for `version` or `ref`.
- The existing refresh path refreshes managed paths, keeps `AGENTS.md` and runtime config unless `--force`, then restores the original force flag (`cli/src/commands/install.ts:124-165`).
- Managed paths do not include `opencode.jsonc` / `kilo.jsonc` (`cli/src/lib/config-gen.ts:220-257`); runtime must be detected from the config files.
- Generated config contains `enabled_providers` (`cli/src/lib/config-gen.ts:199-210`), which can reconstruct the provider set.
- Unmanaged conflicts prompt when stdin is a TTY (`cli/src/lib/reconcile.ts:64-87`); automatic updates must use the non-interactive branch.
- `doInstall` has `process.exit(1)` paths for missing repo/Node/source (`cli/src/commands/install.ts:57-98`); update pre-validates and uses a pre-resolved source.
- `uninstall` removes managed files, `.wayforge-managed`, the tracking entry, and `AGENTS.md` (`cli/src/commands/uninstall.ts`). A clean update must not call it.
- `git rev-parse --git-path hooks` respects `core.hooksPath` (verified in a temporary repository).
- `make check` runs Vitest, typecheck, ESLint, Prettier, and jscpd.

## Tasks

### Task 1: Add `wfg update --repo` with manifest-scoped clean reinstall

**Objective:** A managed repository can be refreshed explicitly, with old source-absent managed paths pruned, without prompting or regenerating `AGENTS.md`/runtime config.

**Files:**
- Create: `cli/src/lib/update.ts`
- Create: `cli/src/lib/cleanup.ts`
- Create: `cli/src/commands/update.ts`
- Modify: `cli/src/commands/uninstall.ts` (reuse removal helper)
- Modify: `cli/src/lib/context.ts` (`nonInteractive`)
- Modify: `cli/src/types.ts` (`nonInteractive`, internal `sourceDir`)
- Modify: `cli/src/commands/install.ts` (pre-resolved source, missing-`AGENTS.md` fix, thrown errors)
- Modify: `cli/src/lib/reconcile.ts` (honor `nonInteractive`)
- Modify: `cli/src/lib/manifest.ts` (`readManagedVersion`, `readManagedRef`, throw instead of exit)
- Modify: `cli/src/lib/providers.ts` (export valid-provider list)
- Modify: `cli/src/index.ts`
- Validate: `cli/tests/unit/update.test.ts`, `cli/tests/unit/cleanup.test.ts`, `cli/tests/unit/manifest.test.ts`, `cli/tests/unit/reconcile.test.ts`

**Step 1: Establish expected behaviour**

- Fail clearly when the repo or `.wayforge-managed` is missing.
- Detect runtime from `kilo.jsonc`/`opencode.jsonc` unless `--runtime` is supplied; fail on ambiguity.
- Detect providers from `enabled_providers` unless `--providers` is supplied; fail with instructions.
- Use the manifest `ref:` by default; `--ref` overrides it.
- With `--if-stale`: skip silently when the recorded version equals the installed `VERSION`; skip newer/pinned with a warning; update older/absent.
- Without `--if-stale`: refuse to downgrade unless an explicit `--ref` is supplied.
- Resolve and validate the source, runtime, providers, and ref before writing.
- Capture `oldPaths`; run the non-force refresh with `nonInteractive: true` and the pre-resolved source.
- After success, prune old paths that no longer map to a file in the new source.
- Always exclude `AGENTS.md` and `opencode.jsonc`/`kilo.jsonc`.
- Never prune a still-shipped path that was skipped due to an unmanaged conflict.
- Keep `.wayforge-managed` so projectId/ref survive; do not remove the tracking entry.
- Clean empty directories, never unmanaged siblings.
- `--dry-run` writes nothing.

**Step 2: Add validation**

- `cleanup.test.ts`: `removeManagedPaths` removes listed files, ignores missing paths, cleans empty parents, keeps unmanaged siblings.
- `update.test.ts`: old source-absent path pruned; shared path kept; unmanaged file kept; `AGENTS.md`/config kept; empty dirs cleaned; dry-run no writes; failed refresh no prune; projectId preserved; still-shipped conflict not pruned; registry-only path never guessed.
- `manifest.test.ts`: version/ref readers round-trip.
- `reconcile.test.ts`: `ctx.nonInteractive` preserves conflicts without prompting.

**Step 3: Write minimal implementation**

- `cleanup.ts`: `removeManagedPaths(repo, relativePaths, ctx)`, `pruneStaleManagedPaths(repo, oldPaths, sourceDir, ctx)`.
- `manifest.ts`: `readManagedVersion`, `readManagedRef`, expose a `resolveManagedSourcePath` helper used by sync and prune.
- `context.ts`/`types.ts`/`install.ts`/`reconcile.ts`: non-interactive support, pre-resolved source, missing-`AGENTS.md` fix, throw instead of exit on missing source.
- `update.ts`: runtime/provider detection, `decideUpdate`, ref handling.
- `commands/update.ts`: single-project command orchestration.
- `index.ts`: register `update` with `--repo`, `--dry-run`, `--if-stale`, `--ref`, `--providers`, `--runtime`.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/update.test.ts cli/tests/unit/cleanup.test.ts cli/tests/unit/manifest.test.ts cli/tests/unit/reconcile.test.ts
cd cli; npx tsc --noEmit
npx tsx cli/src/index.ts update --help
```

Agent smoke:

```powershell
$tmp = Join-Path $env:TEMP ("wfg-update-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
npx tsx cli/src/index.ts install --repo $tmp --providers free-tier --skip-node-check
npx tsx cli/src/index.ts update --repo $tmp --if-stale
# add a fake stale manifest entry + file, lower the version, run again
# expect refresh + prune, AGENTS.md/config preserved
Remove-Item -Recurse -Force $tmp
```

**Step 5: Commit**

```sh
git add cli/src/lib/update.ts cli/src/lib/cleanup.ts cli/src/commands/update.ts cli/src/commands/uninstall.ts cli/src/lib/context.ts cli/src/types.ts cli/src/commands/install.ts cli/src/lib/reconcile.ts cli/src/lib/manifest.ts cli/src/lib/providers.ts cli/src/index.ts cli/tests/unit/update.test.ts cli/tests/unit/cleanup.test.ts cli/tests/unit/manifest.test.ts cli/tests/unit/reconcile.test.ts
git commit -m "feat(cli): add manifest-scoped project update (Issue #238)"
```

### Task 2: Add `wfg status` and `wfg update --all`

**Objective:** Wayforge lists every tracked project, compares its manifest version with the running CLI, and offers per-project updates.

**Files:**
- Modify: `cli/src/lib/tracking.ts` (`readTrackedProjects`)
- Create: `cli/src/lib/status.ts`
- Create: `cli/src/commands/status.ts`
- Modify: `cli/src/commands/update.ts` (`--all`, `--yes`)
- Modify: `cli/src/index.ts`
- Validate: `cli/tests/unit/status.test.ts`, `cli/tests/unit/update-all.test.ts`

**Step 1: Establish expected behaviour**

`wfg status`:

- prints the running CLI version;
- lists tracked projects with name, recorded path, manifest version (registry fallback), and status;
- statuses: `current`, `stale`, `newer`, `missing`, `unmanaged`, `pinned`, `unknown`;
- `--check` shows the latest CLI release;
- never mutates.

`wfg update --all`:

- requires `--all` xor `--repo`;
- only offers stale/unknown projects;
- TTY: prompts per project; `--yes`: updates all stale; non-TTY without `--yes`: prints instructions only;
- `--dry-run`: no writes/prompts;
- rejects `--ref`, `--providers`, `--runtime` with `--all`;
- updates through `updateCommand` per project, continues after failures, exits 1 only if an update failed;
- WSL: convert Windows-native tracked paths with `wslpath -u` for local access.

**Step 2: Add validation**

- `readTrackedProjects` parses/corrupt/missing registry cases.
- Classification covers all statuses; manifest version wins over registry; missing path wins.
- `update --all`: `--yes`, per-project prompt yes/no/empty, failure isolation, non-TTY, dry-run, rejected overrides, WSL path conversion.

**Step 3: Write minimal implementation**

- `tracking.ts`: `TrackedProject`, `readTrackedProjects`.
- `status.ts`: `ProjectStatus`, `ProjectState`, `classifyProject`, `toLocalPath`.
- `commands/status.ts`: table output.
- `commands/update.ts`: `updateAllCommand` with injectable `updateProject`/`promptFn`.
- `index.ts`: register `status`; change `update` to optional `--repo` plus `--all`/`--yes`.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/status.test.ts cli/tests/unit/update-all.test.ts
cd cli; npx tsc --noEmit
npx tsx cli/src/index.ts status --help
npx tsx cli/src/index.ts update --help
```

Agent smoke: install two temp projects, lower registry versions, run `status`, `update --all --dry-run`, `update --all --yes`, `status` again.

**Step 5: Commit**

```sh
git add cli/src/lib/tracking.ts cli/src/lib/status.ts cli/src/commands/status.ts cli/src/commands/update.ts cli/src/index.ts cli/tests/unit/status.test.ts cli/tests/unit/update-all.test.ts
git commit -m "feat(cli): add project status and per-project updates (Issue #238)"
```

### Task 3: Add opt-in Git hooks and documentation

**Objective:** A managed repository can opt into `post-merge`/`post-checkout` updates, and the docs/ADR record the behavior and #229 boundary.

**Files:**
- Create: `cli/src/commands/hooks.ts`
- Modify: `cli/src/lib/git.ts` (`resolveHooksDir`)
- Modify: `cli/src/index.ts`
- Create: `docs/ai/decisions/ADR-0046-opt-in-managed-project-auto-update.md`
- Modify: `README.md`, `docs/ai/architecture.md`, `RELEASE.md`, `docs/ai/logs/2026-10.md`
- Validate: `cli/tests/unit/hooks.test.ts`

**Step 1: Establish expected behaviour**

- `wfg hooks install --repo <path>` requires a managed Git work tree; resolves hooks via `git rev-parse --git-path hooks`; installs marker-delimited blocks in `post-merge` and `post-checkout`.
- Refuses to modify an existing unmanaged hook; prints the manual block.
- Idempotent; `--dry-run` no writes; executable bit on non-Windows.
- Hook block: resolve root, skip if no `.wayforge-managed`, warn if `wfg` is absent, run `wfg update --repo "$root" --if-stale`, print a warning on failure, always exit 0.
- `wfg hooks uninstall` removes only the wayforge block and preserves user content.
- Hook-driven updates do not run release checks.

**Step 2: Add validation**

- temp `git init` repo: install both hooks, idempotency, unmanaged refusal, uninstall, user-content preservation, dry-run, LF-only content, `core.hooksPath` honored.

**Step 3: Write minimal implementation**

- `git.ts`: `resolveHooksDir` with `execFileSync` and work-tree validation.
- `commands/hooks.ts`: constants, `buildHookBlock`, install/uninstall, dry-run context.
- `index.ts`: `hooks install`/`hooks uninstall`.
- Docs: README enabling/disabling/troubleshooting; architecture; ADR-0046; RELEASE consumer guidance; log entry.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/hooks.test.ts
cd cli; npx tsc --noEmit
npx tsx cli/src/index.ts hooks install --help
npx tsx cli/src/index.ts hooks uninstall --help
make check
```

Human validation: real hook execution on Windows Git for Windows and one Unix-like host; failure warning does not block Git; uninstall preserves user hook text.

**Step 5: Commit**

```sh
git add cli/src/commands/hooks.ts cli/src/lib/git.ts cli/src/index.ts docs/ai/decisions/ADR-0046-opt-in-managed-project-auto-update.md README.md docs/ai/architecture.md RELEASE.md docs/ai/logs/2026-10.md cli/tests/unit/hooks.test.ts
git commit -m "feat(cli): add opt-in git hooks for managed updates (Issue #238)"
```

## Validation ownership

| Validation | Owner |
|---|---|
| Update/cleanup/manifest/reconcile tests | agent |
| Status/update-all tests | agent |
| Hook tests in temp Git repo | agent |
| `make check` | agent |
| Temp install -> update -> status -> hooks smoke | agent |
| Real hook execution on Windows Git for Windows | human |
| Real hook execution on Linux/macOS | human |
| Failure warning does not block Git | human |
| Uninstall preserves user hook text | human |

## Acceptance criteria

- [ ] `wfg update --repo <path>` performs a manifest-scoped clean reinstall, prunes old source-absent paths, keeps `.wayforge-managed`/projectId, and preserves `AGENTS.md`, runtime config, and unmanaged files.
- [ ] Pruning uses the new source's shipped path set, not merely absence from the new manifest.
- [ ] A failed refresh performs no pruning and leaves the previous files/manifest intact.
- [ ] `--if-stale` skips current silently, skips newer/pinned with a warning, and never downgrades.
- [ ] `wfg status` lists every tracked project with its version and status.
- [ ] `wfg update --all` offers stale projects individually, supports `--yes`/`--dry-run`, skips missing/unmanaged/pinned/newer, continues after failures, and exits 1 only on failure.
- [ ] `wfg hooks install/uninstall` are idempotent, marker-delimited, preserve unmanaged hooks, and never block Git.
- [ ] WSL paths are converted for local access.
- [ ] Docs, ADR-0046, and the log entry explain enable/disable/troubleshoot and the #229 boundary.
- [ ] `make check` is green.

## Out of scope

- CLI self-update and release checksums (#237).
- Runtime notifier plugins (#239).
- Artifact identity for locally modified files and files never recorded in the manifest (#229).
- Worktrees (#232) and user-scope installation (#233).
- Regenerating runtime config/provider blocks during update.

## Risks

| Risk | Mitigation |
|---|---|
| #229 changes the manifest/registry contract | Do not implement until #229 is settled; re-plan affected files. |
| Pruning deletes a still-shipped path skipped by a conflict | Prune against the new source's shipped set, not the new manifest. |
| Remove-before-install bypasses rollback through `process.exit` | Refresh first, prune after; replace missing-source exits with throws. |
| Local edits to managed files are deleted when pruned | Document managed-file ownership; recommend `--dry-run` first. |
| `AGENTS.md` missing on disk | Fix the refresh guard to copy it when absent. |
| WSL Windows-native paths | Convert with `wslpath -u`. |
