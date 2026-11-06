# ADR-0051: Human-Led Plan Coach Authority

**Date:** 2026-11-06

**Status:** Accepted

## Context

ADR-0048 assigns autonomous plan execution, independent acceptance, and commit
authority to `delivery`; `code` is the product-code writer. ADR-0049 creates a
separate experimental implementer that writes product code and records distinct
experimental state. Neither role serves a person who wants to make every
product change while receiving incremental plan guidance.

The new opt-in coach needs a narrow Git exception to create a branch, commit,
or push work the human authored. ADR-0050 makes shell commands `ask` by
default, but approval prompting is not a technical read-only shell sandbox.
Native `edit: deny` remains the control that prevents native product edits.

## Decision

1. Add a distinct opt-in primary `coach` role. It guides a human through an
   approved ordinary plan one manageable increment at a time; the human alone
   edits product code, tests, configuration, and task documentation.
2. The coach may inspect the repository and run safe, non-interactive,
   agent-owned validation after approval. It may create a branch, stage and
   commit the human's intended changes, or push only after the human explicitly
   approves that exact action. Approval for one Git write never authorizes a
   later branch, staging/commit, or push action.
3. Coaching checkpoints and observed criterion evidence are not ADR-0048
   delivery acceptance. They neither rewrite ordinary plan status nor transfer
   acceptance to `delivery`; any later autonomous delivery follows ADR-0048's
   own dispatch, independent review, and acceptance rules. The coach does not
   adopt ADR-0049 experimental state.
4. The coach has no native edit authority and cannot dispatch implementation
   subagents. `bash: ask` is only a prompt boundary: it cannot technically
   prevent shell-based writes. Role instructions therefore limit shell use to
   inspection, safe non-interactive validation, and the individually approved
   Git actions above. The role stays within the active repository, preserves
   unrelated work, and never stages secrets or unrelated changes.

## Consequences

- ADR-0048's delivery-only commit boundary is narrowly excepted for the
  human-led coach and only for explicitly approved per-action Git writes.
- ADR-0049's implementer, experimental state, and final audit remain separate.
- The coach's effectiveness depends on its contract and user confirmation in
  addition to native edit denial; shell prompting alone is not an enforcement
  mechanism.
- Existing default and autonomous roles retain their current authority.

## Related

- ADR-0048: Risk-Proportionate Delivery with Specialized Worker Roles.
- ADR-0049: Experimental Plan-Completion Audit Workflow.
- ADR-0050: Native-Tool-First Agent Permissions.
