---
status: in-progress
created: 2026-11-03
task: 1/2
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #275: Rename the `laberit` provider to `openai-compatible`

**Goal:** The installer exposes the same provider behaviour it had under the vendor-specific `laberit` id, but with a neutral `openai-compatible` id, neutral model IDs, and no `laberit` string in the working tree. Models, limits, defaults, agent pins, env-var names, and both-runtime output are unchanged.

**Architecture:** This is a rename, not a redesign. The static fragments under `base/config/providers` and `base/config/agents` stay the source of truth and are renamed with their contents updated only where the provider id, model IDs, or display names appear. `Provider`, `VALID_PROVIDERS`, `resolveDefaultModels`, `FAST_MODELS`, the interactive menu, and fragment lookups change ids only. No install-time model registration, no generated provider block, no `--model` requirement.

**Tech Stack:** TypeScript, Commander, Vitest 4, JSONC config fragments, `cli/src/lib/{providers,config-gen}.ts`.

**Scope classification:** `multi-task`

**Plan rationale:** Task 1 is the mechanical rename across code, fragments, and tests and must land as one reviewable change because every id comparison changes together. Tooling docs, the ADR, changelog, integration test, and log are independent and land second.

## Decisions encoded by this plan

- Provider id: `openai-compatible`. `laberit` is removed; there is no alias.
- Environment variables stay `OPENAI_BASE_URL` and `OPENAI_API_KEY` (unchanged from the previous provider).
- Model IDs are renamed to describe the model, not the vendor:
  - `laberit-ai-preview` → `kimi-k2.6` (display name `Kimi K2.6`, limit 262144 / 16384)
  - `laberit-ai` → `kimi-k2.5` (display name `Kimi K2.5`, limit 131072 / 16384)
  - `laberit-gpt-5.6-luna` → `gpt-5.6-luna` (display name `GPT-5.6-luna`, limit 1000000 / 131072)
  - `laberit-kimi-k2.7-code` → `kimi-k2.7-code` (display name `Kimi K2.7 Code`, limit 262100 / 262100)
- Defaults keep the previous mapping: `model` = `openai-compatible/kimi-k2.6`, `small_model` = `openai-compatible/kimi-k2.5`.
- Agent pins keep the previous mapping: `planner`, `delivery`, `research`, `troubleshooter`, `architect` → `openai-compatible/kimi-k2.6`; `code` → `openai-compatible/kimi-k2.5` with `steps: 16`.
- The `opencode-go,laberit` combo becomes `opencode-go,openai-compatible` and keeps the opencode-go agent block.
- `--model` / `--small-model` remain optional generic overrides as before; the provider is not required to receive model IDs at install time.
- Generated config keeps the existing Kilo-safe shape: `env: ["OPENAI_API_KEY"]` and a literal `${OPENAI_BASE_URL}`; never `{env:}` / `{file:}`.
- Breaking CLI change (provider id and model IDs), but `VERSION` is not touched; the release process owns the bump.
- History rewrite and release-artifact scrubbing remain out of scope and tracked in #284.

## Out of scope

- Install-time model IDs, dynamic provider-block generation, and the `generic-only-agent-block.jsonc` approach from the abandoned redesign.
- Changing the environment-variable names.
- Curated vendor catalogs or model metadata supplied at install time.
- Rewriting git history, tags, or releases (#284).
- Editing dated `docs/ai` plans/logs/ADRs as historical records; only `architecture.md` and a new ADR change.

## Tasks

### Task 1: Rename the provider, fragments, defaults, and agent pins

**Objective:** `openai-compatible` is a valid provider, `laberit` is rejected, the renamed fragments are read by id, defaults and agent pins use the renamed model IDs, and unit tests cover the rename.

**Files:**
- Modify: `cli/src/types.ts`
- Modify: `cli/src/lib/providers.ts`
- Modify: `cli/src/lib/config-gen.ts`
- Modify: `cli/src/commands/interactive.ts`
- Modify: `cli/src/index.ts`
- Rename: `base/config/providers/laberit-provider-block.jsonc` → `base/config/providers/openai-compatible-provider-block.jsonc`
- Rename: `base/config/agents/balanced-laberit-only-agent-block.jsonc` → `base/config/agents/balanced-openai-compatible-only-agent-block.jsonc`
- Rename: `base/config/agents/balanced-opencode-go-laberit-agent-block.jsonc` → `base/config/agents/balanced-opencode-go-openai-compatible-agent-block.jsonc`
- Validate: `cli/tests/unit/config-gen.test.ts`

**Step 1: Establish expected behaviour**

- `Provider` is `'openai' | 'github-copilot' | 'openai-compatible' | 'opencode-go' | 'free-tier'`; `parseProviders` rejects `laberit` and lists `openai-compatible` in the error hint.
- The provider fragment emits:

```jsonc
    "openai-compatible": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OpenAI-compatible",
      "env": ["OPENAI_API_KEY"],
      "options": {
        "baseURL": "${OPENAI_BASE_URL}",
        "headers": {
          "Content-Type": "application/json"
        }
      },
      "models": {
        "kimi-k2.6": { "name": "Kimi K2.6", "limit": { "context": 262144, "output": 16384 } },
        "kimi-k2.5": { "name": "Kimi K2.5", "limit": { "context": 131072, "output": 16384 } },
        "gpt-5.6-luna": { "name": "GPT-5.6-luna", "limit": { "context": 1000000, "output": 131072 } },
        "kimi-k2.7-code": { "name": "Kimi K2.7 Code", "limit": { "context": 262100, "output": 262100 } }
      }
    }
```

- `resolveDefaultModels(['openai-compatible'])` returns `{ model: 'openai-compatible/kimi-k2.6', smallModel: 'openai-compatible/kimi-k2.5' }`.
- `resolveDefaultModels(['opencode-go', 'openai-compatible'])` returns the existing opencode-go defaults.
- `FAST_MODELS['openai-compatible']` is `{ model: 'openai-compatible/kimi-k2.5', smallModel: 'openai-compatible/kimi-k2.5' }`, and `openai-compatible` keeps its previous position in both priority arrays.
- The openai-compatible-only agent block pins `planner`, `delivery`, `research`, `troubleshooter`, `architect` to `openai-compatible/kimi-k2.6` and `code` to `openai-compatible/kimi-k2.5` with `steps: 16`.
- `buildAgentBlockJson(['openai-compatible'], …)` reads the renamed agent block; `['opencode-go', 'openai-compatible']` reads the renamed combo block; all other branches are unchanged.
- The interactive installer offers `openai-compatible` and the renamed combos, and the connection hint says `OPENAI_BASE_URL` / `OPENAI_API_KEY`.
- Installing `--providers openai-compatible` with no `--model` succeeds and produces the defaults above.

**Step 2: Add or update validation**

Update `cli/tests/unit/config-gen.test.ts`:

- `parseProviders`: comma-separated case uses `openai-compatible`; add a rejection case for `laberit`.
- `resolveDefaultModels`: laberit-only becomes `openai-compatible`-only with the renamed defaults; `opencode-go+laberit` becomes `opencode-go+openai-compatible` with opencode-go defaults.
- `buildProviderBlockJson`: assert `"openai-compatible":`, `"env": ["OPENAI_API_KEY"]`, `"${OPENAI_BASE_URL}"`, the four renamed model keys with their names and limits, and absence of `laberit`.
- `buildAgentBlockJson`: assert the renamed only-block pins and the combo block behaviour (`"model": "opencode-go/glm-5.3-flash"`, `"steps": 16`).
- `agentBlockFragments` step-floor table: replace the two renamed file names; keep `generic`-free (no `generic-only` entry).
- `generateOpenCodeJsonc`: provider-only produces `"enabled_providers": ["opencode", "openai-compatible"]`, the renamed defaults, the provider key, and parses as JSON after stripping the header; combo produces both provider blocks. Keep the `emits no env/file references` case with `openai-compatible` in the provider set and no required overrides.
- Rename any test names containing `laberit` so only the intentional rejection test mentions it.

**Step 3: Write minimal implementation**

- `cli/src/types.ts`: swap the union member.
- `cli/src/lib/providers.ts`: update `VALID_PROVIDERS`, the error hint, `resolveDefaultModels`, and `FAST_MODELS` ids/defaults; keep the same branch order and priority-array positions.
- `cli/src/lib/config-gen.ts`: update the `selected.includes(...)` checks and fragment paths to the renamed files; no other logic changes.
- `cli/src/commands/interactive.ts`: update the hint, menu values/labels, and connection instructions only.
- `cli/src/index.ts`: update the `--providers` description.
- Use `git mv` for the three fragment renames so history follows them.
- Update fragment contents: provider id, `name`, model ids/names only. Keep env vars, headers, limits, indentation, and ordering.
- Delete nothing else. Do not reintroduce the generic-only fragment or install-time model logic.

**Step 4: Run test to verify pass**

Run (owner: agent):

```
npx vitest run cli/tests/unit/config-gen.test.ts
cd cli && npx tsc --noEmit
npx tsx cli/src/index.ts install --repo temp/smoke-openai-compatible --providers openai-compatible --skip-node-check --no-track --force
```

Expected: unit cases pass, typecheck clean, and `temp/smoke-openai-compatible/opencode.jsonc` contains `"openai-compatible":`, the four renamed models with names/limits, top-level `openai-compatible/kimi-k2.6` / `kimi-k2.5`, agent pins on `openai-compatible/kimi-k2.*`, no `laberit`, and no `{env:}` / `{file:}`. Repeat with `--runtime kilocode` and confirm the same provider block.

**Step 5: Commit**

```
git add cli/src/types.ts cli/src/lib/providers.ts cli/src/lib/config-gen.ts cli/src/commands/interactive.ts cli/src/index.ts cli/tests/unit/config-gen.test.ts base/config/providers/laberit-provider-block.jsonc base/config/providers/openai-compatible-provider-block.jsonc base/config/agents/balanced-laberit-only-agent-block.jsonc base/config/agents/balanced-openai-compatible-only-agent-block.jsonc base/config/agents/balanced-opencode-go-laberit-agent-block.jsonc base/config/agents/balanced-opencode-go-openai-compatible-agent-block.jsonc
git commit -m "refactor!: rename laberit provider to openai-compatible (Issue #275)"
```

### Task 2: Update docs, record the rename in an ADR, and validate end-to-end

**Objective:** README, architecture, env example, ADR, changelog, integration test, and the monthly log describe the renamed provider and its unchanged behaviour.

**Files:**
- Modify: `README.md`
- Modify: `docs/ai/architecture.md`
- Modify: `profiles/defaults.env.example`
- Create: `docs/ai/decisions/ADR-0048-rename-laberit-provider.md`
- Modify: `CHANGELOG.md`
- Modify: `cli/tests/integration/install-layout.test.ts`
- Create: `docs/ai/logs/2026-11.md`

**Step 1: Establish expected behaviour**

- README examples use `--providers openai-compatible` and `openai-compatible/kimi-k2.6`; the env-var paragraph still names `OPENAI_BASE_URL` / `OPENAI_API_KEY` (no `/connect`, project `.env` not read, loud failure).
- `docs/ai/architecture.md` provider list, `/model` examples, and agent-block notes use the neutral ids; the Kilo `{env:}`/`${VAR}` invariant text stays.
- `profiles/defaults.env.example` keeps the two variables but renames the section from Laberit to the generic provider and uses a neutral example URL.
- ADR-0048 records: rename only; same env vars; renamed model IDs with unchanged limits; unchanged defaults and agent pins; no install-time model requirement; supersedes ADR-0008's vendor-specific provider-list entry and laberit authentication bullet.
- `CHANGELOG.md` has a **Breaking** `### Changed` entry under `[Unreleased]` with the migration (`--providers openai-compatible`, model ids `openai-compatible/kimi-k2.6`, `openai-compatible/kimi-k2.5`). `VERSION` stays untouched.
- No `laberit` remains in `README.md`, `docs/ai/architecture.md`, `profiles/defaults.env.example`, `cli/src/**`, or `base/config/**`.

**Step 2: Add or update validation**

- Extend the integration helper:

```ts
function installThroughCli(repo: string, providers: string, extra: string[] = []): void
```

  and append `extra` after `--providers`; add a case installing `openai-compatible` with no `--model` that asserts the enabled-provider list, the provider key, the four model keys, and the default top-level models.
- No new unit tests; behaviour is covered by Task 1.

**Step 3: Write minimal implementation**

- README, architecture, env example, ADR-0048, changelog, and log exactly as above.
- The log entry records the rename, validation evidence, and that the abandoned install-time-model redesign was discarded.
- Do not touch `VERSION`.

**Step 4: Run test to verify pass**

Run (owner: agent):

```
npx vitest run cli/tests/integration/install-layout.test.ts
make check
```

Expected: the integration case passes; `make check` is green.

Human validation (owner: human; do not execute automatically):

1. Export `OPENAI_BASE_URL` / `OPENAI_API_KEY`, install with `--providers openai-compatible`, open OpenCode, run `/models`, confirm the Kimi models are listed and a prompt succeeds.
2. Unset `OPENAI_API_KEY`, restart, confirm the request fails loudly with literal `${OPENAI_API_KEY}`.
3. Repeat with `--runtime kilocode` and confirm `kilo.jsonc` is accepted and a prompt succeeds.

**Step 5: Commit**

```
git add README.md docs/ai/architecture.md profiles/defaults.env.example docs/ai/decisions/ADR-0048-rename-laberit-provider.md CHANGELOG.md cli/tests/integration/install-layout.test.ts docs/ai/logs/2026-11.md
git commit -m "docs!: document openai-compatible provider rename (Issue #275)"
```

## Acceptance criteria

- [ ] `--providers openai-compatible` works with no `--model` and produces the previous defaults under the new ids.
- [ ] `--providers laberit` is rejected.
- [ ] The four renamed models keep their previous display names and limits.
- [ ] Defaults and agent pins keep their previous model mapping.
- [ ] Generated config keeps one `env` entry and literal `${OPENAI_BASE_URL}`, with no `{env:}` / `{file:}`.
- [ ] `laberit` no longer appears in `cli/src/**`, `base/config/**`, `README.md`, `docs/ai/architecture.md`, or `profiles/defaults.env.example`.
- [ ] ADR-0048 exists and supersedes only the vendor-specific portion of ADR-0008.
- [ ] `CHANGELOG.md` marks the rename as breaking; `VERSION` is unchanged.
- [ ] `make check` and `npx vitest run` pass.
- [ ] Human OpenCode and Kilo checks pass.
- [ ] History/release scrubbing remains tracked in #284.

## Confirmed at approval

- Provider id `openai-compatible`; env vars `OPENAI_BASE_URL` / `OPENAI_API_KEY` unchanged.
- Model mapping: `kimi-k2.6` (was `laberit-ai-preview`), `kimi-k2.5` (was `laberit-ai`), `gpt-5.6-luna`, `kimi-k2.7-code`.
- No `laberit` alias; clean break.
- This rename replaces the abandoned install-time-model redesign; that branch is kept as `backup/issue-275-generic-redesign`.
