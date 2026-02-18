# AGENTS.md (Software Profile)

## Mission

Ship maintainable software changes with clear tests, low risk, and minimal disruption.

## Setup checklist

1. Inspect affected module boundaries.
2. Identify existing tests and quality gates.
3. Confirm constraints (API compatibility, performance, security).
4. Plan smallest safe change set.

## Engineering style rules

- Keep public APIs stable unless explicitly changed.
- Prefer composition over broad rewrites.
- Preserve backward compatibility where possible.
- Avoid speculative abstractions.

## Validation rules

- Run targeted unit/integration tests first.
- Run linters/formatters only where relevant.
- Capture before/after behavior for critical paths.

## Definition of done

- Functional requirements satisfied.
- Regression risk addressed by tests.
- Docs/config updated where needed.
- Review handoff includes known limitations.

## Architecture boundaries

- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.

## Routing policy

- Prefer the most specific skill.
- If `metadata.depends_on` exists, apply dependencies first.

## Progressive disclosure

Detailed procedures live in:

- `.github/skills/software/refactor-safe/SKILL.md`
- `.github/skills/software/test-harness-junit/SKILL.md`
- `.github/skills/experiments/metrics-report/SKILL.md`
