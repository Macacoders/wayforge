---
name: triage
description: Classify pasted errors and logs with context-hygiene questions, then recommend /plan or backlog.
compatibility: opencode
metadata:
  workflow: error-triage
---

# Error / Bug Triage

Use this skill when the user pastes an error, stack trace, crash dump, exception, or log snippet. Its output is a **recommendation** only — it does not invoke other agents or commands.

## Context-hygiene first

Before any investigation, summarize the pasted error into one paragraph:

- **Symptom** — what failed in plain language
- **Suspected area** — the component, file, or operation most likely involved
- **Unknowns** — what you cannot tell from the paste alone

This protects the rest of the conversation from raw stack-trace noise.

## Classification questions

Answer these four questions explicitly:

1. **Is this blocking work right now?** — urgency assessment
2. **Is this a single-task fix or a larger planned change?** — complexity assessment
3. **Would a fix need a regression test?** — risk/quality assessment
4. **Is this worth fixing now, or should it be backlogged?** — priority/ROI assessment

## Recommendation

End with exactly one of:

- `/plan` — for work that needs discovery, planning, or review
- **Backlog / not worth fixing now** — with a one-sentence rationale

## Progressive disclosure

Follow the simplified progressive-disclosure guidance in `base/opencode/agents/references/invariants.md`: load only the pasted error, the current repository context the user provides, and directly relevant files. Do not pull broad logs, architecture, or ADRs unless a blocking fact requires them.
