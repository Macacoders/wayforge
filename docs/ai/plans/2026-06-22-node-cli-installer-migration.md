# Plan: Node.js CLI Installer Migration

**Created**: 2026-06-22
**Status**: Complete — Phases 1-5, B, and 6C complete. (2026-07-06)
**Approved**: 2026-06-30
**Related**: ADR-0015 (remove agent presets), Issue #50 (global CLI installation and service registration)
**Distinction from #27/#84**: Issues #27 and #84 target an OpenCode plugin/tool running *inside* OpenCode's runtime. This plan delivers a standalone CLI that runs *outside* OpenCode — it is the installer that bootstraps OpenCode configuration into target repositories. The two are complementary, not dependent.

## Goal

Replace the dual-platform shell installer surface (~4,000 lines of bash + PowerShell across 10 files) with a single cross-platform TypeScript Node.js CLI. Node.js is an acceptable prerequisite since OpenCode already requires it.

## Scope Classification

- **Size**: Multi-phase (porting ~4,000 lines of shell logic)
- **Phase budget**: 6 phases
- **Phase budget rationale**: The work spans project scaffold, library code (file ops + manifest + config generation), install command, secondary commands (uninstall + interactive), and integration/test/docs. Each phase is a reviewable deliverable with distinct acceptance criteria. Fewer phases would bundle too much logic into unreviewable chunks. This plan requires explicit user confirmation before implementation handoff.
- **Quick delivery eligible**: No.
- **Split required**: No (fits within 6-phase ceiling).

## Decisions Locked In

| Decision | Outcome |
|---|---|
| Distribution | Local tool within this repo, no npm publish (for now) |
| Shell installer fate | Kept functional during transition; deprecated after Node CLI is stable |
| PowerShell installer fate | Same — kept during transition, removed in follow-up |
| `--ref` support | Ported to Node CLI (git clone from tag) |
| `--agent-preset` | Not ported (already removed per ADR-0015) |
| Target Node version | Node 18+ (LTS) |
| CLI framework | `commander` |
| File I/O | `fs-extra` |
| Language | TypeScript, compiled to JavaScript |
| Test framework | Vitest (unit) + shell-based integration tests |

## Architecture Notes

### Current surface to port

| File | Lines | Role |
|---|---|---|
| `install/bootstrap.sh` | 887 | Main bash installer |
| `install/bootstrap.ps1` | 847 | PowerShell equivalent |
| `install/bootstrap-interactive.sh` | 256 | Interactive bash wrapper |
| `install/bootstrap-interactive.ps1` | ~250 | Interactive PowerShell wrapper |
| `install/uninstall.sh` | 235 | Bash uninstaller |
| `install/uninstall.ps1` | ~230 | PowerShell uninstaller |
| `install/lib/managed_sync.sh` | 801 | Bash managed sync library |
| `install/lib/managed_sync.ps1` | ~800 | PowerShell managed sync library |
| `install/bashrc_snippet.sh` | ~10 | Shell alias snippet |
| `install/powershell_profile_snippet.ps1` | ~10 | PowerShell alias snippet |

### Target structure

```
cli/                          # New Node CLI root
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entrypoint (commander)
│   ├── commands/
│   │   ├── install.ts        # install command
│   │   ├── uninstall.ts      # uninstall command
│   │   └── interactive.ts    # interactive command
│   ├── lib/
│   │   ├── files.ts          # File I/O helpers (dry-run aware)
│   │   ├── manifest.ts       # .ai-config-managed lifecycle
│   │   ├── config-gen.ts     # opencode.jsonc generation
│   │   ├── providers.ts      # Provider model selection logic
│   │   ├── permissions.ts    # Agent permission YAML rendering
│   │   ├── tracking.ts       # installed-projects.json
│   │   └── ref.ts            # Git clone from --ref
│   └── types.ts              # Shared TypeScript types
├── tests/
│   ├── unit/
│   │   ├── manifest.test.ts
│   │   ├── config-gen.test.ts
│   │   ├── providers.test.ts
│   │   └── permissions.test.ts
│   └── integration/
│       └── install.test.sh   # Shell script: diff Node vs Bash output
└── dist/                     # Compiled output (gitignored)
```

### Preserved invariants

- `opencode.jsonc` / `kilo.jsonc` output **byte-identical** to bash installer for all provider × runtime combinations
- `.ai-config-managed` manifest format unchanged
- `installed-projects.json` format unchanged
- Agent file path rewriting (`base/opencode/` → `.opencode/`) preserved
- Permission injection from `agents.yml` into agent markdown frontmatter preserved
- `--dry-run` logs without side effects
- Reinstall without `--force` preserves `AGENTS.md` and runtime config, refreshes managed trees
- Uninstall removes only manifest-tracked files, cleans empty parent dirs up to repo root

## Phases

### Phase 1: Project scaffold and CLI framework

**Scope**: Set up the TypeScript/Node.js project under `cli/`, CLI entrypoint with `commander`, argument parsing for all planned commands. No installer logic — just the shell that prints `--help` and validates flags.

**Acceptance criteria**:
- `cli/package.json` with TypeScript, `commander`, `fs-extra`, `vitest` dependencies
- `cli/tsconfig.json` with strict mode, Node 18+ target
- CLI entrypoint wired to `bin` in package.json
- `node cli/dist/index.js install --help` prints usage matching `install/bootstrap.sh --help`
- `node cli/dist/index.js uninstall --help` prints usage matching `install/uninstall.sh --help`
- `node cli/dist/index.js interactive --help` prints usage
- All flags parse correctly: `--repo`, `--providers`, `--model`, `--small-model`, `--runtime`, `--ref`, `--dry-run`, `--force`
- Invalid flags produce clear error messages

**Risks**: Low. No behavior changed, just scaffolding.

**Files created**:
- `cli/package.json`
- `cli/tsconfig.json`
- `cli/src/index.ts`
- `cli/src/types.ts`
- `cli/src/commands/install.ts` (stub)
- `cli/src/commands/uninstall.ts` (stub)
- `cli/src/commands/interactive.ts` (stub)

---

### Phase 2: Core library — File operations and manifest management

**Scope**: Port `install/lib/managed_sync.sh` to TypeScript. Foundation for everything else:
- File I/O helpers (copy, write, mkdir, rm, symlink) with `--dry-run` awareness
- Managed file/directory detection (`is_managed_file`, `is_managed_dir`)
- Manifest lifecycle (`init_managed_manifest`, `add_managed_path`, `finalize_managed_manifest`, `read_managed_manifest`)
- Managed tree sync (`sync_managed_tree`, `sync_managed_file`, `sync_managed_path_from_manifest`)
- Agent permission rendering from `agents.yml`
- `installed-projects.json` tracking (create/append with duplicate detection)

**Acceptance criteria**:
- All `managed_sync.sh` functions have TypeScript equivalents with identical logic
- Dry-run mode logs operations without mutating files
- `.ai-config-managed` manifest is byte-identical to what bash produces for all operations
- `installed-projects.json` append logic handles duplicates identically
- Agent permission YAML rendering produces identical frontmatter injection
- Unit tests: manifest read/write, managed path detection, permission rendering, tracking file append

**Risks**: Medium. Manifest format, JSON surgery, and YAML frontmatter injection must produce identical output. The bash code uses line-based surgery for `installed-projects.json` — TypeScript will use proper JSON parse/modify/write, but must produce identical formatting.

**Files created**:
- `cli/src/lib/files.ts`
- `cli/src/lib/manifest.ts`
- `cli/src/lib/permissions.ts`
- `cli/src/lib/tracking.ts`
- `cli/tests/unit/manifest.test.ts`
- `cli/tests/unit/permissions.test.ts`

---

### Phase 3: Config generation

**Scope**: Port the `opencode.jsonc` / `kilo.jsonc` generation logic:
- Provider block assembly from `base/opencode/config/providers/*.jsonc`
- Agent block selection based on provider combination
- Model selection logic (planner, research, code, quickcode, taskanalyst, test models per provider)
- Runtime config filename selection (`opencode.jsonc` vs `kilo.jsonc`)
- Schema URL selection per runtime
- `--model` / `--small-model` override support
- `enabled_providers` array construction (excluding `free-tier`)

Note: `--agent-preset` is intentionally excluded — already removed per ADR-0015.

**Acceptance criteria**:
- Generated `opencode.jsonc` is byte-identical to bash output for all provider combinations:
  - `free-tier` (opencode only)
  - `openai` (opencode + kilocode)
  - `github-copilot` (opencode + kilocode)
  - `laberit` (opencode + kilocode)
  - `opencode-go` (opencode only)
  - `openai,github-copilot` (opencode + kilocode)
  - `openai,laberit` (opencode + kilocode)
  - `openai,github-copilot,laberit`
- `--model openai/gpt-5.3-codex` overrides the default model in generated config
- `--small-model github-copilot/gpt-5.3-codex` overrides the small model
- Unit tests: compare generated JSON against known-good bash output for each provider × runtime combination

**Risks**: Medium. JSON assembly is fragile — trailing commas, whitespace, provider block ordering, and agent block selection must match exactly. The bash installer does manual string concatenation; TypeScript will construct objects and serialize, requiring careful whitespace matching.

**Files created**:
- `cli/src/lib/providers.ts`
- `cli/src/lib/config-gen.ts`
- `cli/tests/unit/config-gen.test.ts`
- `cli/tests/unit/providers.test.ts`

---

### Phase 4: Install command

**Scope**: Wire the library code from Phases 2-3 into a complete `install` command:
- Fresh install (first-time to a repo)
- Reinstall without `--force` (refresh managed paths from manifest, preserve `AGENTS.md` and runtime config)
- Reinstall with `--force` (full regeneration of all managed output)
- `--dry-run` preview
- `--ref` support (git clone from tag/branch/commit using `simple-git` or `child_process`)
- Path rewriting (`base/opencode/` → `.opencode/`) in installed agent files
- Centralized permission injection from `agents.yml`
- Post-install summary log matching bash output style

**Acceptance criteria**:
- `node cli/dist/index.js install --repo /tmp/test-repo --providers openai` produces output identical to `./install/bootstrap.sh --repo /tmp/test-repo --providers openai`
- Reinstall without `--force` refreshes agents/commands/skills/plugins but preserves `AGENTS.md` and `opencode.jsonc`
- Reinstall with `--force` regenerates everything including `AGENTS.md` and `opencode.jsonc`
- `--dry-run` logs all planned operations without creating or modifying any files
- `--ref v0.1.0` clones ai-config at the specified tag and installs from it
- `--runtime kilocode` generates `kilo.jsonc` instead of `opencode.jsonc`
- Integration test: install to a temp repo with both Node CLI and bash installer, `diff -r` shows no differences

**Risks**: Medium-high. This is the integration point. Order-of-operations bugs (e.g., manifest written before all files synced) could break the managed overlay contract. The `--ref` git clone path must clean up temp directories correctly.

**Files created**:
- `cli/src/lib/ref.ts`
- `cli/src/commands/install.ts` (full implementation)
- `cli/tests/integration/install.test.sh`

---

### Phase 5: Uninstall, interactive mode, shell snippets

**Scope**: Port the remaining installer surface:
- `uninstall` command:
  - Read `.ai-config-managed` to discover tracked paths
  - Remove each managed file
  - Clean empty parent directories up to (but not including) repo root
  - Remove `.ai-config-managed` itself
  - Update `installed-projects.json` to remove the project entry
- `interactive` command:
  - Numbered menu prompts matching `bootstrap-interactive.sh`
  - Runtime selection (opencode/kilocode)
  - Provider set selection (with correct options per runtime)
  - Dry-run and force toggles
  - Confirmation summary before proceeding
- Shell snippet helpers:
  - Update `install/bashrc_snippet.sh` and `install/powershell_profile_snippet.ps1` to define aliases that call the Node CLI

**Acceptance criteria**:
- `node cli/dist/index.js uninstall --repo /tmp/test-repo` removes exactly the same files as `./install/uninstall.sh --repo /tmp/test-repo`
- `node cli/dist/index.js uninstall --dry-run --repo /tmp/test-repo` previews without deleting
- `node cli/dist/index.js interactive` presents the same numbered choices as `./install/bootstrap-interactive.sh`
- Shell profile snippets define aliases (`ai-install`, `ai-uninstall-repo`, etc.) that delegate to the Node CLI
- Uninstall cleans up `installed-projects.json` correctly (removes single entry, removes file if last entry)

**Risks**: Low. Straightforward ports of well-understood logic. The interactive mode is essentially a prompt chain.

**Files created/modified**:
- `cli/src/commands/uninstall.ts` (full implementation)
- `cli/src/commands/interactive.ts` (full implementation)
- `install/bashrc_snippet.sh` (modified — alias to Node CLI)
- `install/powershell_profile_snippet.ps1` (modified — alias to Node CLI)

---

### Phase 6: Integration, tests, Makefile, documentation

**Scope**: Final integration and polish:
- Wire Node CLI validation into `make check`:
  - `make check-node`: TypeScript compilation check (`tsc --noEmit`), linting (ESLint), formatting (Prettier)
  - Optional: add `cli/` to existing `make check` pipeline
- Integration test suite:
  - Shell script that runs both Node CLI and bash installer against temp repos for all provider × runtime combinations
  - `diff -r` comparison to verify byte-identical output
- Documentation updates:
  - `README.md`: add Node CLI as the primary install method section
  - `architecture.md`: document the Node CLI as the installer component
  - `AGENTS.md`: add build/test commands for the CLI
- Deprecation notice:
  - Add a comment block at the top of `install/bootstrap.sh`, `install/bootstrap.ps1`, `install/uninstall.sh`, and `install/uninstall.ps1` noting they are deprecated in favor of the Node CLI

**Acceptance criteria**:
- `make check` passes (existing Bash/PowerShell QA unaffected)
- `make check-node` passes (TypeScript compiles, ESLint clean, Prettier clean)
- Integration test script passes for all provider × runtime combinations
- README shows the Node CLI as the recommended install method with examples
- Shell installers print a deprecation notice at the top of `--help` output
- Git diff shows no changes to `base/opencode/**` source files (only installer code and docs changed)

**Risks**: Low. Documentation and build system changes. The integration test script is the main risk — it must handle all provider × runtime combinations correctly.

**Files modified**:
- `Makefile` (add `check-node` target)
- `README.md` (add Node CLI section)
- `docs/ai/architecture.md` (document Node CLI)
- `AGENTS.md` (add CLI build/test commands)
- `install/bootstrap.sh` (add deprecation notice)
- `install/bootstrap.ps1` (add deprecation notice)
- `install/uninstall.sh` (add deprecation notice)
- `install/uninstall.ps1` (add deprecation notice)

**Files created**:
- `cli/.eslintrc.json` (or `eslint.config.mjs`)
- `cli/.prettierrc`
- `cli/tests/integration/run-all.sh`

---

## Validation Strategy

| Phase | Validation |
|---|---|
| 1 | `node cli/dist/index.js --help`, `tsc --noEmit` |
| 2 | Unit tests for manifest I/O, file ops, permission rendering. Manual diff against bash manifest output |
| 3 | Unit tests comparing generated JSON against bash output for all provider × runtime combos |
| 4 | Integration test: install to temp repo, `diff -r` against bash installer output. Manual smoke tests |
| 5 | `uninstall --dry-run` on a test repo, interactive menu smoke test |
| 6 | `make check`, `make check-node`, full integration test suite, README review |

## Future Work (Out of Scope)

- **npm publishing**: When the CLI is stable, publish to npm for `npx ai-config install` usage. This would fully satisfy Issue #50's "global CLI installation" acceptance criteria.
- **Shell/PowerShell installer removal**: Remove after a deprecation period.
- **Service/daemon registration (Issue #50)**: The "service" question in #50 — whether ai-config needs a background daemon (systemd, Windows Service) — is separate from the CLI migration. This plan answers the first half of #50 (global CLI). The daemon half remains an open question for a future task.
- **`installed-projects.json` UI**: A `list` subcommand showing all installed projects with versions and drift status.
- **Config diff/drift detection**: Compare installed config against source templates.

## Phase B: Zero-Dependency Delivery (Completed 2026-07-06)

Phase B addressed the delivery architecture from Issue #131 — making the CLI usable without Node.js via a compiled standalone binary and auto-download shell entrypoint.

### Delivered

| Component | Details |
|---|---|
| `make cli-binary` | Reproducible `bun build --compile` target producing `dist/ai-config-<os>-<arch>`. Version embedded via `--define process.env.AI_CONFIG_VERSION`. |
| `install/bootstrap.sh` | Replaced 847-line bash installer with 80-line thin wrapper: local binary → cached release → GitHub download → `npx tsx` fallback → clear error. |
| `install/bootstrap-legacy.sh` | Original 847-line installer preserved as fallback reference. |
| `cli/src/index.ts` | Version now reads from `process.env.AI_CONFIG_VERSION` (falls back to `"0.1.0"`). |
| `.github/workflows/release.yml` | Extended with 4-platform matrix build (linux-x64, linux-arm64, darwin-x64, darwin-arm64). Binaries attached to GitHub Releases for download by shell entrypoint. |
| Binary size | ~100MB (`bun build --compile` embeds bun runtime). Accepted per user decision (Option A). |

---

## Phase 6C: Integration, Linting, Docs, and Deprecation (Scoped 2026-07-06)

Phase 6 was partially complete — the CLI commands (install, uninstall, interactive) work and `make check` runs TypeScript tests. What remains:

### Phase 6C-1: CLI Linting & Formatting

**Scope**: Add ESLint + Prettier configuration for the `cli/` TypeScript source.

| File | Action |
|---|---|
| `cli/.eslintrc.json` (or `eslint.config.mjs`) | Create — TypeScript-ESLint with strict preset, aligned with `tsconfig.json:strict` |
| `cli/.prettierrc` | Create — 2-space, single quotes, trailing commas, no semicolons (match repo style) |
| `Makefile` | Add `check-node` target: `tsc --noEmit`, `npx eslint cli/src/`, `npx prettier --check cli/src/` |
| `Makefile` | Add `fix-node` target: `npx eslint --fix cli/src/`, `npx prettier --write cli/src/` |

**Acceptance criteria**:
- `make check-node` passes with 0 errors
- Existing code auto-fixed by `make fix-node` without manual edits
- `check-node` wired into `make check` pipeline

**Risks**: Low. Existing code is relatively clean; max a few lint violations.

---

### Phase 6C-2: Integration Test Suite

**Scope**: Shell script that validates the TypeScript CLI produces byte-identical output to the legacy bash installer for key provider × runtime combinations.

**File created**: `cli/tests/integration/run.sh`

Test matrix (smoke — not exhaustive):
| Providers | Runtime |
|---|---|
| `free-tier` | `opencode` |
| `openai` | `opencode` |
| `openai,github-copilot` | `opencode` |
| `openai` | `kilocode` |

For each combination:
1. Run `npx tsx cli/src/index.ts install --repo /tmp/test --providers X --runtime Y --dry-run`
2. Run legacy `install/bootstrap-legacy.sh --repo /tmp/test --providers X --runtime Y --dry-run`
3. `diff -r` the two target directories — expect identical `opencode.jsonc`/`kilo.jsonc`, AGENTS.md, managed manifest

**Acceptance criteria**:
- `cli/tests/integration/run.sh` exits 0 for all 4 combinations
- Wired into `make check-tests` (or separate `make check-integration`)
- Fails clearly with diff output if CLI output diverges

**Risks**: Medium. The legacy installer and TS CLI share model resolution logic now (`providers.ts`), but config generation paths may diverge on edge cases. The integration suite catches these.

---

### Phase 6C-3: Documentation Updates

**Scope**: Document the Node CLI as the primary install method.

| File | Change |
|---|---|
| `README.md` | Add "CLI Installer" section above the shell installer section. Show `npx tsx cli/src/index.ts install --repo /path --providers openai` as the recommended command. Mention binary download via `install/bootstrap.sh`. |
| `docs/ai/architecture.md` | Add "Installer (CLI)" component: TypeScript + Commander, `cli/src/`, binary compilation via `make cli-binary`. |
| `AGENTS.md` — Build/Test Commands | Add `make check-node` (lint), `npx vitest run` (unit tests), `cli/tests/integration/run.sh` (integration). |

**Acceptance criteria**:
- README shows the TS CLI first, shell installer second
- Architecture doc reflects the current component boundaries
- AGENTS.md build/test section is accurate

**Risks**: Low. Documentation-only.

---

### Phase 6C-4: Deprecation Notices

**Scope**: Mark legacy installers as deprecated.

| File | Action |
|---|---|
| `install/bootstrap.ps1` | Add comment header: `# DEPRECATED — use the TypeScript CLI: npx tsx cli/src/index.ts install …` |
| `install/uninstall.sh` | Add comment header: `# DEPRECATED — use the TypeScript CLI: npx tsx cli/src/index.ts uninstall …` |
| `install/uninstall.ps1` | Add comment header: `# DEPRECATED — use the TypeScript CLI: npx tsx cli/src/index.ts uninstall …` |
| `install/bashrc_snippet.sh` | Update alias to point at `npx tsx cli/src/index.ts` instead of legacy `bootstrap.sh` |
| `install/powershell_profile_snippet.ps1` | Same — update alias to TS CLI |

Note: `install/bootstrap.sh` is already replaced by the 80-line thin entrypoint. `install/bootstrap-legacy.sh` is the preserved reference — needs no deprecation notice (it's explicitly legacy).

**Acceptance criteria**:
- Every legacy installer script has a deprecation comment as its first non-shebang line
- Shell profile snippets delegate to the TS CLI
- `install/bootstrap.sh` thin entrypoint is the canonical entrypoint (no change needed)

**Risks**: Low. Comment-only changes.

---

### Phase Budget & Sequencing

| Phase | Lines | Risk | Depends on |
|---|---|---|---|
| 6C-1 (lint) | ~80 | Low | — |
| 6C-2 (integration) | ~60 | Medium | 6C-1 (lint-fixed code) |
| 6C-3 (docs) | ~40 | Low | — |
| 6C-4 (deprecation) | ~20 | Low | — |

**Total**: ~200 lines across 10 files. All phases independent except 6C-2 depends on 6C-1 for lint-clean comparison baseline.

### Validation Strategy

| Phase | Validation |
|---|---|
| 6C-1 | `make check-node` exits 0 |
| 6C-2 | `cli/tests/integration/run.sh` exits 0 for all 4 combos |
| 6C-3 | Manual review of README, architecture.md, AGENTS.md |
| 6C-4 | `grep DEPRECATED install/*.sh install/*.ps1` finds all files |

### Decisions To Record

None — this is a completion phase. All architectural decisions (TypeScript, Commander, binary compilation) were locked in during Phases 1-5 and B.
