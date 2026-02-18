# AGENTS.md

## Mission

Deliver correct, minimal, reproducible changes. Prefer small diffs, explicit assumptions, and verifiable outputs.

## Setup checklist

1. Read repository docs and this file first.
2. Detect language/toolchain from existing files.
3. Run the smallest relevant checks before broad test runs.
4. Avoid introducing new dependencies unless required.

## Coding style rules

- Follow existing project conventions over personal preference.
- Keep functions focused and names explicit.
- Avoid broad refactors unless requested.
- Update docs when behavior changes.

## Testing rules

- Start with tests closest to changed code.
- Expand to broader suites only after local checks pass.
- Report exactly what was run and what was not run.

## Definition of done

- Requested behavior is implemented.
- Relevant checks pass or failures are clearly explained.
- Diff is minimal and easy to review.
- Risks, assumptions, and follow-ups are stated.

## Architecture boundaries

- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.

## Routing policy

- Prefer the most specific skill.
- If `metadata.depends_on` exists, apply dependencies first.

## Progressive disclosure

Use core rules here by default. For task-specific procedures, pull from `skills/`:

- Paper workflows: `skills/paper/*`
- Experiments: `skills/experiments/*`
- Software safety: `skills/software/*`
- Networking ops: `skills/networking/*`
