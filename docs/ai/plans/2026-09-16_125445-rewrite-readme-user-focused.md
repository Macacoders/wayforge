---
status: completed
created: 2026-09-16
task: 1/1
required_gates:
  architect_review: false
  memory_update: false
---

# Rewrite root README.md to be user-focused with workflow flowcharts

**Goal:** Rewrite the root `README.md` (269 lines) into a user-focused document under 150 lines (hard cap) that leads with install/usage, explains the four core workflows as mermaid flowcharts, and carries a contributing section with a merge-protection rule for `base/opencode` workflow markdown.

**Architecture:** Single-file documentation change. The rewritten README drops agent-internal detail (Agents table, Progressive Disclosure, Persistent Memory internals, Installation Model prose, duplicated command tables) and routes deep detail to `docs/ai/README.md`, `AGENTS.md`, and `RELEASE.md`. Four compact `flowchart LR` diagrams document `/intent`, `/plan`, `/issue`, and the delivery loop. A new contributing rule forbids agents from merging `base/opencode` skills/agents/commands markdown to `develop` without a PR.

**Tech Stack:** Markdown + Mermaid (`flowchart`). GitHub renders mermaid natively in README preview.

**Scope classification:** `single-task`

## Tasks

### Task 1: Rewrite README.md as a user-focused guide with flowcharts and the merge-protection rule

**Objective:** Replace the current 269-line README with a user-focused document (≤150 lines) covering install, usage, four mermaid workflow diagrams, and a contributing section containing the `base/opencode` merge-protection rule.

**Files:**
- Modify: `README.md` (full rewrite)

**Step 1: Establish expected behaviour**

The rewritten README must satisfy every acceptance criterion from the approved intent:

1. Total line count ≤ 150, counting blank lines and mermaid code blocks (`wc -l README.md`).
2. User-focused ordering: what the project is → install → use → workflows → contribute.
3. Installation/usage facts preserved: one-shot installer (`curl | sh` / `irm | iex`), `ai-config install --repo <path> --providers openai`, `--dry-run`/`--force`, `uninstall`, self-uninstall, and the `RELEASE.md`/`CHANGELOG.md` links.
4. Four mermaid `flowchart` blocks for intent, plan, issue, and delivery render without syntax errors.
5. A "Contribute" section includes the merge-protection rule (see Step 3 wording).
6. No user-essential install/usage information is lost; agent-internal detail is removed or reduced to pointers.

**Step 2: Add or update validation**

No markdown/mermaid linter exists in this repo (`make check` covers TS/PowerShell only). Validation is:

- `wc -l README.md` → assert output ≤ 150.
- Manual mermaid review: each `flowchart` block uses valid syntax (e.g. `flowchart LR`, nodes `A[...]`/`B{...}`, edges `-->`/`-->|label|`, no unescaped special chars), and no two nodes share a label.
- Link check: `RELEASE.md`, `CHANGELOG.md`, `docs/ai/README.md`, and `AGENTS.md` references point at existing files.

**Step 3: Write minimal implementation**

Rewrite `README.md` using this structure (keep prose tight; the diagrams are the bulk):

```text
# ai-config                              (~2 lines)
intro paragraph: repeatable AI-assisted dev workflow for OpenCode
                                            (2-3 sentences, no agent list)

## Install
  one-shot installer (curl|sh, irm|iex) + prefix paths
  ai-config install --repo <path> --providers openai
  short command table: install / uninstall / interactive
  --dry-run / --force note; self-uninstall one-liner
  link to RELEASE.md + CHANGELOG.md

## Use
  1-2 sentence overview (intent → plan → issue → delivery)
  four mermaid flowchart blocks:

  intent:
    flowchart LR
      A[User request] --> B{Ambiguous?}
      B -- clarify --> C[Ask one question]
      C --> B
      B -- clear --> D[Intent: problem, outcome, criteria]
      D --> E[Approve] --> F[/issue or /plan]

  plan:
    flowchart LR
      A[Approved intent] --> B[Investigate repo gaps]
      B --> C[Task-based plan + acceptance criteria]
      C --> D[Save to docs/ai/plans/]
      D --> E[Approve] --> F[/load-plan]

  issue:
    flowchart LR
      A[Problem or idea] --> B[/issue create]
      B --> C[Formalize intent]
      C --> D[Create GitHub Issue + labels]
      D --> E[status:to-do]
      E --> F[claim → status:doing]

  delivery:
    flowchart LR
      A[Approved plan] --> B[/load-plan]
      B --> C[/implement-task → code]
      C --> D[Pause for manual review]
      D --> E[/review-task git evidence]
      E -- more tasks --> B
      E -- done --> F[/memory]

## Contribute
  edit base/opencode/** (source of truth), never generated .opencode/**
  protection rule (wording below)
  link to RELEASE.md

(optional 1-2 line "memory" pointer to docs/ai/README.md)
```

The merge-protection rule must be written verbatim (or equivalent meaning) as:

> **Protection rule:** Agents must never merge changes to `develop` that touch `base/opencode` markdown files for skills, agents, or commands — `base/opencode/skills/**/SKILL.md`, `base/opencode/agents/**/*.md`, and `base/opencode/commands/**/*.md`. Changes to these files must always be validated through a pull request.

The four diagram node labels above are illustrative; wording may be tightened so the file stays ≤150 lines, but every node/edge must be a real step in the corresponding workflow (cross-check against `base/opencode/commands/*.md` and `docs/ai/architecture.md` "Workflow Boundaries" section).

**Step 4: Run test to verify pass**

Run:
- `wc -l README.md`
- `git diff --stat README.md`

Expected:
- `wc -l` prints a number ≤ 150.
- The diff is limited to `README.md` only.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README user-focused with workflow flowcharts"
```

---

## Notes for the implementer

- **Do not** touch `base/opencode/**`, `docs/ai/**`, `AGENTS.md`, `base/AGENTS.md`, or the installer — this plan only rewrites root `README.md`.
- The plugin README (`base/opencode/plugins/**/README.md`) is **out of scope** for the protection rule; the rule covers skills, agents, and commands only, per the request.
