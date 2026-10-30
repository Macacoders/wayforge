---
name: delivery-policy
description: Risk classification, work-order and verification contracts, acceptance, and the loop's stop rule. Use when classifying a request, dispatching or verifying work, or deciding to accept, continue, or stop.
compatibility: opencode
metadata:
  workflow: delivery
  owner: delivery
---

# Delivery Policy

The single owning location for how work enters the workflow, how it is dispatched, how it is
verified, and when an agent stops. `delivery` applies this policy; `planner` may consult it for
classification. Other roles receive the relevant work-order information instead of loading it.

The whole policy rests on one premise: **acceptance criteria are the contract.** Work is finished
when every criterion has evidence; nothing else can be demanded and nothing else may block.

## Risk Classification

Classify before dispatching any work. There are two paths: `direct` and `full`.

Choose `full` (intent, then plan) when any of these is true:

- **Boundary trigger:** public contract or API, CLI/wire format, persistence or file-format change,
  authentication/authorization/secrets/trust boundary, deployment or runtime topology, data model
  or invariants, or a cross-module/internal API other modules depend on.
- Requirements are ambiguous, or a decision belongs to the user (product behaviour, tradeoff,
  authorisation).
- The change spans more than one deliverable, or the blast radius is not visible from a small diff.
- Risk is unknown or uncertain — treat unknown as `full`.

Choose `direct` when all of these are true:

- It is a localized correction: one obvious cause, bounded blast radius.
- No boundary trigger applies.
- The expected behaviour is stated or obvious from the request, and existing validation (or one
  small test) can prove it.

Classification is `delivery`'s judgement and is recorded in one line:
`Risk: direct — <reason>` or `Risk: full — <trigger>`.

Overrides:

- A user may declare a change `direct`. That never crosses a boundary trigger or a hard safety
  boundary (edit/commit authority, independent verification, destructive-action guards). If a
  boundary trigger applies, escalate to `full` and say why.
- `delivery` may reclassify upward at any time. Reclassifying downward after `full` work started
  requires the user's explicit agreement.

## Work Orders

A plan task is a **deliverable**. A work order is the **operation** dispatched to implement or verify
it. `delivery` derives work orders from task state and this policy; it does not invent bespoke
instructions per dispatch.

| Kind                  | Purpose                                                  | Owner       |
| --------------------- | -------------------------------------------------------- | ----------- |
| `implementation`      | Make a criteria list pass                                | `code`      |
| `verification`        | Return pass or fail, per criterion, with evidence        | `reviewer`  |
| `architecture_review` | Decide whether the work contradicts a recorded decision  | `architect` |
| `research`            | Answer one bounded investigation question                | `research`  |

`architecture_review` belongs to planning: `planner` dispatches it before the plan is approved.
`delivery` dispatches it once, and only for a `required_gates.architect_review` the plan declares —
never per task, because two verifiers with different vocabularies on the same diff is how a task
loop starts.

Every work order is one message with these fields:

- **Work order:** id and kind.
- **Plan/task reference:** plan path and task id (omit for direct-path work).
- **Objective:** the single outcome required.
- **Criteria:** the finite, numbered list being satisfied or verified (`C1`, `C2`, …), each with the
  evidence that proves it — a command, a test, a diff fact, or a human-only check.
- **Context:** bounded paths, symbols, decisions, and prior evidence the worker needs.
- **Scope:** the paths and behaviours this work may touch. Everything else is out of scope.
- **Constraints:** invariants, reuse expectation, agent-owned vs human-owned validations.
- **Review target:** revision or diff scope (verification only).
- **Prior round:** the criteria that failed and the evidence returned (re-verification only).
- **Expected result:** the complete, bounded result required from this worker, using the format below
  plus any role-specific fields. Include it in the work order; never tell a worker to load this skill
  to obtain its contract.

Never send implementation steps to a verifier, and never ask a worker to approve its own output.

## Result Format

Workers return:

```md
Work order: <id> (<kind>)
Status: completed | blocked | failed
Summary: <2-3 sentences>
Changed files / artifacts: <paths, or none>
Validation: <commands run and outcome, or "not run — <reason>">
Risks: <bullets, or none>
```

Verifiers return one line per criterion plus their review target:

- `C1 pass — <command output, test name, or diff line that proves it>`
- `C1 fail — <what was expected, what is there, and where>`
- `C1 unverifiable — <the evidence that is missing and who owns it>`
- `Reviewed revision: <git range, sha, or working-tree diff actually inspected>`
- `Outside the criteria: <at most three notes, or none>`

## The Verification Contract

A verification answers one question: **does each criterion hold, and what proves it?** It does not
grade the change, and it does not decide whether the work is good enough. The criteria are the
contract; a criterion is either satisfied or not.

- Produce the evidence yourself (`git diff`, `git show`, the named test or validation command). The
  implementer's report is supporting information, never proof.
- A criterion with no evidence source cannot be satisfied: return it `unverifiable` and name what is
  missing. Missing criteria are a plan defect, not an invitation to invent them.
- Report nothing outside the criteria except up to three `Outside the criteria:` notes. `delivery`
  records those as follow-ups in the plan; they are never dispatched as work.
- Verifiers do not repair, do not propose patches, and do not invoke other subagents.
- Re-verification covers the criteria that failed plus the criteria whose evidence the new diff
  touches. Nothing else.

A later change invalidates the evidence for the criteria it touches; those criteria are verified
again.

## Task and Plan Acceptance

- A task is `accepted` when every criterion has passing evidence and the work is committed (or the
  task produces no commit).
- A phase gate is satisfied when the criteria the plan declares for it have passing evidence.
- The plan is `completed` when every required task is `accepted`, every declared `required_gates`
  entry has evidence, and human-owned validations are reported and confirmed or explicitly waived.
- Recorded follow-ups do not block acceptance and do not reopen a task.

Agents never execute human-owned validations; they report the exact command and expected result.

## The Loop and Its Stop Rule

Dispatch `implementation`, verify, and on a `fail` dispatch the same criteria back. There is no repair
mode and no separate budget: the loop ends when the criteria are satisfied, or when it stops making
progress.

Stop and ask the user when:

- **a criterion fails twice** — the same criterion, two rounds, both rounds' evidence, whether or not
  the code changed between them;
- a round produces no change in evidence for any failing criterion;
- satisfying a criterion would require changing approved scope, the plan, or a recorded decision;
- the work needs a decision that belongs to the user (product behaviour, tradeoff, authorisation);
- a human-owned validation or authorisation is outstanding;
- a safety or permission boundary would be crossed.

The escalation is the evidence, not a summary of it: what was being attempted, which criteria still
fail, the two rounds of evidence side by side, whether the obstacle is the implementation, a missing
dependency, or the approved scope, the decision needed, and the options. Then stop — do not dispatch
another round.

Successful routine task and phase transitions are never approval prompts.

## Plan Readiness and Legacy Plans

Readiness comes from the plan, in this order:

1. If the plan declares per-task `**Status:**` (`pending | in-progress | accepted | blocked`), that is
   authoritative.
2. If it does not — any plan written before ADR-0048 — derive it from the frontmatter
   `task: <n>/<total>` cursor: tasks with an index below `<n>` are `accepted`, the task at `<n>` and
   after are `pending`. With no `task:` field, every task is `pending`.
3. A task with no `**Depends on:**` field depends on the task before it. That is the legacy
   sequential order, not permission to run tasks in parallel.

Executing a legacy plan:

- Backfill `**Status:**` and `**Depends on:**` as each task is dispatched. These are progress
  metadata; task bodies are never rewritten.
- Legacy tasks may carry `**Step 1..5**` instructions, including a commit step. Use the objective,
  files, and acceptance criteria; treat the steps as guidance for `code`, drop any commit
  instruction (you commit), and never send steps to a verifier.
- If a legacy task has no verifiable acceptance criteria, that is a plan defect: stop and ask the
  user. Do not invent criteria.

## Integration and Commit Authority

- Only `delivery` commits and integrates. `code` never commits; `reviewer`, `architect`, and
  `research` never write.
- Order within a task: dispatch implementation → confirm agent-owned validations → verification →
  commit when every criterion passes.
- Direct-path work commits on the same terms.

## Compatibility Notes

Wayforge 1.x carries this policy as prose plus one shared handoff/result template. The planned 2.0
deterministic orchestrator will consume the same terms — `work order`, `kind`, `status`, `criterion`,
`evidence`, `reviewed revision` — as machine-readable contracts. Do not add persistence, queues, or a
scheduler for them in 1.x.
