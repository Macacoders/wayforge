# AGENTS.md

## Mission

Use the installed OpenCode workflows to onboard repositories and deliver minimal, reviewed, and documented changes. Staged delivery is the default conservative path; quick delivery handles clear, small, low-risk tasks via `/quick` or proactive planner suggestion.

## AI Memory Index

This file is the practical entrypoint for AI agents working in this repository. For durable memory (architecture, decisions, approved plans, and logs), see `docs/ai/README.md`.

Treat `docs/ai/README.md` as a tiny router. Do not load all memory files by default; use `/memory` (planner) or `memory-maintenance` for low-token lookup/freshness/update routing.

## Repository Guidance

The sections below contain repository-specific guidance. `/onboard-repo` and `research` fill these values during onboarding.

### Project Overview

[FILL IN: One sentence. What does this repository do? Who are the users? Link to README.md.]

### Build/Test Commands

[FILL IN: Build, test, lint, and run commands. Link to README.md or Makefile for details.]

### Key Conventions & Constraints

[FILL IN: 2-4 rules that directly affect agent behavior — e.g., never commit .env, always dry-run first, use conventional commits, required PR approvals. Skip anything already in README.md.]

## Workflow & Engineering Rules

The `planner` agent is the single source of truth for workflow rules, progressive disclosure, repository boundary, engineering rules, validation rules, and definition of done. These are runtime invariants enforced by planner at plan, handoff, and review time. Agent files carry their own Repository Boundary section for safety. See the installed planner agent for the canonical ruleset.
