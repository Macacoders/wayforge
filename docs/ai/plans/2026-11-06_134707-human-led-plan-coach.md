---
status: planned
created: 2026-11-06
task: 0/2
workflow: implement-then-audit
required_gates:
  architect_review: false
  memory_update: true
---

# Human-led plan coach implementation plan

**Goal:** Offer an opt-in primary agent that helps a human implement an approved plan incrementally while the human alone edits product code and retains final authority over direction and Git actions.

**Architecture:** Add a distinct, directly selectable primary role rather than changing `delivery` or the experimental `implementer`. The coach consumes existing approved ordinary plans, guides one human-owned coding increment at a time, checks the resulting diff and bounded validations, and never claims independent delivery acceptance. Its installed capability boundary uses the central agent permission matrix; a recorded exception to ADR-0048 authorizes individually approved Git write actions in this opt-in mode.

**Tech Stack:** OpenCode agent Markdown templates, central YAML agent permissions rendered by the TypeScript CLI, Markdown plans/ADRs, Vitest.

**Risk:** full — new installed primary-agent contract and Git authority/security boundary; multiple deliverables.

**Scope classification:** multi-task (2 tasks)

**Plan acceptance criteria:**
- The human-led mode is opt-in, preserves the existing default and both autonomous workflows, and makes the human the only product-code editor — evidence: source diff of agent, permission, config and documentation surfaces; relevant installer/permission tests.
- A user can work through a normal approved plan incrementally, inspect and verify each human edit, discuss deviations, and resume from evidence without coach-authored delivery acceptance — evidence: human interactive walkthrough against a disposable plan/repo plus agent contract review.
- Branch, commit and push actions require explicit approval for each action; the new authority and its shell-permission limits are recorded before the role can exercise them — evidence: ADR diff, role/permission inspection and human interactive refusal/approval checks.

### Task 1: Record the human-led authority boundary

**Status:** pending
**Experimental status:** in-progress
**Depends on:** none

**Objective:** Establish the durable exception that permits the new opt-in coach to run specifically approved Git write actions without inheriting `delivery` acceptance or product-code-edit authority.

**Context:**
- `docs/ai/decisions/ADR-0048-risk-proportionate-delivery-workflow.md` and `base/opencode/skills/delivery-policy/SKILL.md` — ordinary plan acceptance and commit authority belong to `delivery` today.
- `docs/ai/decisions/ADR-0049-experimental-plan-completion-audit-workflow.md` — a separate experimental implementer has its own marked-plan state and commit exception; do not reuse that state.
- `docs/ai/decisions/ADR-0050-native-tool-first-agent-permissions.md` and `base/opencode/permissions/agents.yml` — shell approval is broad, not a technical guarantee that shell cannot edit files; native `edit: deny` blocks native write/edit tools.
- Pre-plan architect review at revision `8791bf6`: initial commit-authority conflict A1-01; re-review passed after incorporating the user's decision to permit agent-run Git actions only after per-action approval and requiring this recorded exception before use.

**Acceptance criteria:**
- A recorded durable decision explicitly allows a separate human-led coach to execute branch creation, commit and push only after human approval for each specific action, while human alone writes product code — evidence: ADR diff referencing/superseding ADR-0048's otherwise delivery-only commit boundary.
- The decision distinguishes coaching checks and task checkpoints from independent `delivery` acceptance; subsequent delivery must verify under its own rules rather than inherit coached status — evidence: ADR diff against ADR-0048/0049.
- The decision documents the limit of `bash: ask` (prompting does not enforce read-only shell), preserves repository and unrelated-work safety, and does not alter ordinary or experimental workflow authority — evidence: ADR diff and comparison with ADR-0050.

**Constraints:**
- Record only the necessary exception, not a broad rewrite of existing workflows or general authorization for agent commits.
- This decision must precede exercise of the coach's Git authority (Task 2 depends on this task).

**Validations:**
- `agent`: `git diff -- docs/ai/decisions` — expected: narrow, explicit exception and no unrelated ADR changes.

**Proposed commit message:** `docs: define human-led coaching authority`

### Task 2: Ship an opt-in plan coach with safe permissions and a usable walkthrough

**Status:** pending
**Experimental status:** pending
**Depends on:** Task 1

**Objective:** Install a selectable human-led coaching agent with a concrete, incremental task dialogue and evidence checks, and document how users choose it instead of autonomous delivery.

**Context:**
- `base/opencode/agents/{delivery,implementer,troubleshooter}.md` — examples of primary agents; do not repurpose their existing commands or grant `code` dispatch.
- `base/opencode/permissions/agents.yml`, `cli/src/lib/permissions.ts` — each new agent filename must match a central permission entry; the installer renders frontmatter and copies agent templates automatically.
- `cli/tests/unit/permissions.test.ts` — existing exhaustive agent enumeration and role-specific permission/skill assertions; extend only where necessary for the new role. `cli/tests/unit/config-gen.test.ts` covers unchanged default (`planner`).
- `base/opencode/commands/load-plan.md` is owned by `delivery` and describes legacy execution; the coach should load the approved plan directly, without implying `/load-plan` changes agent or adopting experimental status. `docs/ai/README.md` routes plan lookup; `README.md` and `docs/ai/architecture.md` describe current opt-in topology and should explain the alternative user-facing path.
- `base/AGENTS.md` is a reusable generic template; `.opencode/**` and `opencode.jsonc` are generated, not source.

**Acceptance criteria:**
- A directly selectable primary coach is installed with a matching permission entry and remains opt-in; `planner` stays the default, and existing agent/command behavior remains unchanged — evidence: template/permission/config diff, `npx vitest run cli/tests/unit/permissions.test.ts cli/tests/unit/config-gen.test.ts`, and installer dry-run output.
- The role contract loads an approved ordinary plan, respects task dependencies and current evidence, offers one manageable human-owned coding increment with concrete repository locations and explanations, waits for human edits, reviews `git diff` and relevant bounded validations, then communicates criterion evidence and next choices without silently editing product code, delegating implementation, claiming independent acceptance, or auto-advancing on a passing check — evidence: agent contract diff and human walkthrough of at least one task with feedback/rework.
- The role allows discussion of alternatives and explicit human decisions before changing approved scope/direction, keeps checkpoints understandable across pauses without inventing or rewriting delivery task status, and routes unresolved material decisions to the human — evidence: agent contract diff and human walkthrough of a deviation/resumption.
- Native product-edit tools and subagent dispatch are denied; shell requires approval, is limited by role instructions to inspection, safe non-interactive validation and individually approved Git actions; human-owned validations are only proposed. Branch, commit and push require explicit consent for the specific action and protection of unrelated work — evidence: rendered permission assertions and human check that the role asks before each Git action (including after a prior approved action).
- User documentation clearly differentiates selecting the coach from `/deliver-plan` and experimental implement-then-audit, explains that checks are coaching evidence rather than delivery acceptance, and states how to start/resume without introducing a new plan marker or command — evidence: README and architecture diff.

**Constraints:**
- Human is sole product-code author; no new slash command, orchestrator, plan format, persistent execution store, or default-agent change for this first version.
- Permission prompts alone are not consent: require explicit conversation approval for each Git write, including branch creation, staging/commit and push; never treat approval for one action as blanket permission.
- Do not run supervised, interactive or external-infrastructure validations on the user's behalf. Never stage unrelated work or secrets. No mutation of ordinary plan state by the coach; do not cross the repository boundary.
- Prefer existing role/template/permission rendering patterns and targeted tests over new infrastructure.

**Validations:**
- `agent`: `npx vitest run cli/tests/unit/permissions.test.ts cli/tests/unit/config-gen.test.ts` — expected: passes, including new coach permission invariants and unchanged default.
- `agent`: `make check` — expected: existing repository QA passes.
- `human`: Run an interactive session with a disposable approved ordinary plan in a safe test repository; implement an increment, request review and a course correction, pause/resume, and decline then approve individual branch/commit/push actions (do not push to a real remote during this check) — expected: role guides and verifies but never writes product code or performs a Git write without that action's approval.

**Proposed commit message:** `feat: add opt-in human-led plan coach`

## Implementation amendments

- **2026-11-06 — plan adoption.** The ordinary plan was eligible for the
  implement-then-audit experiment: frontmatter was `status: planned`,
  `task: 0/2`, and both legacy task statuses were pending. Added
  `workflow: implement-then-audit` and experimental task statuses without
  changing legacy delivery state. Affected tasks: 1 and 2. Validation impact:
  execution follows `implementation-quality`; the plan will receive an
  execution changelog and one final audit rather than legacy task acceptance.
