# ADR-0046: Generic `.agents/` artifact directory with per-runtime pointers

Date: 2026-10-26
Status: Accepted

## Context

The installer currently writes OpenCode-shaped runtime trees directly into the target repository: `.opencode/{agents,commands,skills,plugins}`, generated `opencode.jsonc`/`kilo.jsonc`, and an `.opencode/plugins/ponytail/ponytail.mjs` plugin entry. That makes the OpenCode path the product contract even though the same agent, command, skill, and plugin content is runtime-agnostic and is already consumed by other runtimes (Pi reads `.agents/skills/**/SKILL.md` natively, without any installer step).

Issue #227 asks for one canonical artifact tree, `.agents/`, with per-runtime indirection, plus a flattened source tree (`base/` instead of `base/opencode/`). Two decisions were left open in the issue: whether flattening `base/` needs extra namespacing to keep generation inputs separate from installed content, and how the runtime indirection should work. The issue also asserted that "both runtimes install into `.opencode/`". That assertion describes the current installer bug, not Kilo's runtime behavior.

The decision needs a record before code changes because the pointer mechanism is cross-platform (ADR-0031), it changes the installed surface and manifest, and flattening `base/` breaks the frozen legacy installers (ADR-0033).

### Verified evidence (2026-10-26)

**Kilo 7.8.17 no longer reads `.opencode/` project directories.** Checked against the `v7.8.17` tag (commit `eb11204e8f146fb2b98676029b8d9a9f841c1f6c`) of `Kilo-Org/kilocode`:

- `packages/opencode/src/kilocode/system-prompt.ts:29` — "Put new commands and agents in `.kilo/`. Do not use `.kilocode/` or `.opencode/`."
- `packages/opencode/src/config/paths.ts:29,35` — config directories are discovered with `targets: [".kilocode", ".kilo"]` (project and home scans); `.opencode` is not among them.
- `packages/opencode/src/config/agent.ts:31` — agents are globbed as `{agent,agents}/**/*.md` inside those directories; `packages/opencode/src/config/command.ts:32` — commands as `{command,commands}/**/*.md`.
- `packages/opencode/src/kilocode/config/config.ts:693` — "Kilo used to fall back to opencode configuration but no longer reads `.opencode` directories." `detectOpencodeConfig()` (`:696`) and `opencodeConfigNotification()` (`:729`) only surface a "Move your opencode configuration" notification for leftover `.opencode` directories.
- `packages/opencode/src/kilocode/config/config.ts:41` — `ALL_CONFIG_FILES = ["kilo.jsonc", "kilo.json", "opencode.jsonc", "opencode.json"]`, so Kilo still merges root-level `opencode.json(c)` as a config file (`projectConfigFiles`, `:62`) while no longer scanning the `.opencode/` directory for agents/commands.
- Kilo CLI surface for the smoke test exists in the same tag: `packages/opencode/src/index.ts:107,110` registers `DebugCommand` and `AgentCommand`; `packages/opencode/src/cli/cmd/agent.ts:238` defines `command: "list"`; `packages/opencode/src/cli/cmd/debug/skill.ts:7` defines `command: "skill"`. The binary smoke is verified 2026-10-26 with a scratch install from this checkout: `npx --yes @kilocode/cli@7.8.17 agent list`, `debug skill`, and `debug config` expose the six agents, the wayforge skills, and the ponytail plugin from `.agents/`.

**OpenCode 1.18.35 follows directory symlinks and accepts both `skills` shapes.** Probed on Linux with `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` in a scratch repo containing `.agents/agents/probe-agent.md`, `.agents/skills/demo-skill/SKILL.md`, and `.opencode/agents -> ../.agents/agents`:

- `opencode agent list` prints `probe-agent (subagent)`, so the symlinked `.opencode/agents` directory is followed.
- `opencode debug skill` lists `demo-skill` when either `{"skills": {"paths": ["./.agents/skills"]}}` or `{"skills": ["./.agents/skills"]}` is in `opencode.jsonc`, and when `.opencode/skills -> ../.agents/skills` exists with no `skills` key.
- With none of the three, `demo-skill` is absent. The skill needs frontmatter `name:` matching its folder; without it OpenCode filters it out.
- `opencode debug skill` and `opencode agent list` exist in this version.

**Config schemas (fetched 2026-10-26).** `https://opencode.ai/config.json` and `https://app.kilo.ai/config.json` (Kilo's document keeps `$id: https://opencode.ai/config.json`; it adds Kilo-specific keys such as `auto_collapse_reasoning`, `commit_message`, and `notebook_*` permissions, and differs in `model`/`small_model`/`experimental` details). The `skills`, `plugin`, and `plugins` shapes are identical in both:

- `skills` is `anyOf`: an array of strings, or an object `{paths?: string[], urls?: string[]}`. The object form is marked `deprecated: true`; the array form is not.
- `plugin` is an array (string or `[name, options]` tuple) marked `deprecated: true`.
- `plugins` exists as a non-deprecated array of strings or `{package, options}` entries.

**Generated config currently emits the deprecated `plugin` key.** `cli/src/lib/config-gen.ts:218` writes `"plugin": ["./.opencode/plugins/ponytail/ponytail.mjs"]`. Runtime probe: with `{"plugins": ["./.agents/plugins/ponytail/ponytail.mjs"]}`, `opencode debug config` resolves `"plugin": []` (the key validates but the loader ignores it); with `{"plugin": [...]}`, the same input resolves to a `file://` plugin entry with `plugin_origins`. The non-deprecated `plugins` key is therefore not yet usable, and the generator must keep emitting `plugin`.

**Windows junction behavior is unverified.** No Windows host is available on the dev host. Junction creation and repo relocation after a junction pointer are an open verification item for Task 4/Task 7 (owner: human).

## Decision

1. **Flat `base/` with an explicit input/content split.** The source tree becomes `base/AGENTS.md` plus `base/{agents,commands,skills,plugins,config,permissions}`. `CONTENT_CATEGORIES = ['agents','commands','skills','plugins']` are installed; `base/config` and `base/permissions` are generation inputs, read through the `InputCategory` union (`'config' | 'permissions'`) and never installed. No extra physical namespacing (for example `base/inputs/config`) is introduced: the split is enforced and declared in one module (`cli/src/lib/layout.ts`) and documented, and an extra directory level adds no behavioral difference.
2. **`.agents/` is the single canonical installed tree** for all four content categories: `.agents/{agents,commands,skills,plugins}`. Permissions are rendered into `.agents/agents/*.md`, as they are rendered into the installed agent files today.
3. **Runtime indirection is per runtime and declared, not inferred.** `RUNTIME_POINTER_DIRS = { opencode: '.opencode', kilocode: '.kilo' }`. Only `agents` and `commands` get pointers, because those are the only artifact categories a runtime discovers by scanning a directory: OpenCode gets `.opencode/agents` and `.opencode/commands`; Kilo gets `.kilo/agents` and `.kilo/commands`, because Kilo no longer reads `.opencode/` (evidence above). Skills and plugins reach both runtimes through generated config paths (`skills` entries and the plugin entry), so they need no pointers. `.opencode` and `.kilo` literals may exist only in `layout.ts` as declared runtime indirection or as named legacy constants.
4. **Pointer mechanism: relative directory symlink first, Windows junction fallback.** A capability probe (create and remove a temporary symlink, per ADR-0031 decisions 3 and 5) run against the **target repository volume** selects the mechanism; no `process.platform === 'win32'` hardcoding. The probe must run in the repository rather than `os.tmpdir()` because symlink support belongs to the destination filesystem: WSL's `/mnt/c`, exFAT/FAT32, and SMB/UNC repositories reject symlinks even when the temp directory accepts them. When the probe says symlinks are available but creation still fails, creation is retried once as a junction; if both mechanisms fail, the pointer is reported as a residual with the OS error code and the install exits non-zero through the residual path instead of aborting on a raw errno. Relative symlink targets keep a repository relocatable. Junctions require absolute targets, so the junction target is `path.resolve(dirname(link), relativeTarget)` and does not survive moving the repository; that limitation is accepted and recorded. Removal mirrors the chain: `rm()` unlinks a symlink and falls back to `rmdir` when `unlink` fails with `EPERM`/`EISDIR` on a junction, which removes the link and leaves the `.agents/` target intact.
5. **Migration and residual policy.**
    - Manifest-recorded legacy paths (`.opencode/<category>/<sub>`) are synced to their `.agents/<category>/<sub>` destination, the legacy managed file is removed, and empty legacy category directories are pruned.
    - A wayforge-owned generated config that still describes the legacy layout (it names `.opencode/` paths or has no `skills` key) is regenerated during migration. Both runtimes' configs are examined, because a mixed install holds one config per runtime and Kilo also merges a root `opencode.jsonc`: regenerating only the selected runtime's config would leave the sibling config pointing at plugin and skills paths the migration just deleted.
    - Unmanaged files are never deleted. If residuals leave a native pointer directory non-empty, the pointer is not created; the installer reports the exact residual paths with remediation ("move into `.agents/` or remove"), finalizes the managed manifest so the synced `.agents/` content is tracked, and exits non-zero. Content is never silently left invisible.
    - A pre-existing empty pointer directory is replaced by the pointer; a symlinked pointer that is already correct is idempotent and re-tracked.
    - Kilo legacy `.opencode` residuals do not block `.kilo` pointers; they are reported.
    - No new override flag is introduced: `--force` keeps its existing meaning (regenerate managed files/config).
6. **Generated stubs are deferred.** The fallback chain is relative symlink → junction → deferred stub. Stubs (materialized copies of `.agents/` content at the native path) are not implemented now and are recorded as `ponytail: debt` when the pointer layer lands. Per-runtime content materialization is explicitly future work.
7. **Scope is OpenCode and Kilo.** Pi consumes `.agents/skills/` natively — the harness reports this repository's skills at `.agents/skills/<name>/SKILL.md` (for example `.agents/skills/ai-memory/SKILL.md`) with no installer step — so Pi needs no installer change.
8. **The issue's "both runtimes install into `.opencode/`" statement is corrected, not implemented.** That was the installer bug: `--runtime kilocode` wrote prompt files into a directory Kilo no longer scans, producing a `kilo.jsonc` that names agents whose prompt files were invisible. The fix is `.kilo` pointers, not a shared `.opencode` tree.
9. **Config emission forms.** Generated config keeps `plugin` (the only form OpenCode 1.18.35 honors) and emits the plugin entry from the layout as `./.agents/plugins/ponytail/ponytail.mjs`. Generated config adds `skills` in the non-deprecated array form (`"skills": ["./.agents/skills"]`), which is verified to load on OpenCode 1.18.35; the deprecated `{paths}` object form is the documented fallback if a runtime regression appears. Moving to `plugins` is a one-line change once a release honors it; that transition is tracked, not silent.
10. **Frozen legacy installers break by design.** `install/legacy/bootstrap-legacy.sh`, `install/legacy/lib/managed_sync-legacy.sh`, and `install/legacy/bootstrap-legacy.ps1` read `base/opencode/**`. Flattening `base/` breaks them. They stay untouched per ADR-0033 (frozen, deprecated, deletion tracked there); docs record the break.

## Alternatives considered

- **Keep installing `.opencode/` for every runtime (status quo).** Rejected: Kilo 7.8.17 never reads those directories, so `--runtime kilocode` is already broken for agents/commands; Pi needs `.agents/skills/`; content is runtime-agnostic.
- **Materialize per-runtime trees from `.agents/` (copy or generate definitions into `.opencode/` and `.kilo/`).** Rejected for now: duplicates content, invites drift, and adds a generation step per runtime. Kept as future work once pointers prove insufficient.
- **Generate runtime-specific stub files instead of pointers.** Deferred: more moving parts and per-file churn than a directory symlink; becomes the fallback when symlinks and junctions are both unavailable (recorded in Decision 6).
- **Hardlink the directories.** Rejected: hardlinks cannot point at directories portably, fail across filesystems, and have poor Windows support.
- **Name-space generation inputs physically (`base/inputs/{config,permissions}`).** Rejected: no behavioral difference; the `InputCategory` union plus docs expresses the same invariant with less path churn.
- **Adopt the non-deprecated `plugins` key now.** Rejected: verified ignored by OpenCode 1.18.35 (`debug config` resolves an empty plugin list), which would silently stop loading the ponytail plugin.

## Consequences

- One installed tree (`.agents/`) replaces four per-runtime trees; OpenCode and Kilo load agents/commands through tracked pointers, and skills/plugins through generated config paths.
- Manifest paths become `.agents/...` plus pointer entries. Uninstall removes the `.agents/` tree, pointers (`unlink` for symlinks, the `rmdir` fallback for junctions that refuse `unlink` with `EPERM`/`EISDIR`), and the manifest.
- The upgrade path converges on a fresh-install result: managed-path detection consults `.wayforge-managed` and the in-progress `.wayforge-managed.tmp`, so the first post-upgrade refresh renders agent permissions instead of skipping migrated agents as unmanaged.
- A wayforge-owned generated config that still names `.opencode` or carries no `skills` key is regenerated (`isLayoutStaleConfig`), so a migrated repository gets the same `.agents` plugin and skills paths a fresh install writes.
- Pointer directories are declared once (`POINTER_PATHS` / `pointerPathsFor(runtime)` in `layout.ts`), so `isPointerPath` and the legacy residual report cannot drift: a residual under the current runtime's pointer directory is reported by the pointer layer only, not twice.
- Symlink-based installs remain relocatable; junction-based installs (Windows without symlink capability) break if the repository is moved. Documented, accepted, and to be verified on Windows (Task 4/Task 7).
- A non-empty `.opencode/{agents,commands}` in an existing OpenCode install blocks pointer creation until the user moves or removes those files; the install fails with exact paths rather than silently hiding content. Kilo installs are not blocked by `.opencode` leftovers, but Kilo has a built-in "Move your opencode configuration" notification that those leftovers trigger while they remain.
- Mixed installs generate both `opencode.jsonc` and `kilo.jsonc`; Kilo also merges a root `opencode.jsonc` if present (its config file chain includes it), even though it ignores the `.opencode/` directory.
- The generated config still carries the deprecated `plugin` key; the switch to `plugins` is a tracked follow-up, not a silent behavior change.
- Frozen legacy installers no longer work against a flattened source tree. Accepted per ADR-0033; no migration shim is added.
- Tests shift destinations from `.opencode/` to `.agents/` and gain pointer, migration, and residual-reporting coverage. The stale bash integration script is replaced by vitest in the same plan.

## Related

- ADR-0009 (Unified Managed File Format) — the manifest the pointers are tracked in.
- ADR-0031 (Cross-Platform Parity Conventions) — symlink capability probe and the "no `win32` hardcoding" rule applied to the pointer mechanism.
- ADR-0032 (Runtime sourceDir resolution) — `base/` remains the source root after flattening.
- ADR-0033 (Legacy installer deprecation) — the accepted break of frozen legacy installers.
- ADR-0035 (One-shot CLI installer) — installer shape the layout module plugs into.
- Plan: `docs/ai/plans/2026-10-25_075150-issue-227-agents-artifact-dir.md`
- Issue: #227
