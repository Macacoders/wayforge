# ADR-0001: Use OpenCode And OpenAI For AI-Assisted Development

Date: 2026-04-29
Status: Accepted

## Context

The repository previously described a tool-agnostic AI configuration model with generic roles, VS Code Copilot adapters, and broad task skills. The current daily workflow relies on OpenCode and an OpenAI subscription.

## Decision

Use OpenCode as the only supported runtime and OpenAI as the only supported provider.

The installed workflow will use one primary `planner` agent plus specialized `research`, `code`, and `test` subagents.

## Consequences

- Configuration becomes smaller and easier to install per project.
- VS Code Copilot adapters and generic role abstractions are removed.
- Model selection is aligned with OpenAI models exposed by OpenCode after `/connect`.
- Future provider or runtime support must be justified by an explicit need.

## Alternatives Considered

- Keep tool-agnostic roles and adapters: rejected because they add maintenance without current value.
- Keep broad skills for many domains: rejected because the active workflow needs one staged delivery process first.
