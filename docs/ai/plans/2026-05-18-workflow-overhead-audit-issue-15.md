# Workflow Overhead Audit And Mitigation Proposal (Issue #15)

Date: 2026-05-18  
Scope: Written audit/proposal only (no behavior changes)

## Implementation Note (Slice A)

Slice A was implemented in source-of-truth files under `base/opencode/**`:

- Expanded planner safe bash allowlist for documented non-destructive repo/review commands (`git rev-parse*`, `git remote get-url*`, `git branch*`, `git show*`, `git ls-files*`).
- Explicitly allowed planner shared-task helper invocations (`.opencode/skills/shared-task/scripts/gh-issue*` and `.opencode/skills/shared-task/scripts/gh-issue.ps1*`).
- Updated planner, `/newtask`, and `/tasks` guidance to make root/repo discovery session-aware: establish once, reuse in-session, and re-discover only when invalidated by explicit cwd/repository changes or conflicting validation evidence.

Potential follow-up remains unchanged: evaluate a shared/imported allowlist mechanism to reduce duplication across agents while preserving safety defaults.

## Implementation Note (Phase 1: Centralized Permission Source)

Phase 1 introduces a centralized ai-config-owned permission source at:

- `base/opencode/permissions/agents.yml`

This file is a source-of-truth for future bootstrap rendering only. It is **not** an OpenCode runtime import feature.

Precedence notes recorded for follow-up phases:

- OpenCode does not natively import permission fragments from secondary files.
- Agent-specific permissions override top-level `opencode.jsonc` permissions for that agent.
- Within a permission map, the last matching rule wins.
- Therefore, centralized permission data must be rendered into runtime-consumed files during bootstrap in a later phase.

## Implementation Note (Phase 2: Bootstrap Permission Rendering)

Phase 2 updates installer bootstrap scripts to render centralized agent permissions from:

- `base/opencode/permissions/agents.yml`

into installed target agent markdown frontmatter under `.opencode/agents/*.md` during managed agent-tree sync. Rendering is intentionally shape-constrained to the current `agents -> agent -> permission` YAML structure and uses no external parser dependencies.

Behavior notes:

- Existing source `base/opencode/agents/*.md` permission blocks remain in place for now (Phase 3 handles source cleanup).
- Dry-run mode reports intended permission-render writes and does not modify target files.
- Force/unmanaged protections are preserved: permission rendering runs only when the managed agent tree is copied/refreshed (or would be copied in dry-run), and skipped destinations are not overwritten.

## Implementation Note (Phase 3: Source Permission Cleanup + Validation)

Phase 3 removed duplicated source `permission:` frontmatter blocks from:

- `base/opencode/agents/planner.md`
- `base/opencode/agents/research.md`
- `base/opencode/agents/code.md`
- `base/opencode/agents/quickcode.md`
- `base/opencode/agents/test.md`
- `base/opencode/agents/taskanalyst.md`

Validation summary:

- Bash bootstrap validation passed against temporary output under `/tmp/opencode`.
- Generated target agent files still include expected `permission:` blocks rendered from centralized `base/opencode/permissions/agents.yml` (verified for representative agents including `planner`, `quickcode`, `code`, and `taskanalyst`).
- Source `base/opencode/agents/*.md` files no longer contain `permission:` blocks.
- Repository local generated `.opencode/**` output was not modified.
- PowerShell bootstrap parity validation remains manual/pending as appropriate for environment availability.

## Goal

Identify avoidable workflow overhead across `/plan`, staged phase implementation/review, `/quick`, `/newtask`, and `/tasks`, and propose low-risk implementation slices that preserve existing safety decisions.

## Confirmed Guardrails (Preserved)

- `planner` remains orchestrator and reviewer.
- Implementation stays delegated to `code`/`quickcode`.
- `test` is not invoked by default.
- `/newtask` always invokes `taskanalyst`.
- One `code` session per approved phase; one `quickcode` session per approved quick task.
- Repository boundary remains enforced.
- `git log` remains required where change/review validation calls for it.
- Planner safe bash allowlist may be expanded.
- Shared-task helper invocations should be allowed for planner.
- Investigate allowlist import/sharing from secondary file later (recommendation only; not implemented here).

---

## 1) Current Mandatory vs Conditional Invocation Map

### `/plan` (staged-delivery entry)

- Command routes to `planner` (`base/opencode/commands/plan.md`).
- Mandatory in instructions:
  - Establish repository root and keep work inside boundary.
  - Lightweight research and progressive disclosure.
  - Phase-economy classification before phases.
- Conditional:
  - `research` only when docs/ai memory is missing/stale or onboarding needed (`base/opencode/agents/planner.md`, `base/opencode/skills/staged-delivery/SKILL.md`).
  - `code` only after plan approval.
  - `test` only when explicitly justified/authorized.

### Staged phase implementation/review

- Mandatory:
  - Exactly one `code` subagent per approved phase (`base/opencode/agents/planner.md`, staged skill).
  - `code` pauses after each atomic stage (`base/opencode/agents/code.md`).
  - Planner review with git evidence (`git status`, `git diff`, and workflow-level `git log` expectation) before reporting (`base/opencode/agents/planner.md`, architecture invariants).
- Conditional:
  - `test` subagent only for concrete uncovered risk/explicit approval.

### `/quick` (quick-delivery entry)

- Command routes to `planner` (`base/opencode/commands/quick.md`).
- Mandatory:
  - Eligibility classification.
  - If eligible, one `quickcode` invocation with compact handoff.
  - Planner review of quick result with git evidence.
- Conditional:
  - Fall back to staged delivery when eligibility fails.
  - `git log` check is “as needed” in planner quick-review section, but overall review policy still expects log evidence where applicable.

### `/newtask`

- Command routes to `planner` (`base/opencode/commands/newtask.md`).
- Mandatory:
  - Root boundary setup.
  - Workflow-reference check (`docs/ai/backlog/README.md` else shared-task skill fallback).
  - Invoke `taskanalyst`.
  - Duplicate check in open issues.
  - Label existence verification before creation.
  - Issue creation + minimum labels + report URL.
- Conditional:
  - Ask one clarifying question if required fields missing or likely duplicate.
  - Helper fallback from `.opencode/.../gh-issue` to plain `gh issue` prelude.

### `/tasks`

- Command routes to `planner` (`base/opencode/commands/tasks.md`).
- Mandatory:
  - Use action contract (`list|claim|release|close`).
  - Status-label semantics.
  - Use shared-task helper when available; otherwise plain `gh issue` prelude.
  - Stop/report if required labels are missing.
- Conditional:
  - Operation-specific checks (assignee/status checks before claim, blocked-path handling on release, close criteria checks, etc.).

---

## 2) Overhead Findings By Category

### A) Repeated safe shell prompts

Symptoms:
- Planner often must ask to run routine safe discovery/review commands because planner bash allowlist is very narrow (`git status*`, `git diff*`, `git log*` only).

Likely sources:
- `base/opencode/agents/planner.md` frontmatter permissions.
- Installed runtime inherits planner permissions from source agent files (installer copies source trees; model mapping in `install/bootstrap.sh` / `.ps1` does not broaden planner command allowlist).

Impact:
- Friction during root discovery, issue-helper checks, and routine gh/git validation in planning/review loops.

### B) Redundant repository/root/remote discovery

Symptoms:
- Multiple command/agent docs independently require establishing root and deriving repo context, causing repeated rediscovery across `/plan`, `/quick`, `/newtask`, `/tasks`, and handoffs.

Likely sources:
- Repeated root-boundary language in:
  - `base/opencode/commands/{plan,quick,newtask}.md`
  - `base/opencode/agents/{planner,research,code,quickcode,test,taskanalyst}.md`
  - `base/opencode/skills/{staged-delivery,quick-delivery,shared-task}/SKILL.md`
- Shared-task fallback prelude repeats remote derivation (`git remote get-url origin`) in both `/newtask` and `/tasks` docs.

Impact:
- Token/context overhead and repeated shell actions despite stable root/repo within a session.

### C) Unnecessary or premature subagent invocation

Current state:
- Major flows are already mostly conditional and conservative.
- Required invocations that must remain:
  - `/newtask` → always `taskanalyst` (confirmed decision).
  - Staged approved phase → one `code`.
  - Quick approved task → one `quickcode`.

Residual overhead risk:
- Overly broad planner instructions can trigger early research/context loading before narrow task confirmation, even when not strictly needed.

Likely sources:
- `base/opencode/agents/planner.md` progressive-disclosure + “do lightweight research before questions” wording.

### D) Overly broad context loading

Symptoms:
- Reference lists and fallback instructions can prompt loading more files than needed for small operations.

Likely sources:
- Planner and command docs that combine workflow policy + operational details in one place:
  - `base/opencode/agents/planner.md`
  - `base/opencode/commands/newtask.md`
  - `base/opencode/commands/tasks.md`
- Shared-task fallback to `.opencode/...` (generated output) when source-of-truth already exists under `base/opencode/**`.

Impact:
- Larger prompt payload and repeated reading of policy text.

### E) Review/validation commands that should be conditional

Current state:
- Good: `test` invocation is explicitly conditional.
- Mixed: quick-review says `git log` “only as needed,” while broader workflow/decision context still expects git-log evidence where applicable.

Likely sources:
- `base/opencode/agents/planner.md` quick-review section vs broader review expectations.
- `docs/ai/architecture.md` invariants and review flow.

Impact:
- Potential ambiguity about when `git log` is mandatory vs conditional by workflow slice.

### F) Handoff instructions causing rediscovery

Symptoms:
- Child briefs repeatedly restate broad constraints and references; planner may rediscover root/context each handoff.

Likely sources:
- Verbose handoff templates in `base/opencode/agents/planner.md`.
- Repeated “establish root” requirements across command docs.

Impact:
- Repeated context tokens and shell checks even when session state is unchanged.

---

## 3) Mitigation Options Grouped By Risk

## Low-risk prompt/docs changes

1. **Planner permission hinting + session cache language**  
   Add explicit instruction to reuse already-confirmed `Repository root:` and derived repo identifier within same session unless state changes.

2. **Normalize mandatory/conditional wording**  
   In planner/command docs, mark root/remote checks as: “mandatory once per session, then reuse unless invalidated.”

3. **Tighten progressive disclosure defaults for shared-task flows**  
   Keep `/newtask` always invoking `taskanalyst`, but reduce pre-handoff context to only request + relevant issue metadata + label requirements.

4. **Clarify git-log requirement boundaries**  
   Keep `git log` required for phase/quick review validation where applicable, but define explicit triggers (e.g., unexpected worktree state, commit provenance checks, or review completion checkpoints).

## Permission allowlist changes (recommended for later implementation)

1. **Expand planner safe bash allowlist** to reduce approval prompts for routine non-destructive operations, especially for shared-task workflows and repo discovery/review, e.g.:
   - `git rev-parse*`, `git remote get-url*`, `git branch*`, `git show*`, `git ls-files*`
   - Shared-task helper invocations:
     - `.opencode/skills/shared-task/scripts/gh-issue*`
     - `.opencode/skills/shared-task/scripts/gh-issue.ps1*`
   - Minimal plain-gh fallback commands used by workflow docs (`gh issue ...`) when helper unavailable.

2. **Preserve safety** by keeping broad wildcard deny/ask defaults and allowing only documented safe patterns.

## Workflow policy changes (medium risk)

1. **Single-source helper prelude policy**  
   Consolidate shared-task helper/prelude policy in one source file and reference it from `/newtask` and `/tasks` to reduce divergence and rediscovery.

2. **Handoff compaction policy for planner**  
   Require compact delta-style handoffs (“what changed since previous handoff”) after first child invocation in the same phase/task.

3. **Investigate shared/imported allowlist file**  
   Evaluate feasibility of importing shared safe-command allowlists from a secondary file for planner and related agents (research/proposal only in later phase).

## Changes to avoid

- Do **not** bypass planner orchestration/review responsibilities.
- Do **not** let planner directly replace `code`/`quickcode` implementation responsibilities.
- Do **not** invoke `test` by default.
- Do **not** remove mandatory `taskanalyst` invocation from `/newtask`.
- Do **not** relax repository boundary rules.
- Do **not** remove `git log` validation entirely.
- Do **not** move source-of-truth from `base/opencode/**` to generated `.opencode/**`.

---

## 4) Source Files Most Likely Driving Overhead

Primary source-of-truth files:
- `base/opencode/agents/planner.md` (permissions, handoff templates, review policy, shared-task workflow).
- `base/opencode/commands/plan.md`
- `base/opencode/commands/quick.md`
- `base/opencode/commands/newtask.md`
- `base/opencode/commands/tasks.md`
- `base/opencode/skills/staged-delivery/SKILL.md`
- `base/opencode/skills/quick-delivery/SKILL.md`
- `base/opencode/skills/shared-task/SKILL.md`

Relevant installer surfaces (model/provider generation + installed output context):
- `install/bootstrap.sh`
- `install/bootstrap.ps1`

Decision/architecture context:
- `docs/ai/architecture.md`
- `docs/ai/decisions/ADR-0001-use-opencode-openai-workflow.md`
- `docs/ai/decisions/ADR-0004-add-quick-delivery-workflow.md`

---

## 5) Minimal Validation Strategy For Later Implementation Phase

For any follow-up implementation phase, keep validation narrow:

1. **Static doc/config consistency check**
   - Verify mandatory vs conditional semantics remain aligned across planner + command + skill files.
2. **Permission regression check**
   - Confirm planner allowlist additions are non-destructive and pattern-scoped.
3. **Workflow smoke checks (manual)**
   - `/plan` dry run: ensure staged path unchanged.
   - `/quick` dry run: ensure one-quickcode contract unchanged.
   - `/newtask` dry run (no issue creation): confirm taskanalyst remains mandatory.
   - `/tasks list` dry run: confirm helper path/fallback guidance works.
4. **Git review invariants**
   - Confirm review instructions still require git status/diff and preserve git-log validation where applicable.

---

## Recommended Next Implementation Slice (Not Implemented Here)

**Slice A (lowest risk, highest friction reduction):**
1. Update `base/opencode/agents/planner.md` to expand planner safe bash allowlist for documented safe repo/gh helper commands.
2. Permit planner invocation of shared-task helper commands explicitly.
3. Make root/repo rediscovery guidance session-aware (“discover once, reuse unless invalidated”) in planner + `/newtask` + `/tasks` command docs.

This slice preserves all confirmed safety decisions while directly reducing repeated approval prompts and rediscovery overhead.
