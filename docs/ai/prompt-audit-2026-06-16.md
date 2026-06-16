# Prompt Audit — 2026-06-16

## Token Summary

| File | Type | Bytes | Est. Tokens* | Status |
|---|---:|---:|---|
| `AGENTS.md` | AGENTS.md | 9671 | ~2,800 | ⚠️ Soft-max edge |
| `templates/AGENTS.md` | AGENTS.md | 7692 | ~2,200 | OK |
| `base/opencode/agents/planner.md` | Agent | 16037 | ~4,600 | 🔴 Over hard max (4k) |
| `base/opencode/agents/code.md` | Agent | 3094 | ~880 | OK |
| `base/opencode/agents/quickcode.md` | Agent | 3487 | ~1,000 | OK |
| `base/opencode/agents/research.md` | Agent | 4463 | ~1,280 | OK |
| `base/opencode/agents/test.md` | Agent | 3469 | ~990 | OK |
| `base/opencode/agents/taskanalyst.md` | Agent | 2078 | ~590 | OK |
| `base/opencode/commands/issue.md` | Command | 1306 | ~370 | OK |
| `base/opencode/commands/memory.md` | Command | 844 | ~240 | OK |
| `base/opencode/commands/close.md` | Command | 855 | ~240 | OK |
| `base/opencode/commands/review-phase.md` | Command | 803 | ~230 | OK |
| `base/opencode/commands/quick.md` | Command | 993 | ~280 | OK |
| `base/opencode/commands/plan.md` | Command | 972 | ~280 | OK |
| `base/opencode/commands/onboard-repo.md` | Command | 1128 | ~320 | OK |
| `base/opencode/commands/implement-phase.md` | Command | 545 | ~160 | OK |
| `base/opencode/skills/memory-maintenance/SKILL.md` | Skill | 1523 | ~440 | OK |
| `base/opencode/skills/create-skill/SKILL.md` | Skill | 1363 | ~390 | OK |
| `base/opencode/skills/staged-delivery/SKILL.md` | Skill | 2700 | ~770 | OK |
| `base/opencode/skills/shared-task/SKILL.md` | Skill | 1181 | ~340 | OK |
| `base/opencode/skills/quick-delivery/SKILL.md` | Skill | 4413 | ~1,260 | ⚠️ Soft-max edge |

*\*Estimated from byte count using ~3.5 chars/token heuristic (cl100k_base). The `count_tokens` plugin returned 0 for all files — likely a file resolution bug.*

### Generation note

The root `AGENTS.md` is a **generated file** produced by the `onboard-repo` command using `templates/AGENTS.md` as its source template. The root `AGENTS.md` Repository Guidance section (lines 13-60) is the filled-in result of the template's `[FILL IN]` placeholders. This means:

- The root `AGENTS.md` and `templates/AGENTS.md` are expected to share structure (one is the source, the other the output). That's not a duplication bug.
- The real problem is in `templates/AGENTS.md` — the template asks for too much repo-specific detail that should live in `README.md`, not in AGENTS.md.
- The workflow rules duplication is between `templates/AGENTS.md` and `planner.md`. Since the root file is generated from the template, fixing the template fixes all installed repos.

## Main Findings

| Priority | File | Anti-pattern | Why it matters | Fix |
|---|---|---|---|---|
| 🔴HIGH | `agents/planner.md` | God agent; exceeds 4k hard max | Every planner invocation loads 4.6k tokens. Planner orchestrates planning, classification, memory, handoffs, shared tasks, phase review, and quick-delivery review — 7+ distinct roles. 90 lines (lines 160-250) are raw handoff-brief templates. | Split handoff templates into separate `REFERENCE.md` files. Move Quick Delivery Classification (~30 lines) and Phase Economy (~35 lines) logic into the `quick-delivery` and `staged-delivery` skills where they already partially live. |
| 🔴HIGH | `agents/planner.md` | Embedded workflow templates as prose | Six handoff brief templates (Research, Code, Quick Code, Test, Task Analysis) totaling ~90 lines of markdown template blocks. These are schema, not judgment. | Move each template to a reference file under `base/opencode/agents/planner/references/`. Planner loads them only when writing a handoff of that type. Cuts ~90 lines (~1,000 tokens). |
| 🟡MEDIUM | `templates/AGENTS.md` (→ root `AGENTS.md`) | Template asks for too much repo-specific detail | The Repository Guidance section in the template (lines 13-67) has 7 sub-sections with `[FILL IN]` placeholders for project overview, build commands, code style, testing, security, deployment, and PR guidance. When `onboard-repo` fills these in, the generated root `AGENTS.md` becomes a project-doc dumping ground. This is README content, not agent policy. | Trim the template's Repository Guidance section to 3-4 lines pointing to `README.md` for project specifics. Keep only agent-relevant invariants (e.g., "never commit `.env*`"). The `research` agent already proposes AGENTS.md with these sections via `docs/ai/` memory — AGENTS.md doesn't need to duplicate them. |
| 🟡MEDIUM | `skills/quick-delivery/SKILL.md` | Overlaps planner.md; large examples | Workflow steps (lines 33-43), Handoff Contract template (lines 44-63), Quickcode Constraints (lines 65-73), Escalation Conditions (lines 75-84), and Review Expectations (lines 86-94) all duplicate or restate content already in `planner.md` and `agents/quickcode.md`. | Remove duplicate procedural content. Keep only: eligibility criteria (unique to this skill), the entry/exit contract, and a pointer to planner. The quickcode constraints live in `quickcode.md` — don't repeat them here. |
| 🟡MEDIUM | `templates/AGENTS.md` + `planner.md` | Same workflow rules in 2 source files | Workflow, Progressive Disclosure, Repository Boundary, Engineering Rules, Validation Rules, and Definition of Done appear near-identically in both `templates/AGENTS.md` and `planner.md`. Any rule change must be synced in both. Since the root `AGENTS.md` is generated from the template, the template is the real source of the duplication. | The workflow rules should have **one source of truth**. Since `planner` is the agent that enforces these rules at runtime, planner.md should own them. `templates/AGENTS.md` should reference planner with a short summary: "Follow the workflow described in the installed `planner` agent." |
| 🟡MEDIUM | `skills/staged-delivery/SKILL.md` | Hidden agent orchestration | Lines 29-57 describe planning, onboarding, implementation, review+testing, and memory — essentially a condensed copy of planner's responsibilities. The skill SHOULD describe "what to load and when," not re-describe the agent workflow. | Trim to: when to use this skill (triggers), progressive disclosure order, and the staged-delivery contract (phases → code → review → memory). Delete the "how to plan/implement/review" prose — that's planner's job. |
| 🟢LOW | Multiple agents | Duplicate Repository Boundary pattern | `planner.md`, `code.md`, `quickcode.md`, `research.md`, `test.md`, and `taskanalyst.md` each have a 4-7 line "Repository Boundary" section with near-identical rules. | If OpenCode supports agent "shared rules" or an included section, centralize this. Otherwise, low-priority — the repetition is ~200 tokens total across all agents and the rules are critical safety invariants. |
| 🟢LOW | `research.md` | AGENTS.md Guidance is procedural | Lines 95-111 describe an 11-line bulleted procedure for filling in AGENTS.md. This is reference/procedure, not agent judgment. | Move to a `REFERENCE.md` in the research skill directory, or to the `staged-delivery` skill. |

## Refactor Plan

### 1. Immediate cleanup (low-risk, high-impact)

**A. planner.md: Move handoff templates to reference files (~90 lines cut)**

Create `base/opencode/agents/planner/references/` with:
- `research-handoff-template.md`
- `code-handoff-template.md`
- `quickcode-handoff-template.md`
- `test-handoff-template.md`
- `task-analysis-template.md`

Replace each template block in planner.md with a one-liner like:
```
Research handoff format: load `base/opencode/agents/planner/references/research-handoff-template.md`.
```

**B. `templates/AGENTS.md`: Trim the Repository Guidance template (~50 lines cut)**

The current template (lines 13-67) contains 7 sub-sections with `[FILL IN]` placeholders. When `onboard-repo` fills these in, the generated root `AGENTS.md` becomes a project-doc dump. Replace the entire Repository Guidance section with a compact reference:

```markdown
## Repository Guidance

The sections below contain repository-specific guidance. `/onboard-repo` and `research` fill these values during onboarding.

### Project Overview

[FILL IN: One sentence. What does this repository do? Who are the users? Link to README.md.]

### Build/Test Commands

[FILL IN: Build, test, lint, and run commands. Link to README.md or Makefile for details.]

### Key Conventions & Constraints

[FILL IN: 2-4 rules that directly affect agent behavior — e.g., never commit .env, always dry-run first, use conventional commits, required PR approvals. Skip anything already in README.md.]
```

This cuts ~50 lines from the template (and consequently from every generated root `AGENTS.md`). The detailed sections (testing expectations, security, deployment, PR guidance) belong in `README.md` or `docs/ai/` where `research` already proposes them. AGENTS.md should carry only invariants that change agent behavior.

**C. quick-delivery/SKILL.md: Remove duplicate procedural content (~40 lines cut)**

Delete lines 33-43 (Workflow Steps), lines 44-63 (Handoff Contract template — already in planner), lines 65-73 (Quickcode Constraints — already in agents/quickcode.md), lines 75-84 (Escalation Conditions — already in both), and lines 86-94 (Review Expectations — already in planner.md).

Keep only: eligibility criteria (lines 15-25), repository boundary (lines 27-31), and a short pointer like: "planner owns the handoff, quickcode owns the implementation, see planner.md for the full workflow."

### 2. Move to code

**D. planner.md: Move Phase Economy and Quick Delivery Classification logic into skills**

The `staged-delivery` and `quick-delivery` skills should carry the detailed classification and budget rules that are currently in planner.md. Then planner.md just says: "Follow the phase-economy rules in staged-delivery skill" and "Use the quick-delivery eligibility rules in quick-delivery skill."

This would cut ~65 lines from planner.md.

**E. `templates/AGENTS.md` workflow deduplication with planner.md**

The Workflow, Progressive Disclosure, Repository Boundary, Engineering Rules, Validation Rules, and Definition of Done sections in the template are near-identical copies of rules already living in `planner.md`. Since the root `AGENTS.md` is generated from this template, fixing it here fixes all installed repos.

Reduce those sections in `templates/AGENTS.md` to a short indirection:
```markdown
## Workflow

Follow the workflow described in the installed `planner` agent. Key entry points: `/plan` (staged delivery), `/quick` (quick delivery), `/issue` (shared tasks), `/memory` (durable memory). See `docs/ai/README.md` for the durable memory index.
```

The full ruleset remains in `planner.md` as the single source of truth. This is the higher-risk refactor — it changes what every installed AGENTS.md loads on startup and assumes the `planner` agent is always present.

### 3. Split into skills/commands/agents

No new agents/commands needed; the existing structure is sound. The issue is purely about where content lives, not what content exists.

## Suggested Target Structure

Root `AGENTS.md` is generated from `templates/AGENTS.md` by `onboard-repo`, so the template is the edit target.

```
base/opencode/
├── agents/
│   ├── planner.md                  (~2,500 tokens after refactor)
│   ├── planner/
│   │   └── references/
│   │       ├── research-handoff-template.md
│   │       ├── code-handoff-template.md
│   │       ├── quickcode-handoff-template.md
│   │       ├── test-handoff-template.md
│   │       └── task-analysis-template.md
│   ├── code.md                     (~880 tokens, no changes)
│   ├── quickcode.md                (~1,000 tokens, no changes)
│   ├── research.md                 (~1,100 tokens, trim AGENTS.md procedure)
│   ├── test.md                     (~990 tokens, no changes)
│   └── taskanalyst.md              (~590 tokens, no changes)
├── commands/                       (all within limits, no changes)
├── skills/
│   ├── quick-delivery/SKILL.md     (~500 tokens after deduplication)
│   ├── staged-delivery/SKILL.md    (~500 tokens, trim orchestration prose)
│   ├── shared-task/SKILL.md        (fine as-is)
│   ├── memory-maintenance/SKILL.md (fine as-is)
│   └── create-skill/SKILL.md       (fine as-is)
└── templates/
    └── AGENTS.md                   (~1,200 tokens after trimming Repository Guidance + workflow dedup)
```

**Token savings estimate:**
- planner.md: ~4,600 → ~2,500 (save ~2,100)
- templates/AGENTS.md: ~2,200 → ~1,200 (save ~1,000) — also shrinks every generated root AGENTS.md
- quick-delivery/SKILL.md: ~1,260 → ~500 (save ~760)
- staged-delivery/SKILL.md: ~770 → ~500 (save ~270)

**Total savings: ~4,130 tokens across the source files**, with the cascade benefit that every repo installed from this config gets a leaner generated `AGENTS.md`.

## Validation Notes

- **What was validated**: All 21 files read and analyzed against the 4 anti-pattern categories (AGENTS.md, Agent, Skill, Command). Byte counts checked via `wc -c`. Token estimates via byte/3.5 heuristic.
- **What was not validated**: The `count_tokens` tool returned 0 for all files — the estimates above are approximate. Actual cl100k_base token counts may vary ±15%. Would recommend fixing the plugin or running a CLI tokenizer like `gpt-tokenizer` for precise counts before making refactor decisions.
- **Risk**: The refactors proposed are structural (move templates, delete duplicates). They do not change agent behavior, only where content lives. The AGENTS.md workflow dedup (item E) carries the most risk because it changes what every installed repo loads — would flag for staged delivery with careful validation.
