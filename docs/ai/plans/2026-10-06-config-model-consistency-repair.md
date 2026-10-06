---
status: completed
created: 2026-10-06
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: true
---

# Config model consistency repair plan

## Goal

Fix the reviewed config regressions in the current uncommitted provider/agent model updates so generated `opencode.jsonc` / `kilo.jsonc` configs are syntactically valid, reference declared/enabled providers consistently, and tests reflect the intended new default models.

## Questions

Resolved by user:

1. OpenAI defaults should move to the new OpenAI models.
2. OpenCode Go defaults should move to the new OpenCode Go models.
3. `muse-spark-1.3-contributor-free` should use:
   - `reasoningEffort: "medium"`
   - `textVerbosity: "low"`

No open questions.

## Assumptions

- Keep the new model direction rather than reverting all hand edits.
- Make the smallest consistency repair set.
- Do not edit generated `.opencode/**` or root `opencode.jsonc`; edit source templates under `base/opencode/**` and CLI source/tests as needed.
- Update tests only for intentionally changed generated defaults/model assignments.
- No new test files are needed; existing config-generation tests are the right validation surface.
- Durable architecture docs may need a small update because default model policy examples currently name old OpenAI/OpenCode Go models.

## Scope Classification

Size: single-phase

Phase budget: 1 phase

Phase budget rationale: The work is one cohesive config-consistency repair: fix malformed fragments, align model IDs across provider blocks/agent blocks/default resolver, and update existing assertions/docs for those intended defaults. Splitting into multiple phases would create intermediate broken generated configs without adding meaningful review boundaries.

Quick delivery eligible: No. Although localized, this touches installer-generated runtime defaults and source templates used by downstream repos, so staged review is safer.

Split required: No.

## Phases

### Phase 1: Repair provider/agent model consistency

Scope:

- Fix malformed provider fragments:
  - `base/opencode/config/providers/opencode-provider-block.jsonc`
  - `base/opencode/config/providers/opencode-go-provider-block.jsonc`
- Fix invalid OpenAI agent provider prefix:
  - `oopenai/gpt-5.6-terra` → `openai/gpt-5.6-terra`
- Align OpenCode Go code-agent model with provider model:
  - likely `opencode-go/glm-5.3-flash`
- Remove the duplicate `muse-spark-1.3-contributor-free` entry and keep the intended medium/low options.
- Update CLI default model resolution in `cli/src/lib/providers.ts` to the new OpenAI and OpenCode Go defaults.
- Update existing unit test expectations in `cli/tests/unit/config-gen.test.ts` to match the intended new generated defaults.
- Update small durable docs only if needed:
  - `docs/ai/architecture.md` default model policy/examples
  - current monthly log, if a continuity note is warranted

Acceptance criteria:

- `opencode-provider-block.jsonc` parses as a valid provider fragment when wrapped in a JSON object.
- `opencode-go-provider-block.jsonc` parses as a valid provider fragment when wrapped in a JSON object.
- Generated configs parse after removing the generated leading comment for at least:
  - `runtime=opencode`, providers `free-tier`
  - `runtime=opencode`, providers `openai`
  - `runtime=opencode`, providers `opencode-go`
  - `runtime=kilocode`, providers `openai`
  - `runtime=kilocode`, providers `opencode-go`
- OpenAI-only agent block references only `openai/...` model IDs.
- OpenCode Go-only agent block references model IDs present in the OpenCode Go provider block.
- CLI default models for OpenAI and OpenCode Go use the new model IDs selected in this task.
- Existing config-generation unit tests pass after expectation updates.
- Diff remains limited to config fragments, provider default resolver/tests, and minimal docs/memory if needed.

Risks:

- New model IDs may not actually be available in all user accounts/providers; the repair ensures internal consistency, not external model availability.
- Changing CLI defaults changes generated runtime behavior for new installs.
- Existing docs/memory may contain old model examples; leaving them stale could confuse future work, but broad historical report updates are out of scope.

## Validation Strategy

Run existing safe validation:

```sh
git diff --check
npx vitest run cli/tests/unit/config-gen.test.ts
```

Add targeted generated-config parse checks, for example with `tsx`, to verify the affected provider/runtime combinations produce syntactically valid JSON after stripping the generated leading comment.

Optional if time permits:

```sh
npx vitest run
```

No new test files are proposed; existing config-generation unit tests should be updated to cover the changed expectations.

## Decisions To Record

- OpenAI installer defaults now use the new OpenAI model set rather than restoring old `gpt-5.5` / `gpt-5.4-mini` entries.
- OpenCode Go installer defaults now use the new OpenCode Go model set rather than restoring old `deepseek-v4-pro` / `deepseek-v4-flash` entries.
- `muse-spark-1.3-contributor-free` has a single provider entry with `reasoningEffort: "medium"` and `textVerbosity: "low"`.
- Agent model IDs must match enabled/configured provider prefixes and declared provider-block model keys.

## Implementation Handoff Note

Repository root: `/home/pabloben/dev/ai-config`

Use `base/opencode/**` as source of truth; do not edit generated `.opencode/**` or root `opencode.jsonc`.
