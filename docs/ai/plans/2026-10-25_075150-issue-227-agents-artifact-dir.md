---
status: completed
created: 2026-10-25
task: 7/7
required_gates:
  architect_review: true
  memory_update: true
---

# Generic `.agents/` artifact tree + flat `base/` (Issue #227) — Implementation plan

**Goal:** Install every wayforge artifact into one canonical `.agents/` tree, with OpenCode and Kilo pointed at it through runtime-specific directory pointers, and flatten the source tree to `base/`.

**Architecture:** `.agents/` is the single runtime-facing tree for agents, commands, skills, and plugins; repository-side templates remain in `base/`, and no per-runtime content trees are introduced in this plan. `base/{agents,commands,skills,plugins}` holds content; `base/{config,permissions}` are generation inputs and are never installed. A single `cli/src/lib/layout.ts` owns the artifact roots, categories, and per-runtime pointer directories; installer, manifest, reconcile, and config generation derive from it. OpenCode gets `.opencode/agents` and `.opencode/commands` pointers; Kilo gets `.kilo/agents` and `.kilo/commands` pointers (Kilo no longer reads `.opencode/`). Skills and plugins reach both runtimes through generated config paths, so they need no pointers. Pointers use relative directory symlinks with a Windows junction fallback; generated stubs are deferred. Pi consumes `.agents/skills/` natively and needs no installer change. Scope now is OpenCode + Kilo; per-runtime materialization of `.agents/` into native trees is explicitly future work, not part of this plan.

**Tech Stack:** TypeScript CLI (Commander, fs-extra), vitest 4.x, Prettier/ESLint via `make check`, `git mv` for history-preserving moves.

**Scope classification:** `multi-task`

**Task budget rationale:** 7 tasks. The maintainer confirmed the canonical `.agents/` tree and the OpenCode/Kilo scope on 2026-10-25. Seven tasks keep each acceptance criterion independently verifiable: the split separates the mechanical source move (Task 2) from the behavior change (Task 3), then isolates the two runtime-sensitive steps (pointers, migration), the test rewrite, and the final docs/matrix. `make check` runs vitest, typecheck/lint/format, and duplication; after Task 6 vitest also runs the integration suite, so no separate integration target is needed.

**Out of scope:** adding a runtime; per-runtime content materialization (copying or generating definitions into `.opencode/`/`.kilo/` trees from `.agents/`); the pointer layer is in scope. Also out of scope: changing agent/command/skill content beyond path references; inlining definitions into config; renaming generated config files; updating frozen `install/legacy/**` scripts; rewriting historical `docs/ai/plans|logs|decisions|reports` records.

## Baseline (verified 2026-10-25)

- `develop` clean except untracked `.agents/` (local Pi skill copy) and this plan. OpenCode 1.18.35 is installed; Kilo is not installed locally; Windows is not available on the dev host.
- Hardcoded `.opencode` literals: `install.ts` ×12 (L79, 182, 213, 242, 272, 320–337, 390, 396, 413), `manifest.ts` ×8 (L554–565), `reconcile.ts` ×2 (L26, 29), `config-gen.ts` ×1 (L218 plugin entry). `config-gen.ts:17`, `manifest.ts:556–565`, and `reconcile.ts:20` hardcode source `base/opencode/...`.
- **Kilo discovery correction:** Kilo 7.8.17 (`@kilocode/cli`) no longer reads `.opencode/` project directories. Project agent/command files are scanned under `.kilo/` (and legacy `.kilocode/`):
  - `packages/opencode/src/kilocode/system-prompt.ts:29` — “Put new commands and agents in `.kilo/`. Do not use `.kilocode/` or `.opencode/`.”
  - `packages/opencode/src/kilocode/config/config.ts:693` — “no longer reads `.opencode` directories.”
  - `packages/opencode/src/config/paths.ts` — project config directories are `.kilocode` and `.kilo`.
  - `packages/opencode/src/config/agent.ts` / `command.ts` — scan `{agent,agents}/**/*.md` and `{command,commands}/**/*.md` under those directories.
  - Therefore the Kilo pointer must be `.kilo/{agents,commands}`, not `.opencode/...`. The current installer’s `.opencode` install for `--runtime kilocode` is a pre-existing bug: the generated `kilo.jsonc` declares agent names/models, so `planner` exists without the wayforge prompt files.
- **OpenCode probe (1.18.35, Linux):** `opencode agent list` finds `planner` when `.opencode/agents` is a real directory or a symlink to `../.agents/agents`. `opencode debug skill` with `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` finds a skill through either `{"skills":{"paths":["./.agents/skills"]}}` or a `.opencode/skills -> ../.agents/skills` symlink; without either it does not. Directory symlinks are followed.
- **Config schema:** `https://opencode.ai/config.json` accepts `skills` as an array or `{paths,urls}` object; the object form and the top-level `plugin` key are marked `deprecated: true` (a `plugins` key exists). Kilo’s `https://app.kilo.ai/config.json` shares the same inherited shape and deprecations. Both forms still work at runtime; Task 1 records which one the generated config emits.
- **Integration gate is already broken on develop:** `cli/tests/integration/run.sh:85` invokes the moved `install/bootstrap-legacy.sh`, and line 103 still compares `.ai-config-managed` after the `.wayforge-managed` rename. `make check` **does not** run integration: `Makefile:26-33` = vitest + typecheck/lint/format + duplication; `check-integration` lives only under `check-tests` (`Makefile:40-48`). Task 6 removes the stale target; `npx vitest run` already includes `cli/tests/**/*.test.ts`.
- **Flattening the source tree breaks frozen legacy installers:** `install/legacy/bootstrap-legacy.sh`, `install/legacy/lib/managed_sync-legacy.sh`, and `install/legacy/bootstrap-legacy.ps1` read `base/opencode/**`. Flattening `base/` breaks them. They are frozen/deprecated (ADR-0033) and stay untouched; the ADR records the break and docs note it.
- `install.ts:167–169` carries `ponytail: debt` (4 duplicated discovery blocks) — harvested by Task 3’s category loop.
- `rewriteAgentPaths` (`install.ts:388`) is dead (no `base/` file references `base/opencode/`); deleted in Task 2.
- Content references to the **installed** path: `base/opencode/commands/init.md` ×2, `base/opencode/skills/shared-task/SKILL.md`, and `base/opencode/plugins/ponytail/ponytail.mjs` (`skillsDir`). The issue’s claimed `base/opencode/skills/ai-memory/SKILL.md` reference does not exist (only `compatibility: opencode`); it is not edited.
- `tests/typescript/gh-issue/*.ts` has 5 imports of `base/opencode/skills/shared-task/scripts/*.ts`; `tsconfig.json:18-19` includes `base/opencode/skills/**/*.ts`.
- Unit tests with `.opencode` assertions: `manifest.test.ts` ×30, `reconcile.test.ts` ×15, `manifest-override.test.ts` ×5, plus `config-gen.test.ts` plugin assertions. Task 2 updates only the source-path fixtures (`reconcile.test.ts`, `config-gen.test.ts`); destination assertions stay `.opencode/` and pass. Task 3 moves destination assertions to `.agents/`.
- Doc references (`base/opencode` only): README ×4, root AGENTS.md ×3, RELEASE.md ×2, `docs/ai/architecture.md` ×4, plus installed-path prose. Historical `docs/ai/**` records stay untouched; `docs/ai/reports/**` and `docs/ai/prompt-audit*.md` are treated as historical.
- `tests/bash/bootstrap_cli.bats` has 8 `base/opencode` references. The bats suite is deprecated and not part of `make check`; it stays untouched deliberately.

## Tasks

### Task 1: Record layout + runtime-pointer decisions in ADR-0046

**Objective:** Resolve the issue’s two open decisions and the Kilo pointer correction in one verified decision record before code changes.

**Files:**
- Create: `docs/ai/decisions/ADR-0046-generic-agents-artifact-directory.md`

**Step 1: Establish expected behaviour**

Decide and record:

- (a) Flat `base/` keeps generation inputs as `base/config/` and `base/permissions/`; the input-vs-installed distinction is made explicit by `CONTENT_CATEGORIES` vs `INPUT_CATEGORIES` and docs, not extra namespacing.
- (b) `.agents/` is the canonical installed tree for all four content categories.
- (c) Runtime indirection is per runtime: OpenCode uses `.opencode/{agents,commands}`; Kilo uses `.kilo/{agents,commands}`. Skills and plugins use generated config paths (no pointers). Generated stubs remain deferred with a `ponytail: debt` note.
- (d) Pointer mechanism: relative directory symlink preferred, Windows junction fallback, chosen by a runtime capability probe (ADR-0031 decisions 3 and 5); no `process.platform === 'win32'` hardcoding.
- (e) Migration policy: managed legacy files move to `.agents/`; unmanaged files are never deleted; if residuals prevent a native pointer from being created, report exact paths and fail with remediation; Kilo legacy `.opencode` residuals do not block `.kilo` pointers.
- (f) Scope: OpenCode and Kilo now; Pi uses `.agents/skills/` natively; per-runtime materialization is future work.
- (g) Frozen legacy installers break because they read `base/opencode/**`; they stay untouched.

**Step 2: Add or update validation** (owner: **agent**, read-only, bounded)

- Confirm the Kilo discovery facts above against the Kilo 7.8.17 source and record the paths/line references.
- Confirm OpenCode 1.18.35 follows a symlinked `.opencode/agents` directory and accepts `skills.paths`; record the probe commands.
- Fetch both config schemas and record the verified `skills`/`plugin`/`plugins` shapes, including deprecations and the chosen emitted form.
- Confirm `kilo agent list` and `kilo debug skill` exist in the Kilo 7.8.17 CLI for later verification.
- Record Windows junction behavior as an open item to verify in Task 4/7 (owner: **human**).

**Step 3: Write minimal implementation**

Write ADR-0046 with the decisions, verified evidence (date-stamped), the accepted break of frozen legacy installers, the symlink → junction → deferred-stub chain, and the migration/residual policy. Explicitly correct the issue’s “both runtimes install into `.opencode/`” statement: that described the installer bug, not Kilo’s runtime behavior.

**Step 4: Run test to verify pass**

Run: `npx prettier --check docs/ai/decisions/ADR-0046-*.md` (owner: **agent**)
Expected: file formatted; every decision matches recorded verification.

**Step 5: Commit**

`git add docs/ai/decisions/ADR-0046-generic-agents-artifact-directory.md`
`git commit -m "docs: record generic .agents artifact directory decisions (Issue #227)"`

### Task 2: Flatten `base/` and update source mapping only

**Objective:** Move source templates from `base/opencode/**` to `base/**` without changing install destinations, so the repository stays green and the mechanical move is reviewable in isolation.

**Files:**
- Rename (`git mv`): `base/opencode/{agents,commands,skills,plugins,config,permissions}` → `base/{...}`; remove empty `base/opencode/`
- Modify: `cli/src/commands/install.ts` (source joins only; destinations remain `.opencode/`; delete dead `rewriteAgentPaths`)
- Modify: `cli/src/lib/manifest.ts` (source prefix chain in `syncManagedPathFromManifest` only)
- Modify: `cli/src/lib/reconcile.ts` (source base only)
- Modify: `cli/src/lib/config-gen.ts` (`readFragment` source base only)
- Modify: `tsconfig.json` (includes → `base/skills/**`)
- Modify: `tests/typescript/gh-issue/*.ts` (5 imports → `base/skills/...`)
- Modify: `cli/tests/unit/reconcile.test.ts`, `cli/tests/unit/config-gen.test.ts` (source-path fixtures only; destination assertions unchanged)
- Validate: unit suites green with updated source fixtures

**Step 1: Establish expected behaviour**

`base/` contains `AGENTS.md` plus `{agents,commands,skills,plugins,config,permissions}` and no `opencode/` directory. Fresh installs still produce `.opencode/agents|commands|skills|plugins`; unit tests and typecheck stay green after the source-path fixtures are updated. Frozen legacy installers now fail because they read `base/opencode/**`; this is accepted and recorded in Task 1’s ADR.

**Step 2: Add or update validation**

No new behavior tests. Existing unit suites are the gate after their source fixtures are updated; add a source-only sweep: `rg -n "base/opencode" cli/src/ tsconfig.json tests/typescript cli/tests/unit` returns zero. (owner: **agent**)

**Step 3: Write minimal implementation**

1. `git mv` the six subdirectories; remove `base/opencode/`.
2. Replace source-only path construction: `base/opencode/<cat>` → `base/<cat>` in `install.ts`, `manifest.ts`, `reconcile.ts`, and `config-gen.readFragment`; `base/opencode/permissions/agents.yml` → `base/permissions/agents.yml`.
3. Delete `rewriteAgentPaths` (dead) and its call sites.
4. Update `tsconfig.json` includes, the five test imports, and the source-path fixtures in `cli/tests/unit/reconcile.test.ts` and `cli/tests/unit/config-gen.test.ts` (`base/opencode/...` → `base/...`).
5. Do **not** update content references to the installed `.opencode/...` path yet; that belongs to Task 3. Do **not** change destinations.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit tests/typescript && cd cli && npx tsc --noEmit && npx eslint src/ && npx prettier --check src/` (owner: **agent**); `rg -n "base/opencode" cli/src/ tsconfig.json tests/typescript cli/tests/unit` → zero hits.
Expected: all unit and type tests pass; no source path references `base/opencode`. Integration remains pre-existing red (fixed in Task 6).

**Step 5: Commit**

`git add -A base cli tests tsconfig.json`
`git commit -m "refactor: flatten base source tree without changing install destinations (Issue #227)"`

### Task 3: Declared layout module + `.agents/` destination + generated config

**Objective:** All source/destination paths derive from `cli/src/lib/layout.ts`; a fresh install produces the `.agents/` tree and a generated config pointing at it.

**Files:**
- Create: `cli/src/lib/layout.ts`
- Modify: `cli/src/commands/install.ts` (remove the unconditional `.opencode` directory creation at L79; fresh-install sync block ~L313–341; refresh discovery blocks ~L167–290 collapse to one loop over `CONTENT_CATEGORIES`, harvesting the `ponytail: debt`; `injectPermissions` dest; refresh config guard so a missing target config is generated without `--force`)
- Modify: `cli/src/lib/manifest.ts` (`syncManagedPathFromManifest` source/dest mapping; keep `warning: unknown managed path prefix`; legacy translation lands in Task 5)
- Modify: `cli/src/lib/reconcile.ts` (`subs` + bases → `CONTENT_CATEGORIES` + `.agents` destinations)
- Modify: `cli/src/lib/config-gen.ts` (`readFragment`; plugin entry from layout; verified skills key; generate the target config if it does not exist even on refresh)
- Modify content refs: `base/commands/init.md` ×2, `base/skills/shared-task/SKILL.md`, `base/plugins/ponytail/ponytail.mjs` (`skillsDir` → `./.agents/skills`)
- Validate: `cli/tests/unit/manifest.test.ts`, `reconcile.test.ts`, `manifest-override.test.ts`, `config-gen.test.ts`

**Step 1: Establish expected behaviour**

Fresh `wfg install` produces `AGENTS.md`, `.agents/{agents,commands,skills,plugins}` (permissions rendered into `.agents/agents/*.md`), and `opencode.jsonc`/`kilo.jsonc` whose plugin entry is `./.agents/plugins/ponytail/ponytail.mjs` and whose skills key points at `.agents/skills`. `config/` and `permissions/` are read as inputs, never installed. Installing a second runtime over an existing install generates its missing config file without requiring `--force` (existing configs still require `--force` to regenerate). Runtime loading is not expected yet; Task 4 supplies the pointers.

**Step 2: Add or update validation**

Update the four unit suites to `.agents/` destinations; add assertions for the plugin entry, skills key, and `.agents` tree; add a config-gen test for missing-target-config generation on runtime switch. (owner: **agent**)

**Step 3: Write minimal implementation**

`layout.ts` exports:

- `ARTIFACT_ROOT = '.agents'`, `LEGACY_ARTIFACT_ROOT = '.opencode'`
- `CONTENT_CATEGORIES = ['agents','commands','skills','plugins']`
- `INPUT_CATEGORIES = ['config','permissions']`
- `RUNTIME_POINTER_DIRS = { opencode: '.opencode', kilocode: '.kilo' }`
- `sourceDirFor(sourceDir, cat)` → `base/<cat>`
- `destRelFor(cat, subpath)` → `.agents/<cat>/<subpath>`
- `sourceForDest(sourceDir, relPath)` → source file for a managed relPath (new prefixes only)
- `PLUGIN_ENTRY`, `SKILLS_CONFIG_PATH`

Rewire call sites to the helpers. Collapse the four refresh discovery blocks into one category loop. Remove the unconditional `ensureDir(repo/.opencode)`; `ensureRuntimePointers` creates the runtime parent (`.opencode` or `.kilo`) in Task 4. Delete remaining content-path literals. Update content references from `.opencode/...` to `.agents/...`. `config-gen` uses the layout plugin entry and the skills shape verified in Task 1; note the deprecated object form if that is what is emitted. The zero-literal gate is scoped to content/destination mapping: `rg -n "base/opencode" cli/src/` → 0; `.opencode`/`.kilo` may appear only in `layout.ts` as declared runtime indirection and legacy constants.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit tests/typescript && cd cli && npx tsc --noEmit && npx eslint src/` (owner: **agent**); source sweep as above.
Expected: all unit/type tests pass; fresh install produces `.agents/`; no `.opencode` content destination outside `layout.ts`. Integration remains pre-existing red until Task 6.

**Step 5: Commit**

`git add base cli tests`
`git commit -m "refactor: derive install layout from declared .agents mapping (Issue #227)"`

### Task 4: Runtime pointer layer for OpenCode and Kilo

**Objective:** OpenCode and Kilo load agents and commands from `.agents/` via runtime-specific directory pointers, with Windows fallback and no clobbering of unmanaged directories.

**Files:**
- Create: `cli/src/lib/pointers.ts` (`ensureRuntimePointers(repo, runtime, ctx)`, capability probe `canSymlink()` per ADR-0031)
- Create: `cli/tests/unit/pointers.test.ts`
- Modify: `cli/src/commands/install.ts` (call pointers in the fresh-install path; Task 5 adds the post-cleanup refresh call)
- Modify: `cli/src/lib/layout.ts` (pointer categories)

**Step 1: Establish expected behaviour**

For `--runtime opencode`: `.opencode/agents` → `../.agents/agents` and `.opencode/commands` → `../.agents/commands`.
For `--runtime kilocode`: `.kilo/agents` → `../.agents/agents` and `.kilo/commands` → `../.agents/commands` (Kilo does not read `.opencode/`).
Relative symlink targets keep repositories relocatable; junctions require absolute targets, so the junction path is computed with `path.resolve(dirname(link), relativeTarget)` and will not survive a repo move (recorded). Re-running install is idempotent. A pre-existing empty pointer directory is removed and replaced with the pointer; a non-empty non-symlink pointer directory is **never deleted**: collect its file entries, print an actionable block (exact paths + “move into `.agents/` or remove”), and fail that runtime’s install rather than silently leaving wayforge content invisible. Pointer entries are recorded as managed paths so `uninstall` removes them via the existing `lstat.isSymbolicLink()`/`unlink` handling. Dry-run logs intended actions only.

**Step 2: Add or update validation**

`pointers.test.ts`: both runtimes; happy path and idempotent re-run (`it.skipIf(!canSymlink())`); junction fallback via mocked `fs.symlinkSync` EPERM; unmanaged-directory preservation + failure report; manifest records pointer entries; dry-run. (owner: **agent**)

**Step 3: Write minimal implementation**

`ensureRuntimePointers`: module-level probe (create+unlink a temp symlink); resolve the pointer dir from `RUNTIME_POINTER_DIRS[runtime]`; ensure the pointer parent (`.opencode` or `.kilo`) exists; for `agents` and `commands` — lstat dest; if correct symlink, `managedTrackFile` (idempotent tracking) and skip; if an empty directory, remove it; if any non-empty non-symlink entry, collect residual paths and fail with remediation; otherwise `fs.symlinkSync(canSymlink ? relativeTarget : path.resolve(path.dirname(link), relativeTarget), link, canSymlink ? 'dir' : 'junction')` and `managedTrackFile`. Stubs are not implemented; ADR-0046 records the deferred design.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/pointers.test.ts cli/tests/unit/manifest.test.ts && cd cli && npx tsc --noEmit` (owner: **agent**). Then a scratch install and runtime smoke (owner: **human** for Kilo; OpenCode command may be run by the agent):
1. `npx tsx cli/src/index.ts install --repo /tmp/wfg-oc --providers free-tier --runtime opencode --no-track`; from that repo run `opencode agent list` and `opencode debug skill` — planner and a skill are visible.
2. `npx tsx cli/src/index.ts install --repo /tmp/wfg-kilo --providers openai --runtime kilocode --no-track`; from that repo run `kilo agent list` and `kilo debug skill` — planner and a skill are visible via `.kilo/`.
Expected: tests pass; both runtimes load from `.agents/`; manifest lists the pointer paths. If Kilo is unavailable on the dev host, record the Kilo smoke as pending and complete it in Task 7; do not claim it verified.

**Step 5: Commit**

`git add cli`
`git commit -m "feat: add runtime-specific pointer layer for .agents artifacts (Issue #227)"`

### Task 5: Migrate existing `.opencode/` installs + residual policy

**Objective:** Reinstalling over a legacy install moves manifest-recorded content into `.agents/`, removes legacy managed files, reports unmanaged residuals, and creates pointers only when the native directory is clear.

**Files:**
- Modify: `cli/src/lib/layout.ts` (`sourceForDest` accepts legacy `.opencode/<cat>/<sub>` prefixes)
- Modify: `cli/src/commands/install.ts` (refresh branch: translate legacy manifest paths to new destinations; post-sync legacy cleanup + residual report; call pointers after cleanup)
- Modify: `cli/tests/unit/manifest-override.test.ts` or new `cli/tests/unit/migration.test.ts`

**Step 1: Establish expected behaviour**

Given a repo with `.wayforge-managed` recording `.opencode/agents/planner.md` (file present, managed) plus an unmanaged `.opencode/agents/local.md`, reinstall:

- Syncs source → `.agents/agents/planner.md`.
- Deletes the legacy managed file and records `.agents/agents/planner.md` in the manifest.
- Preserves `local.md` and reports it as a residual.
- Prunes now-empty legacy category directories.
- For OpenCode: because `.opencode/agents` still contains `local.md`, do not create the pointer; print an actionable failure block (move/remove `local.md`, then rerun). For Kilo: legacy `.opencode` residuals do not block `.kilo` pointers; create the `.kilo` pointers and report the residual.
- Preserves `--force` semantics for config regeneration and `AGENTS.md` refresh.

**Step 2: Add or update validation**

Migration unit tests for both runtimes: legacy manifest + files seeded in a tmp repo → refresh → assert new destination populated, legacy managed gone, unmanaged residual preserved and reported, manifest rewritten to `.agents/...` plus pointer paths, empty legacy dirs removed, pointer policy applied, pointer entries not reported as unknown prefixes, dry-run unchanged. (owner: **agent**)

**Step 3: Write minimal implementation**

Extend `sourceForDest` to translate both prefixes. In the refresh loop, skip manifest paths that are pointer directories (`.opencode/{agents,commands}`, `.kilo/{agents,commands}`); `ensureRuntimePointers` owns them, but call `managedTrackFile` for each skipped pointer path so a mixed-runtime refresh keeps the other runtime’s pointers in the manifest. For every other manifest path, compute dest from the translated new-prefix relPath. After the loop, for each legacy manifest path, remove the legacy file if `isManagedFile`, then prune empty dirs up to `.opencode/`. Collect non-managed leftovers into one residual report block. Call `ensureRuntimePointers` after cleanup for both legacy and non-legacy refreshes (the non-legacy path is the idempotent re-run case). Decide pointer creation per runtime: OpenCode requires a clear `.opencode/{agents,commands}`; Kilo uses `.kilo/{agents,commands}` and reports `.opencode` leftovers without blocking. Reuse existing `rm`/`isManagedFile`/`walkFiles` helpers; no new dependencies. If pointers are blocked, finalize the managed manifest first so the synced `.agents` content is tracked and a rerun is idempotent, then report the exact residual paths and fail the install with a non-zero exit; never delete unmanaged files and add no new override flag.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit && cd cli && npx tsc --noEmit && npx eslint src/` (owner: **agent**)
Expected: migration tests pass; full unit suite green.

**Step 5: Commit**

`git add cli`
`git commit -m "feat: migrate legacy .opencode installs to .agents with residual reporting (Issue #227)"`

### Task 6: Rewrite integration tests and fix the QA gate

**Objective:** Replace the stale legacy-diff script with vitest integration tests that assert the `.agents/` layout, runtime pointers, migration, and uninstall; `make check` becomes fully green.

**Files:**
- Create: `cli/tests/integration/install-layout.test.ts`
- Delete: `cli/tests/integration/run.sh`
- Modify: `Makefile` (remove `check-integration` from `.PHONY`, remove the target, and remove its call from `check-tests`; `npx vitest run` already includes `cli/tests/**/*.test.ts`)

**Step 1: Establish expected behaviour**

Per runtime (`opencode`, `kilocode`): fresh install into a tmp dir yields `.agents/{agents,commands,skills,plugins}`, generated config with `./.agents/` plugin + skills entries, resolving runtime pointers (`.opencode/...` or `.kilo/...`), and a manifest recording `.agents/...` + pointer paths. Reinstall is idempotent. A mixed install (OpenCode then Kilo) generates both config files and both pointer sets without `--force` for the missing config. A seeded legacy install migrates with the Task 5 policy. Uninstall removes the `.agents/` tree, pointers, and manifest. Symlink assertions are gated on the capability probe (ADR-0031).

**Step 2: Add or update validation**

The new vitest suite **is** the validation. (owner: **agent**)

**Step 3: Write minimal implementation**

Port the meaningful scenarios using `doInstall`/CLI invocation into `fs.mkdtemp` dirs. Assert structure directly; no legacy bash comparison (the frozen legacy installer keeps producing `.opencode/`). Remove `run.sh`, the `check-integration` target, its `.PHONY` entry, and the `check-tests` call to it. `make check` → `check-ts` → `npx vitest run` now includes the integration test file.

**Step 4: Run test to verify pass**

Run: `make check` (owner: **agent**)
Expected: typecheck + lint + format + unit + integration + duplication all green — the first fully green `make check` on this branch. Do not require `make check-tests` (it runs the deprecated bats/Pester suites).

**Step 5: Commit**

`git add cli Makefile`
`git commit -m "test: rewrite integration suite for .agents layout and per-runtime pointers (Issue #227)"`

### Task 7: Docs, ignore rules, and compatibility matrix

**Objective:** Every non-historical reference reflects the new layout and pointers; repo ignore rules match; the required runtime compatibility matrix is verified and committed.

**Files:**
- Modify: `README.md`, root `AGENTS.md` (project structure + boundaries + test commands), `RELEASE.md`, `docs/ai/architecture.md`, `docs/ai/backlog/README.md`
- Modify: `.gitignore` (add `.agents/` and the generated pointer dirs `.kilo/agents`/`.kilo/commands`; keep `.opencode/`)
- Create: `docs/compatibility-matrix.md`
- Sweep: remaining hits from `rg -l "base/opencode|\.opencode/" --glob '!docs/ai/plans/**' --glob '!docs/ai/logs/**' --glob '!docs/ai/decisions/**' --glob '!docs/ai/reports/**' --glob '!docs/ai/prompt-audit*.md' --glob '!install/legacy/**' --glob '!cli/tests/**' --glob '!tests/**'` (tests may intentionally retain `.opencode` fixtures for migration coverage)

**Step 1: Establish expected behaviour**

Docs describe: flat `base/` with input vs installed categories; `.agents/` as the canonical installed tree; OpenCode `.opencode` pointers, Kilo `.kilo` pointers; skills/plugins via config paths; Pi discovers `.agents/skills/` natively; per-runtime materialization is future work; frozen legacy installers are broken by the flatten. Consuming repos ignore `.agents/`, the generated pointer dirs (`.opencode/...` or `.kilo/agents`/`.kilo/commands`), and generated configs; do not blanket-ignore `.kilo/` because it may hold user-authored Kilo config.

**Step 2: Add or update validation**

`rg` sweep returns zero non-historical hits; `make check` green. Matrix cells are verified by running each runtime (owner: **human** for Kilo, Pi, and Windows; OpenCode may be run by the agent). (owner: **agent** for the sweep/docs)

**Step 3: Write minimal implementation**

Apply doc edits (including the living `docs/ai/backlog/README.md` helper path); keep `base/AGENTS.md` generic (template-preservation boundary); root `AGENTS.md` may be edited directly. Add `.agents/` and the generated pointer dirs `.kilo/agents`/`.kilo/commands` to `.gitignore`; do not ignore source `base/` or all of `.kilo/`. Write `docs/compatibility-matrix.md` with rows agents/commands/skills/plugins and columns opencode/kilocode/pi; each cell is `verified` (with note) or `n/a`. Record the Windows junction behavior in the pointer mechanism row/notes. Do not edit historical plans/logs/decisions/reports, intentional test fixtures, or frozen legacy scripts.

**Step 4: Run test to verify pass**

Run: sweep command above + `make check` (owner: **agent**); human fills the matrix by running the supported runtimes against a scratch install (owner: **human**).
Expected: zero stale references; all gates green; every matrix cell has evidence or an explicit n/a.

**Step 5: Commit**

`git add README.md AGENTS.md RELEASE.md docs/ai/architecture.md docs/ai/backlog/README.md .gitignore docs/compatibility-matrix.md`
`git commit -m "docs: document .agents layout, runtime pointers, and compatibility matrix (Issue #227)"`
