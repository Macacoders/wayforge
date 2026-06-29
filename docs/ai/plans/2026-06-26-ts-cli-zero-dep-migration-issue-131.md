# Plan: TypeScript CLI Migration with Zero-Dep Binary Distribution

**Created**: 2026-06-26
**Status**: Approved
**Related**: Issue #131, supersedes `2026-06-22-node-cli-installer-migration.md`

## Goal

Replace the dual-platform shell installer surface (~4,800 lines of Bash + PowerShell across 12 files) with a single cross-platform TypeScript codebase. Distribute via a `deno compile` standalone binary with a thin shell entrypoint, preserving the zero-dependency "just run `./install/bootstrap.sh`" experience for end users.

## Questions

Resolved: `deno compile` chosen over `bun build --compile` — deno 2.8.3 is already installed.

## Assumptions

- `deno 2.8.3` available for compilation (already confirmed)
- Node.js 18+ and `tsx` remain dev-only tooling (already in `package.json`)
- Existing shell installers kept functional during transition, deprecated after binary is stable
- Profile snippets (`bashrc_snippet.sh`, `powershell_profile_snippet.ps1`) remain shell scripts; only their delegation targets change
- `--agent-preset` is not ported (already removed per ADR-0015)
- No npm publish at this stage (local tool within this repo)

## Scope Classification

Size: **Multi-phase** — porting ~4,800 lines of shell logic plus binary compilation infrastructure
Phase budget: **5 phases**
Phase budget rationale: The library core (Phases 1–2) must be right before command wiring (Phases 3–4) can work. Binary compilation + shell entrypoint (Phase 5) is a distinct deliverable that changes the distribution model. Merging phases would produce unreviewable 1,500+ line diffs with interleaved concerns.
Quick delivery eligible: No.
Split required: No (5 phases within 6-phase ceiling, no confirmation needed).

## Architecture Notes

### Current surface to port

| File | Lines | Role |
|---|---|---|
| `install/bootstrap.sh` | 934 | Main bash installer |
| `install/bootstrap.ps1` | 897 | PowerShell equivalent |
| `install/bootstrap-interactive.sh` | 270 | Interactive bash wrapper |
| `install/bootstrap-interactive.ps1` | 273 | Interactive PowerShell wrapper |
| `install/uninstall.sh` | 235 | Bash uninstaller |
| `install/uninstall.ps1` | 164 | PowerShell uninstaller |
| `install/lib/managed_sync.sh` | 801 | Bash managed sync library |
| `install/lib/managed_sync.ps1` | 786 | PowerShell managed sync library |
| `install/bashrc_snippet.sh` | 76 | Shell alias snippet |
| `install/powershell_profile_snippet.ps1` | 124 | PowerShell alias snippet |
| `scripts/release.sh` | 138 | Bash release tool |
| `scripts/release.ps1` | 123 | PowerShell release tool |

### Target structure

```
cli/                          # New TypeScript CLI root
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entrypoint
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
│   │   ├── ref.ts            # Git clone from --ref
│   │   └── git.ts            # Git operations wrapper
│   └── types.ts              # Shared TypeScript types
├── tests/
│   ├── unit/
│   │   ├── manifest.test.ts
│   │   ├── tracking.test.ts
│   │   ├── config-gen.test.ts
│   │   └── providers.test.ts
│   ├── integration/
│   │   ├── install-diff.sh
│   │   └── run-all.sh
│   └── fixtures/             # Known-good bash output files
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

### Zero-dep distribution model

```
End user runs:
  ./install/bootstrap.sh --repo /path --providers openai

Shell entrypoint (thin shim):
  1. Check for cached binary (~/.ai-config/bin/ai-config-installer)
  2. If missing: download from GitHub Releases (curl/wget)
  3. If download fails: npx tsx cli/src/index.ts (if Node.js available)
  4. Exec binary with all original arguments forwarded
  5. Error if no path available: "No supported runtime found."
```

## Phases

### Phase 1: Project scaffold + core library

**Scope**: Set up the `cli/` TypeScript project, CLI entrypoint with argument parsing, and core library modules: file I/O helpers (dry-run aware), managed manifest lifecycle, project tracking (`installed-projects.json`). No installer commands implemented — just the library foundation with unit tests.

**Acceptance criteria**:
- `cli/package.json` with existing dev deps (typescript, tsx, vitest, @types/node)
- `cli/tsconfig.json` with strict mode, Node 18+ target
- CLI entrypoint parses all flags: `--repo`, `--providers`, `--model`, `--small-model`, `--runtime`, `--ref`, `--dry-run`, `--force`, `--gh-app-client-id`
- `node cli/dist/index.js install --help` prints usage matching `install/bootstrap.sh --help`
- `node cli/dist/index.js uninstall --help` and `interactive --help` print usage
- `cli/src/lib/files.ts` — dry-run-aware mkdir/rm/ln/cp/write with byte-identical behavior to `managed_sync.sh` run_* functions
- `cli/src/lib/manifest.ts` — `init_managed_manifest`, `add_managed_path`, `read_managed_manifest`, `finalize_managed_manifest` produce byte-identical `.ai-config-managed` output
- `cli/src/lib/tracking.ts` — create/append `installed-projects.json` with duplicate detection matching bash behavior
- Unit tests for manifest I/O and tracking file append achieving ≥90% coverage on library code
- `tsc --noEmit` passes for `cli/`

**Risks**: Low. Pure library, no behavioral change. JSON formatting must match bash output byte-for-byte — this is the main precision challenge.

**Files created**:
- `cli/package.json`
- `cli/tsconfig.json`
- `cli/src/index.ts` (CLI entrypoint)
- `cli/src/types.ts`
- `cli/src/lib/files.ts`
- `cli/src/lib/manifest.ts`
- `cli/src/lib/tracking.ts`
- `cli/src/commands/install.ts` (stub with --help)
- `cli/src/commands/uninstall.ts` (stub with --help)
- `cli/src/commands/interactive.ts` (stub with --help)
- `cli/tests/unit/manifest.test.ts`
- `cli/tests/unit/tracking.test.ts`

---

### Phase 2: Config generation

**Scope**: Port the `opencode.jsonc` / `kilo.jsonc` generation logic — provider block assembly from fragment files, agent block selection per provider combination, model selection per agent role, override support. Unit tests comparing against known-good bash output for all provider × runtime combinations.

**Acceptance criteria**:
- `cli/src/lib/providers.ts` — provider validation, deduplication, model selection (planner/research/code/quickcode/taskanalyst models per provider)
- `cli/src/lib/config-gen.ts` — generates complete `opencode.jsonc` and `kilo.jsonc` content from provider selection + model overrides
- Generated JSON is byte-identical to bash output for all provider combinations:
  - `free-tier` (opencode only)
  - `openai`, `github-copilot`, `laberit`, `opencode-go` (opencode + kilocode)
  - `openai,github-copilot`, `openai,laberit`, `openai,github-copilot,laberit`
- `--model` and `--small-model` overrides reflected in generated config
- Agent block selection matches bash logic: balanced preset for single-provider, openai+copilot combo uses balanced-openai-github-copilot
- `enabled_providers` array excludes `free-tier`
- Unit tests: compare generated JSON against bash-generated reference files for each provider × runtime combination
- `tsc --noEmit` passes

**Risks**: Medium. JSON assembly is fragile — trailing commas, whitespace, provider block ordering, and agent block selection must match exactly. The bash does manual string concatenation; TypeScript will construct objects and serialize, requiring careful whitespace and ordering control.

**Files created**:
- `cli/src/lib/providers.ts`
- `cli/src/lib/config-gen.ts`
- `cli/tests/unit/config-gen.test.ts`
- `cli/tests/unit/providers.test.ts`
- `cli/tests/fixtures/` (known-good bash output files)

---

### Phase 3: Install command

**Scope**: Wire library code from Phases 1–2 into a feature-complete `install` command covering fresh install, manifest-aware refresh, `--force` regeneration, `--dry-run` preview, `--ref` git-fetch installs, path rewriting, permission injection, GitHub App Client ID setup, and reinstall preservation logic.

**Acceptance criteria**:
- `node cli/dist/index.js install --repo /tmp/test-repo --providers openai` produces an `.opencode/` tree byte-identical to `./install/bootstrap.sh --repo /tmp/test-repo --providers openai`
- `node cli/dist/index.js install --repo /tmp/test-repo --runtime kilocode --providers github-copilot` generates `kilo.jsonc` with correct schema URL
- Reinstall without `--force`: refreshes agents/commands/skills/plugins but preserves `AGENTS.md` and runtime config
- Reinstall with `--force`: regenerates everything including `AGENTS.md` and runtime config
- `--dry-run` logs all planned operations without creating or modifying any files
- `--ref v0.1.0` clones ai-config at specified tag and installs from it; temp directory cleaned up
- `--gh-app-client-id Iv1...` writes `.gh-config/app.yml`
- Agent files have `base/opencode/` paths rewritten to `.opencode/`
- Permission injection from `agents.yml` into agent markdown frontmatter matches bash output
- Integration test: shell script that installs to a temp repo with both Node CLI and bash installer, `diff -r` shows no differences for `free-tier`, `openai`, and `github-copilot` providers
- `tsc --noEmit` passes

**Risks**: Medium-high. This is the integration point. Order-of-operations bugs (manifest written before files synced) could break the managed overlay contract. The `--ref` git clone path must handle cleanup correctly.

**Files created/modified**:
- `cli/src/lib/ref.ts` (git clone from --ref)
- `cli/src/lib/permissions.ts` (YAML frontmatter injection)
- `cli/src/commands/install.ts` (full implementation)
- `cli/tests/integration/install-diff.sh`

---

### Phase 4: Uninstall, interactive mode, shell snippets

**Scope**: Port the remaining installer surface: `uninstall` (manifest-based file removal + tracking cleanup), `interactive` (menu-driven prompts matching `bootstrap-interactive.sh`), and update shell profile snippets to delegate to the Node CLI.

**Acceptance criteria**:
- `node cli/dist/index.js uninstall --repo /tmp/test-repo` removes exactly the same files as `./install/uninstall.sh --repo /tmp/test-repo`
- `node cli/dist/index.js uninstall --dry-run --repo /tmp/test-repo` previews without deleting
- Uninstall cleans up `installed-projects.json` correctly: removes single entry, removes file if last entry, handles both jq and grep fallback paths natively in TS
- `node cli/dist/index.js interactive` presents the same numbered menu flow as `./install/bootstrap-interactive.sh`
- Interactive mode correctly handles: repo path, runtime selection, provider set (with free-tier constrained to opencode), model preset, dry-run, force, GitHub App Client ID
- `install/bashrc_snippet.sh` updated: `ai-setup-repo` and `ai-uninstall-repo` delegate to Node CLI (`node cli/dist/index.js install|uninstall`)
- `install/powershell_profile_snippet.ps1` updated similarly
- `tsc --noEmit` passes

**Risks**: Low. Straightforward ports of well-understood logic. Interactive mode is essentially prompt chains.

**Files created/modified**:
- `cli/src/commands/uninstall.ts` (full implementation)
- `cli/src/commands/interactive.ts` (full implementation)
- `install/bashrc_snippet.sh` (modified — delegate to Node CLI)
- `install/powershell_profile_snippet.ps1` (modified — delegate to Node CLI)

---

### Phase 5: Binary compilation, shell entrypoint, deprecation

**Scope**: Build standalone binaries via `deno compile`, create the thin shell entrypoint that auto-downloads and execs the binary, wire into `make check`, add integration test suite for all provider × runtime combinations, deprecate old shell installers, update documentation.

**Acceptance criteria**:
- `deno compile` produces a standalone binary for linux-x64 (<50MB)
- Shell entrypoint (`install/bootstrap.sh`) detects platform, downloads binary from GitHub Releases (cached after first download), falls back to `npx tsx` if binary unavailable and Node.js present
- `./install/bootstrap.sh --repo /tmp/test-repo --providers free-tier` works on a system with **no Node.js installed** (binary auto-download path)
- Fallback chain verified: cached binary → download from Releases → `npx tsx` → error
- `make check` updated: TypeScript targets include `cli/` (already via `tsconfig.json` include), no regression in existing Bash/PowerShell QA
- Integration test suite: shell script runs both Node CLI and bash installer for all provider × runtime combinations, `diff -r` comparison passes
- Deprecation notice added to top of `install/bootstrap.sh`, `install/bootstrap.ps1`, `install/uninstall.sh`, `install/uninstall.ps1`, `install/lib/managed_sync.sh`, `install/lib/managed_sync.ps1`: `# DEPRECATED: This shell installer will be removed after the TypeScript CLI is stable. Use install/bootstrap.sh (the thin entrypoint that delegates to the compiled binary).`
- Doc updates: `README.md` adds TypeScript CLI section; `docs/ai/architecture.md` notes the new installer component
- Old plan `docs/ai/plans/2026-06-22-node-cli-installer-migration.md` marked as superseded
- `tsc --noEmit` passes, existing `make check` passes

**Risks**: Medium. Binary compilation may expose Deno-vs-Node.js compatibility issues (npm packages, Node.js built-ins). The shell entrypoint's network dependency adds a failure mode. CI updates for cross-platform builds are out of immediate scope but noted as follow-up.

**Files created**:
- `install/bootstrap.sh` (new: thin shell entrypoint — renamed old to `install/bootstrap.sh.bak` or similar during transition)
- `cli/tests/integration/run-all.sh`

**Files modified**:
- `Makefile` (modified — add check-cli target)
- `README.md`, `docs/ai/architecture.md` (document CLI)
- `docs/ai/plans/2026-06-22-node-cli-installer-migration.md` (mark superseded)
- Old shell scripts: add deprecation notice at top

## Validation Strategy

| Phase | Validation |
|---|---|
| 1 | `node cli/dist/index.js install --help`, `tsc --noEmit`, unit tests for manifest + tracking |
| 2 | Unit tests comparing config-gen output against bash reference files for all provider × runtime combinations |
| 3 | Integration test: `diff -r` Node CLI vs bash output for `free-tier`, `openai`, `github-copilot`. Manual smoke tests |
| 4 | `uninstall --dry-run` on test repo, interactive menu smoke test, shell snippet delegation test |
| 5 | `deno compile` binary smoke test, entrypoint download test (simulated), full integration suite, `make check`, `tsc --noEmit` |

## Decisions To Record

| Decision | Outcome |
|---|---|
| Compilation tool | `deno compile` (already installed, 2.8.3) |
| Shell entrypoint design | Thin shim: download cached binary, fallback to `npx tsx` |
| Dev tooling | Node.js + tsx + vitest (existing, unchanged) |
| Old installers fate | Deprecated after Phase 5, removal in follow-up issue |
| Binary distribution | GitHub Releases (per-platform attachments) |
| Superseded plan | `docs/ai/plans/2026-06-22-node-cli-installer-migration.md` |

## Future Work (Out of Scope)

- **Cross-platform CI binary builds**: Build linux/macOS binaries in CI and attach to GitHub Releases automatically
- **Old script removal**: Remove deprecated shell scripts after a deprecation period
- **npm publishing**: Publish CLI to npm for `npx ai-config install` usage
- **`installed-projects.json` UI**: A `list` subcommand showing all installed projects
- **Config diff/drift detection**: Compare installed config against source templates
