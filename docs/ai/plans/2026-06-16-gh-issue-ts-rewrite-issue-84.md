# Issue #84 — Rewrite gh-issue as Single TypeScript Script

## Goal

Replace the duplicated Bash and PowerShell `gh-issue` scripts with one portable TypeScript implementation using the GitHub REST API through native `fetch`.

Keep temporary compatibility wrappers during migration, then remove them after all references and validations are updated.

Drop the `raw` subcommand.

## Scope Classification

| Field                       | Value                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Size**                    | Moderate                                                                                                                                                                                                               |
| **Phase budget**            | 3 phases                                                                                                                                                                                                               |
| **Phase budget rationale**  | Phase 1 introduces the TypeScript implementation, tests, and compatibility layer. Phase 2 migrates all references and validates integration. Phase 3 removes legacy wrappers after successful validation and adoption. |
| **Quick delivery eligible** | No                                                                                                                                                                                                                     |
| **Split required**          | No                                                                                                                                                                                                                     |

## Key Decisions

* Runtime: TypeScript via `tsx`
* Language: TypeScript, no build step
* API: GitHub REST API via native `fetch`
* Auth order:

  1. `GITHUB_TOKEN`
  2. `GH_TOKEN`
  3. `GH_CONFIG_DIR/hosts.yml`
  4. Optional `gh auth token` fallback if `gh` is available
* Add `--json` for agent-friendly structured output
* Add `--dry-run` for mutating operations
* Keep temporary compatibility wrappers during migration
* Remove `raw`
* Preserve current human-readable output format unless `--json` is specified

---

# Phase 1 — TypeScript Implementation, Tests, and Compatibility Wrappers

## Scope

### Toolchain

Create:

* `package.json`
* `tsconfig.json`
* `vitest.config.ts`

Add dev dependencies:

* `tsx`
* `typescript`
* `@types/node`
* `vitest`

### New Script

Create:

```text
base/opencode/skills/shared-task/scripts/gh-issue.ts
```

Implement operations:

* `check`
* `labels-check`
* `list`
* `create`
* `claim`
* `assign`
* `release`
* `close`
* `prclose`

Do not implement:

* `raw`

### Features

Implement:

* `--repo`
* `-R`
* `--json`
* `--dry-run`
* stable exit codes
* stable text output compatible with existing scripts

### Authentication

Implement authentication resolution in the following order:

1. `GITHUB_TOKEN`
2. `GH_TOKEN`
3. `GH_CONFIG_DIR/hosts.yml`
4. Optional `gh auth token` fallback

### Repository Resolution

Support:

* Explicit `--repo`
* Explicit `-R`
* Automatic detection from git `origin` remote

### Compatibility Wrappers

Retain existing entrypoints temporarily:

```text
base/opencode/skills/shared-task/scripts/gh-issue
base/opencode/skills/shared-task/scripts/gh-issue.ps1
```

Both wrappers should delegate to:

```bash
npx tsx gh-issue.ts "$@"
```

(or the PowerShell equivalent)

## Tests

Create:

```text
tests/gh-issue/
```

Cover:

* argument parsing
* auth resolution order
* repository resolution
* all operations
* `--json`
* `--dry-run`
* output compatibility
* exit codes
* expected failures

### Failure Cases

Cover:

* missing token
* invalid repository
* issue not found
* issue already assigned
* issue already closed
* missing labels
* insufficient permissions

Mock GitHub API calls in unit tests.

## Acceptance Criteria

1. `npx vitest run` passes
2. `npx tsx <script> check` succeeds
3. `npx tsx <script> labels-check` succeeds
4. `npx tsx <script> list` preserves current output format
5. `--json` returns valid structured JSON
6. Mutating commands support `--dry-run`
7. Compatibility wrappers function correctly
8. Clear error messages are produced for all expected failure scenarios
9. `raw` is not implemented

---

# Phase 2 — Wiring and Reference Migration

## Scope

Update all references to use the TypeScript implementation.

### Files to Update

```text
base/opencode/permissions/agents.yml
base/opencode/commands/issue.md
base/opencode/skills/shared-task/SKILL.md
docs/ai/architecture.md
docs/ai/backlog/README.md
tests/bash/bootstrap_cli.bats
```

### Permissions

Allow:

```text
gh-issue.ts*
```

Retain legacy allowances during this phase only.

### Documentation

Update documentation to reflect:

* single TypeScript implementation
* GitHub REST API usage
* `tsx` runtime
* deprecation of Bash and PowerShell implementations

## Validation

Run:

```bash
npx vitest run
make check
```

Manual validation:

```bash
npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts check
npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts labels-check
npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts list
```

## Acceptance Criteria

1. New TypeScript script is the documented implementation
2. Commands and skills reference the TypeScript script
3. Permissions allow the TypeScript script
4. Compatibility wrappers continue to function
5. `make check` passes
6. `npx vitest run` passes

---

# Phase 3 — Legacy Removal

## Scope

Delete:

```text
base/opencode/skills/shared-task/scripts/gh-issue
base/opencode/skills/shared-task/scripts/gh-issue.ps1
```

Remove:

* legacy permissions
* legacy documentation
* legacy references

Keep only:

```text
base/opencode/skills/shared-task/scripts/gh-issue.ts
```

## Validation

Search for remaining references:

```bash
grep -R "gh-issue.ps1\|scripts/gh-issue[^.]" .
```

Run:

```bash
npx vitest run
make check
```

Manual validation:

```bash
npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts check
npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts labels-check
npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts list
```

## Acceptance Criteria

1. Bash implementation deleted
2. PowerShell implementation deleted
3. No remaining references to legacy implementations
4. TypeScript implementation is the only supported version
5. `make check` passes
6. `npx vitest run` passes

---

# Output Compatibility Requirement

The TypeScript implementation must preserve the current human-readable output used by existing agents and workflows unless `--json` is explicitly specified.

This allows incremental migration of commands, skills, and agents without requiring simultaneous prompt changes.

## JSON Mode

When `--json` is specified, commands must emit structured machine-readable output suitable for agent workflows.

Example:

```json
{
  "status": "ok",
  "issue": 84,
  "assignedTo": "user"
}
```

## Future Migration Recommendation

Once the TypeScript implementation is stable, agent workflows should gradually migrate to `--json` mode to reduce parsing complexity, improve determinism, and simplify future maintenance.
