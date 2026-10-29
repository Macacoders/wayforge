---
status: completed
created: 2026-10-28
task: 2/2
required_gates:
  architect_review: false
  memory_update: true
---

# Issue #260: Fix `/memory` command agent frontmatter

**Goal:** `/memory find|check|update` resolves and runs in every install again, a regression test prevents any shipped command from declaring an unresolvable agent, and the `ai-memory` skill documents its script at the path where the installer actually places it.

**Architecture:** Two small template-correctness fixes. Restore `base/commands/memory.md` to a single valid agent (`planner`, matching its documented ownership), and add a read-only Vitest assertion that walks `base/commands/*.md` frontmatter and checks every declared `agent` against `base/agents/*.md` with no comma. Separately, correct the `ai-memory` skill's subcommand paths from `scripts/ai-memory.ts` to the installed `.agents/skills/ai-memory/scripts/ai-memory.ts`, matching `base/commands/init.md` and `base/skills/shared-task/SKILL.md`. No runtime, installer, or plugin code changes.

**Tech Stack:** Markdown command/skill templates, TypeScript, Vitest 4 (root `vitest.config.ts`), Node `fs`/`path`.

**Scope classification:** `multi-task`

**Plan rationale:** Two independently reviewable deliverables: (1) the `/memory` defect plus its bug-class regression guard, and (2) the separate `ai-memory` skill path defect the issue explicitly flagged as a related finding. Two tasks is within the 3-task budget. They are kept separate because task 1 changes behavior-bearing command metadata and adds executable validation, while task 2 is a docs-only path correction with a grep-level check.

## Confirmed planning decisions

1. **`agent: planner` (not omit `agent:`).** Memory is planner-owned in `docs/ai/architecture.md:130`, `docs/ai/README.md:21`, and ADR-0038; the command shipped `agent: planner` before regression commit `e75a868`. Keeping one owner preserves single-authority memory writes.
2. **Include the secondary finding in this plan (user-approved).** Fix `base/skills/ai-memory/SKILL.md` in the same plan/PR instead of deferring it.
3. **Regression test lives at `tests/typescript/base-templates/command-frontmatter.test.ts`.** The root `vitest.config.ts` already includes `tests/typescript/**/*.test.ts`, so no config change is needed. `tests/typescript/gh-issue/e2e.test.ts:7-10` establishes the `REPO_ROOT` pattern to copy.
4. **The test checks declared agents, not an exact agent list.** An omitted `agent:` is valid in OpenCode (active agent executes); a present value must be a single, non-empty id with a matching `base/agents/<id>.md`. A dedicated assertion pins `memory.md` to `planner` so the regression cannot silently reappear as a different single agent.
5. **No ADR.** This restores documented behavior and adds a guard; it changes no public contract, persistence format, auth, or deployment topology.
6. **Do not edit generated output.** `.agents/**`, `.opencode/**`, and `.kilo/**` are gitignored/generated. Edit only `base/**` templates and `tests/**`.
7. **Out of scope (unchanged from the issue):** changing which agent owns memory, redesigning `/memory`, and broader frontmatter/validation work beyond the agent key.

## Repository facts the implementer needs

- `base/commands/memory.md:3` currently reads `agent: planner,delivery`. It is the only command with a comma; the other 14 commands use exactly one of `planner` or `delivery` (`base/commands/*.md`).
- `base/agents/` contains `planner.md`, `delivery.md`, `troubleshooter.md`, `research.md`, `code.md`, `architect.md`.
- OpenCode treats command `agent` as a single string and fails with `Agent not found: "planner,delivery"` (issue report, OpenCode 1.19.2).
- `docs/ai/architecture.md:130` and `docs/ai/README.md:21` say `/memory` is planner-owned; ADR-0038 states memory stays with `planner`.
- Root `vitest.config.ts` includes `tests/typescript/**/*.test.ts` and `cli/tests/**/*.test.ts`. `make check` runs that Vitest suite, then CLI typecheck/ESLint/Prettier, then jscpd.
- Root `tsconfig.json` only includes `base/skills/**/scripts/**/*.ts` and `scripts/**/*.ts`, so a new test file under `tests/typescript/` is executed by Vitest but is not part of `npm run typecheck`. Write it in plain TypeScript consistent with root `.prettierrc` (single quotes, no semicolons, tabs, trailing commas, 80 columns).
- `base/skills/ai-memory/SKILL.md:15` says `scripts/ai-memory.ts`; lines 18-22 invoke `npx tsx scripts/ai-memory.ts ...`. The source script is `base/skills/ai-memory/scripts/ai-memory.ts` and installs to `.agents/skills/ai-memory/scripts/ai-memory.ts` (confirmed by `base/commands/init.md:10-11` and the `.agents/skills/...` convention in `base/skills/shared-task/SKILL.md:13`).
- This checkout is clean on `develop`. Delivery should create `feature/issue-260-memory-command-agent-fix` before committing.
- `rg` is not available in this Windows shell; use `git grep` or `Select-String` in validation commands.

## Tasks

### Task 1: Restore `memory.md` agent and add the command-frontmatter regression test

**Objective:** `/memory` declares a single valid owner again, and a Vitest test fails whenever any shipped command declares a comma-separated or unknown agent.

**Files:**
- Create: `tests/typescript/base-templates/command-frontmatter.test.ts`
- Modify: `base/commands/memory.md:3`
- Validate: `tests/typescript/base-templates/command-frontmatter.test.ts`

**Step 1: Establish expected behaviour**

- Every `base/commands/*.md` frontmatter that declares `agent:` must contain exactly one trimmed, non-empty id with no comma.
- That id must resolve to `base/agents/<id>.md`.
- `base/commands/memory.md` must specifically declare `agent: planner`.
- A missing `agent:` key is allowed (OpenCode falls back to the active agent); an empty `agent:` value is not.

**Step 2: Add or update validation**

Create `tests/typescript/base-templates/command-frontmatter.test.ts`:

- Resolve the repo root like `tests/typescript/gh-issue/e2e.test.ts:7`: `const __dirname = path.dirname(fileURLToPath(import.meta.url)); const REPO_ROOT = path.resolve(__dirname, '../../..')`.
- Read agent ids once from `base/agents/*.md` (basename without `.md`) so failures can list the known set.
- Read every `base/commands/*.md`; extract the frontmatter block between the first two `---` lines, then match `/^agent:\s*(.*)$/m` inside it.
- For each command with an `agent:` key: assert the trimmed value is non-empty, contains no comma, and is present in the agent-id set.
- Assert the newest regression explicitly: read `base/commands/memory.md` and expect its agent value to be `'planner'`.
- Assert the command directory yielded at least one parsed command so a wrong path cannot pass silently.

Run the new test against the current tree first:

`npx vitest run tests/typescript/base-templates/command-frontmatter.test.ts`

Expected: it **fails** on `memory.md` (`planner,delivery` contains a comma and `base/agents/planner,delivery.md` does not exist), proving the guard catches the shipped defect.

**Step 3: Write minimal implementation**

Change `base/commands/memory.md:3`:

```diff
-agent: planner,delivery
+agent: planner
```

Do not change the description, body, or ownership language.

**Step 4: Run test to verify pass**

Run:

`npx vitest run tests/typescript/base-templates/command-frontmatter.test.ts`

Expected: all command-frontmatter assertions pass; `memory.md` reports `planner`.

Then run the full gate (use the direct fallback if `make` is unavailable on the host):

`make check`

or, equivalently, `npx vitest run` followed by `cd cli && npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`.

Expected: full suite green, no lint/format/type errors.

**Step 5: Commit**

`git add base/commands/memory.md tests/typescript/base-templates/command-frontmatter.test.ts`

`git commit -m "fix: restore /memory command agent and guard command frontmatter (Issue #260)"`

### Task 2: Point the `ai-memory` skill at the installed script path

**Objective:** `base/skills/ai-memory/SKILL.md` tells agents to run the script where the installer actually places it, so a consumer repo does not hit module-not-found.

**Files:**
- Modify: `base/skills/ai-memory/SKILL.md:15-22`
- Validate: `base/skills/ai-memory/SKILL.md`

**Step 1: Establish expected behaviour**

- Every executable example in the skill uses `.agents/skills/ai-memory/scripts/ai-memory.ts` (install-root-relative), matching `base/commands/init.md:10-11` and `base/skills/shared-task/SKILL.md:13`.
- No bare `npx tsx scripts/ai-memory.ts` example remains.
- The prose keeps the existing caveat that the script operates on `process.cwd()` and is run from the repository root.

**Step 2: Add or update validation**

Structural check after editing:

`git grep -n "ai-memory.ts" -- base/skills/ai-memory/SKILL.md`

Expected: 6 matches (the line-15 prose reference plus the 5 subcommand lines 18-22), all containing `.agents/skills/ai-memory/scripts/ai-memory.ts`; zero matches for a bare `scripts/ai-memory.ts`.

Behavioural sanity check in this repo (the source script; installed copy is generated):

`npx tsx base/skills/ai-memory/scripts/ai-memory.ts status --json`

Expected: exit 0 with valid JSON describing the present `docs/ai/` skeleton.

**Step 3: Write minimal implementation**

In `base/skills/ai-memory/SKILL.md`:

- Line 15: state that subcommands are provided by `.agents/skills/ai-memory/scripts/ai-memory.ts`.
- Lines 18-22: replace each `scripts/ai-memory.ts` with `.agents/skills/ai-memory/scripts/ai-memory.ts`.
- Leave the `status`, `list-plans`, `list-adrs`, `close-check`, and `init` option lists unchanged.

**Step 4: Run test to verify pass**

Run the `git grep` check from Step 2 plus `npx tsx base/skills/ai-memory/scripts/ai-memory.ts status --json`.

Expected: only the `.agents/...` path appears, and the script prints valid JSON.

**Step 5: Commit**

`git add base/skills/ai-memory/SKILL.md`

`git commit -m "docs: point ai-memory skill at installed script path (Issue #260)"`

## Validation ownership

| Validation | Owner | Command / procedure | Expected |
| --- | --- | --- | --- |
| Command-frontmatter regression test (pre-fix red, post-fix green) | agent | `npx vitest run tests/typescript/base-templates/command-frontmatter.test.ts` | Fails on the old `planner,delivery`; passes after the one-line fix |
| Full repository gate | agent | `make check` (or `npx vitest run` + `cd cli && npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`) | All checks pass |
| Skill path structural check | agent | `git grep -n "ai-memory.ts" -- base/skills/ai-memory/SKILL.md` | Only `.agents/skills/ai-memory/scripts/ai-memory.ts` occurrences |
| `ai-memory` script smoke | agent | `npx tsx base/skills/ai-memory/scripts/ai-memory.ts status --json` | Exit 0, valid JSON |
| Fresh-install `/memory` smoke | human | Install wayforge into a scratch repo (`npx tsx cli/src/index.ts install --repo <scratch> --providers openai`), then run `/memory find docs`, `/memory check`, and `/memory update <summary>` under OpenCode 1.19.x | No `Agent not found: "planner,delivery"`; each command executes under `planner` |
| Installed skill path smoke (optional) | human | In a scratch install, run `npx tsx .agents/skills/ai-memory/scripts/ai-memory.ts status` from the repo root | Exit 0, valid JSON (proves the corrected documented path resolves after install) |

## Closeout

- Set plan `status: completed` and `task: 2/2` after both tasks are reviewed.
- `memory_update: true`: append a `docs/ai/logs/2026-10.md` entry recording the defect, the restored `agent: planner`, the new regression test, and the corrected skill path.
- `architect_review: false`: no architectural boundary is touched. If review discovers the command-ownership decision is being reopened, stop and escalate rather than widening this plan.
