# AGENTS.md

## Mission

Use the installed OpenCode workflows to onboard repositories and deliver minimal, reviewed, and documented changes through planned, reviewed task delivery.

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

The `planner` (planning) and `delivery` (implementation pipeline) agents are the two primary entry gates. Planner owns discovery, plan creation, memory, and shared tasks. Delivery owns task handoff to `code`, git-based review, and memory close-out. See the installed planner and delivery agents for the canonical rulesets.

When pasting an error or log (stack trace, crash dump, exception), prefix with `/triage` so the triage skill loads before any investigation.

Planner enforces a ponytail reuse-first discipline. Use `/ponytail-help` in an installed repo to see available commands and the 7-rung ladder. To disable: `/ponytail off`.
