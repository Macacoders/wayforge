---
status: completed
created: 2026-10-22
task: 3/3
required_gates:
  architect_review: false
  memory_update: true
---

# Issue #242 — code steps, laberit Kimi K2.7 Code, opencode-go+laberit combo Implementation plan

**Goal:** Guarantee every provider agent block gives the `code` subagent at least 16 steps, register `laberit-kimi-k2.7-code`, and make the `opencode-go,laberit` provider combination a first-class install option with opencode-go defaults and agent models.

**Architecture:** Two data edits and one vertical wiring change. Agent/ provider fragments under `base/opencode/config/**` stay the single source of truth; the CLI only selects and concatenates them. `resolveDefaultModels` and `buildAgentBlockJson` gain inclusion-based branches for the `opencode-go` + `laberit` set, the interactive menu gains one choice, and the new `balanced-opencode-go-laberit-agent-block.jsonc` mirrors the opencode-go-only model map with `code.steps` at 16. No parser change is needed: `parseProviders` already accepts arbitrary comma-separated combinations.

**Tech Stack:** TypeScript 5, Commander, fs-extra, Vitest 4, JSONC config fragments, Prettier/ESLint scoped to `cli/`.

**Scope classification:** `multi-task`

## Verified facts

- `parseProviders` (`cli/src/lib/providers.ts:11-37`) already accepts any comma-separated subset of the five valid providers, so `--providers opencode-go,laberit` parses today, preserves order, and deduplicates. Only model/agent-block resolution is missing.
- `resolveDefaultModels` (`cli/src/lib/providers.ts:77-117`) handles github-copilot only, openai+github-copilot, laberit only, opencode-go only, free-tier only, then falls back to `openai/gpt-6-sol` + `openai/gpt-5.6-luna` (`:113-116`). The combo therefore currently gets OpenAI defaults.
- `buildAgentBlockJson` (`cli/src/lib/config-gen.ts:107-141`) mirrors those branches and falls back to `balanced-openai-only-agent-block.jsonc` (`:136-141`), which pins OpenAI models unavailable to a laberit/opencode-go-only install.
- `fullProviderChoices` (`cli/src/commands/interactive.ts:81-100`) lists single providers plus `openai,github-copilot`, `openai,laberit`, `github-copilot,laberit`, and `openai,github-copilot,laberit`. There is no `opencode-go,laberit` entry. Kilocode derives its list by filtering `free-tier` (`:101-104`). Hints are derived from `PROVIDER_HINTS` (`:33-44`), so a combo entry automatically renders both requirement lines.
- Current `agent.code.steps`: github-copilot-only `5` (`balanced-github-copilot-only-agent-block.jsonc:14-17`), openai-only `15` (`balanced-openai-only-agent-block.jsonc:14-17`), openai+github-copilot `15` (`balanced-openai-github-copilot-agent-block.jsonc:14-17`), opencode-go-only `12` (`balanced-opencode-go-only-agent-block.jsonc:14-17`), free-tier `12` (`free-tier-agent-block.jsonc:14-17`). `balanced-laberit-only-agent-block.jsonc:11-13` has no `steps` key at all for `code` (and no `steps` anywhere), matching ADR-0037's model-only style for that block.
- `laberit-provider-block.jsonc:11-33` holds exactly three models in order: `laberit-ai-preview` (262144/16384), `laberit-ai` (131072/16384), `laberit-gpt-5.6-luna` (1000000/131072). Indentation is 4 spaces for `"laberit"`, 6 for `"models"`, 8 for each model key, 10 for its fields.
- All opencode-go models named in the issue exist in `opencode-go-provider-block.jsonc`: `deepseek-v4.1-flash` (`:3`), `muse-spark-1.3-contributor` (`:9`), `mimo-v2.6-flash` (`:15`), `glm-5.3-flash` (`:21`).
- `cli/tests/unit/config-gen.test.ts` already covers defaults (`:97-146`), agent-block selection (`:283-331`), and generated config (`:333-446`). Test-file style is 2-space + double quotes + semicolons, unlike `cli/src/` (tabs, no semicolons); follow the file, not `src`.
- `docs/ai/architecture.md:11` documents supported provider sets and `:19` documents `/model` examples. `docs/ai/logs/2026-10.md` is the current monthly log.
- `tests/bash/bootstrap_cli.bats:249-255` covers legacy laberit-only defaults and reads the shared fragment. Legacy scripts are frozen and out of scope, but the new model will appear there automatically.
- Under `--dry-run`, `writeFile` only logs `DRY-RUN: write file <path>` and writes no content (`cli/src/lib/files.ts`), so generated `opencode.jsonc` cannot be grepped after a dry run. Validate generated content through `buildProviderBlockJson` / `buildAgentBlockJson` / `generateOpenCodeJsonc` or a real install into a throwaway repo.

## Decisions

1. **Inclusion-based combo matching.** Both `resolveDefaultModels` and `buildAgentBlockJson` should test `selected.includes('opencode-go') && selected.includes('laberit')`, not exact array order. `--providers laberit,opencode-go` is accepted by the parser and must behave the same as the menu's `opencode-go,laberit`; only `enabled_providers` order follows user input.
2. **Combo branch placement.** Place it after the `openai` + `github-copilot` branch and before the single-provider branches in both functions. This keeps `openai,laberit` on the existing OpenAI fallback and lets `openai,opencode-go,laberit` use the combo block.
3. **Laberit-only `code.steps` only.** Add `steps: 16` to `code` in the laberit-only block, leaving its other agents model-only (ADR-0037 style) and not re-pinning the `code` model. This satisfies the issue's table without broad restyling.
4. **New block rather than conditional rewriting.** Follow the existing one-fragment-per-combination pattern (e.g. `balanced-openai-github-copilot-agent-block.jsonc`) instead of mutating model maps at generation time.
5. **No architect gate.** This extends the provider-selectable install surface already accepted in ADR-0008 and adds data/fragments plus additive CLI choices; it introduces no new contract, persistence, auth, topology, or domain-model boundary. `memory_update` is required because `docs/ai/architecture.md` changes.

## Progress

- Task 1 — completed. `code.steps` raised to 16 in the six existing blocks; laberit-only `code` gained `steps` without re-pinning `laberit/laberit-ai`. Added `describe("agent block step floors")` coverage. Validated `npx vitest run cli/tests/unit/config-gen.test.ts` (52 passed, 2 skipped) and emission for all six provider sets. Commit `d58e08c` on `feature/issue-242-code-steps-laberit-kimi-combo`.
- Task 2 — completed. Added `laberit-kimi-k2.7-code` (`Kimi K2.7 Code`, 262100/262100) as a fourth laberit model, additive only; existing entries and laberit defaults unchanged. Validated `buildProviderBlockJson(['laberit'], 'opencode', '.')` (four entries in order) and `npx vitest run cli/tests/unit/config-gen.test.ts` (52 passed, 2 skipped). Commit `f635808`.
- Task 3 — completed. Added `balanced-opencode-go-laberit-agent-block.jsonc`, inclusion-based combo branches in `providers.ts` and `config-gen.ts`, the interactive menu choice, combo tests, and architecture/log updates. Validated `npx vitest run cli/tests/unit/config-gen.test.ts` (56 passed, 2 skipped), `make check` (all checks passed; jscpd 7.85%), and a temp-repo `--providers opencode-go,laberit --no-track --force` install (expected `enabled_providers`, defaults, both provider fragments, Kimi model, `code.steps` 16, no openai models). Commit `f658281`. Human validation pending (owner: human): `/model` lists and switches to `laberit/laberit-kimi-k2.7-code` and `opencode-go/glm-5.3-flash` in an OpenCode session.

## Tasks

### Task 1: Raise `code.steps` to 16 in every existing agent block

**Objective:** Ensure no existing provider block gives the `code` subagent fewer than 16 steps, and add the missing `steps` key to the laberit-only block's `code` agent.

**Files:**
- Modify: `base/opencode/config/agents/balanced-github-copilot-only-agent-block.jsonc:16` (`5` → `16`)
- Modify: `base/opencode/config/agents/balanced-openai-only-agent-block.jsonc:16` (`15` → `16`)
- Modify: `base/opencode/config/agents/balanced-openai-github-copilot-agent-block.jsonc:16` (`15` → `16`)
- Modify: `base/opencode/config/agents/balanced-opencode-go-only-agent-block.jsonc:16` (`12` → `16`)
- Modify: `base/opencode/config/agents/free-tier-agent-block.jsonc:16` (`12` → `16`)
- Modify: `base/opencode/config/agents/balanced-laberit-only-agent-block.jsonc:11-13` (add `"steps": 16` after the `code.model` line, matching that file's 4-space-nested style)
- Validate: `cli/tests/unit/config-gen.test.ts`

**Step 1: Establish expected behaviour**

Every existing `agents/*.jsonc` fragment must expose `agent.code.steps >= 16`; all other agents' existing `steps` values stay byte-identical, and no other model assignment changes.

**Step 2: Add or update validation**

Add a table-driven Vitest case (e.g. `describe("agent block step floors")`) that iterates the five existing fragment filenames, reads each via the already-imported `readFragment(sourceDir, 'agents/<file>')`, wraps it as `JSON.parse('{' + fragment + '}')`, and asserts `parsed.agent.code.steps >= 16`. Also assert the laberit block's `code.model` is still `laberit/laberit-ai` so the step change did not re-pin the model. Keep the new combined block out of this list until Task 3 creates it.

**Step 3: Write minimal implementation**

Change only the `code.steps` values listed above. In `balanced-laberit-only-agent-block.jsonc`:

```jsonc
    "code": {
      "model": "laberit/laberit-ai",
      "steps": 16
    },
```

Do not add `steps` to the laberit block's other agents, and do not touch `planner`/`delivery`/`research`/`troubleshooter`/`architect` values elsewhere.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/config-gen.test.ts`
Expected: all tests pass, including the new floor assertions.

Run: `npx tsx -e "import {buildAgentBlockJson} from './cli/src/lib/config-gen.ts'; for (const p of [['github-copilot'],['openai'],['openai','github-copilot'],['opencode-go'],['free-tier'],['laberit']]) console.log(p.join('+'), buildAgentBlockJson(p as any, '.', 'opencode'))"`
Expected: each emitted block shows `"code"` with `"steps": 16`; laberit's other agents still show model only.

**Step 5: Commit**

`git add base/opencode/config/agents/balanced-github-copilot-only-agent-block.jsonc base/opencode/config/agents/balanced-openai-only-agent-block.jsonc base/opencode/config/agents/balanced-openai-github-copilot-agent-block.jsonc base/opencode/config/agents/balanced-opencode-go-only-agent-block.jsonc base/opencode/config/agents/free-tier-agent-block.jsonc base/opencode/config/agents/balanced-laberit-only-agent-block.jsonc cli/tests/unit/config-gen.test.ts`
`git commit -m "chore(agents): raise code subagent steps to 16 (Issue #242)"`

---

### Task 2: Register the `laberit-kimi-k2.7-code` model

**Objective:** Add the Kimi K2.7 Code entry to the laberit provider fragment so it is selectable with `/model laberit/laberit-kimi-k2.7-code`, without changing existing models or install defaults.

**Files:**
- Modify: `base/opencode/config/providers/laberit-provider-block.jsonc:26-32` (append after `laberit-gpt-5.6-luna`)
- Validate: emitted provider block from `buildProviderBlockJson`

**Step 1: Establish expected behaviour**

`buildProviderBlockJson(['laberit'], 'opencode', '.')` must emit a fourth model entry `laberit-kimi-k2.7-code` with `name: "Kimi K2.7 Code"`, `limit.context: 262100`, and `limit.output: 262100`. The three existing entries must remain byte-identical and in order. Laberit-only defaults remain `laberit/laberit-ai-preview` / `laberit/laberit-ai`.

**Step 2: Add or update validation**

No new unit test is required for this additive data entry (same rationale as Issue #206), but Task 3's tests must not regress. Validation is the direct emission check in Step 4 plus the existing laberit-default test.

**Step 3: Write minimal implementation**

Append to the `models` map (add a comma after the closing brace of `laberit-gpt-5.6-luna`):

```jsonc
        "laberit-kimi-k2.7-code": {
          "name": "Kimi K2.7 Code",
          "limit": {
            "context": 262100,
            "output": 262100
          }
        }
```

Do not change `resolveDefaultModels`, the laberit-only agent block models, or any other provider fragment.

**Step 4: Run test to verify pass**

Run: `npx tsx -e "import {buildProviderBlockJson} from './cli/src/lib/config-gen.ts'; console.log(buildProviderBlockJson(['laberit'],'opencode','.'))"`
Expected: four model entries; the new one exactly as specified, correctly nested under `"models"`.

Run: `npx vitest run cli/tests/unit/config-gen.test.ts`
Expected: existing laberit-only default assertions pass unchanged.

**Step 5: Commit**

`git add base/opencode/config/providers/laberit-provider-block.jsonc`
`git commit -m "feat(laberit): register Kimi K2.7 Code model (Issue #242)"`

---

### Task 3: Add the `opencode-go,laberit` provider combination end to end

**Objective:** Make the combined provider set selectable in the interactive installer and resolve to opencode-go defaults, opencode-go agent models, and a dedicated agent block, with automated coverage and updated architecture memory.

**Files:**
- Create: `base/opencode/config/agents/balanced-opencode-go-laberit-agent-block.jsonc`
- Modify: `cli/src/lib/providers.ts:88-95` (insert combo branch in `resolveDefaultModels`)
- Modify: `cli/src/lib/config-gen.ts:114-129` (insert combo branch in `buildAgentBlockJson`)
- Modify: `cli/src/commands/interactive.ts:89-90` (add menu choice after `opencode-go`)
- Modify: `cli/tests/unit/config-gen.test.ts` (defaults, agent-block selection, generation, step floor table)
- Modify: `docs/ai/architecture.md:11,19`
- Modify: `docs/ai/logs/2026-10.md` (memory gate)
- Validate: `cli/tests/unit/config-gen.test.ts`, `make check`, temp-repo install

**Step 1: Establish expected behaviour**

For the set `['opencode-go', 'laberit']` in either order:

- `resolveDefaultModels` returns `opencode-go/deepseek-v4.1-flash` + `opencode-go/muse-spark-1.3-contributor`.
- `buildAgentBlockJson` reads `balanced-opencode-go-laberit-agent-block.jsonc` (not the OpenAI fallback).
- `generateOpenCodeJsonc` emits `"enabled_providers": ["opencode", "opencode-go", "laberit"]` (input order preserved after the runtime provider), both `"opencode-go":` and `"laberit":` provider fragments, and the opencode-go agent models.
- The interactive provider menu offers `opencode-go,laberit` for both opencode and kilocode runtimes, with both requirement hints joined by `; `.
- The existing `openai,laberit` fallback and all single-provider behaviour are unchanged.

**Step 2: Add or update validation**

In `cli/tests/unit/config-gen.test.ts`:

- `resolveDefaultModels(["opencode-go", "laberit"])` and `resolveDefaultModels(["laberit", "opencode-go"])` both equal the opencode-go pair.
- `buildAgentBlockJson(["opencode-go", "laberit"], sourceDir, "opencode")` contains `"model": "opencode-go/glm-5.3-flash"` and `"steps": 16` under `code`, and does not contain `"model": "openai/`.
- `generateOpenCodeJsonc(makeOpts("opencode", ["opencode-go", "laberit"]))` contains the combined `enabled_providers` string, the defaults, `"opencode-go": {`, `"laberit": {`, and `"muse-spark-1.3-contributor"`.
- Append `balanced-opencode-go-laberit-agent-block.jsonc` to the Task 1 step-floor table.

**Step 3: Write minimal implementation**

Create `base/opencode/config/agents/balanced-opencode-go-laberit-agent-block.jsonc` by copying `balanced-opencode-go-only-agent-block.jsonc` and changing `code.steps` from `12` to `16`:

```jsonc
"agent": {
    "planner": {
      "model": "opencode-go/deepseek-v4.1-flash",
      "steps": 24
    },
    "delivery": {
      "model": "opencode-go/deepseek-v4.1-flash",
      "steps": 24
    },
    "research": {
      "model": "opencode-go/muse-spark-1.3-contributor",
      "steps": 16
    },
    "code": {
      "model": "opencode-go/glm-5.3-flash",
      "steps": 16
    },
    "troubleshooter": {
      "model": "opencode-go/mimo-v2.6-flash",
      "steps": 10
    },
    "architect": {
      "model": "opencode-go/mimo-v2.6-flash",
      "steps": 16
    }
  }
```

In `resolveDefaultModels`, after the openai+github-copilot branch:

```ts
	if (selected.includes('opencode-go') && selected.includes('laberit')) {
		return {
			model: 'opencode-go/deepseek-v4.1-flash',
			smallModel: 'opencode-go/muse-spark-1.3-contributor',
		}
	}
```

In `buildAgentBlockJson`, after the openai+github-copilot branch:

```ts
	} else if (
		selected.includes('opencode-go') &&
		selected.includes('laberit')
	) {
		fragment = readFragment(
			sourceDir,
			'agents/balanced-opencode-go-laberit-agent-block.jsonc',
		)
	}
```

In `interactive.ts`, add after the `opencode-go` choice:

```ts
			{ label: 'opencode-go,laberit', value: 'opencode-go,laberit' },
```

In `docs/ai/architecture.md`, extend the supported provider-set sentence (`:11`) to name `opencode-go,laberit` and add `laberit/laberit-kimi-k2.7-code` to the `/model` examples (`:19`). Add one concise entry to `docs/ai/logs/2026-10.md` recording the change, validation, and gates.

Do not touch frozen `install/legacy/**`, the CLI parser, provider fragments other than laberit, or generated `.opencode/` / `opencode.jsonc`.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/config-gen.test.ts`
Expected: new combo cases pass, existing cases unchanged.

Run: `make check`
Expected: typecheck, lint, format, and duplication pass.

Run (bounded temp repo, no tracking):
`$tmp = Join-Path $env:TEMP 'wayforge-242-combo'; New-Item -ItemType Directory -Force $tmp | Out-Null; npx tsx cli/src/index.ts install --repo $tmp --providers opencode-go,laberit --no-track --force`
Expected: install completes; then inspect `$tmp/opencode.jsonc`:
- `enabled_providers` contains `"opencode", "opencode-go", "laberit"`.
- `model` is `opencode-go/deepseek-v4.1-flash`; `small_model` is `opencode-go/muse-spark-1.3-contributor`.
- `provider` includes both `"opencode-go"` and `"laberit"`; `laberit-kimi-k2.7-code` appears.
- `code` agent has `"steps": 16`; no `"model": "openai/` appears in the agent block.

Human validation (do not execute as agent): in an OpenCode session using a temp install, run `/model` and confirm `laberit/laberit-kimi-k2.7-code` and `opencode-go/glm-5.3-flash` are listed, then switch to each once. Expected: both models appear and are selectable.

**Step 5: Commit**

`git add base/opencode/config/agents/balanced-opencode-go-laberit-agent-block.jsonc cli/src/lib/providers.ts cli/src/lib/config-gen.ts cli/src/commands/interactive.ts cli/tests/unit/config-gen.test.ts docs/ai/architecture.md docs/ai/logs/2026-10.md`
`git commit -m "feat(installer): add opencode-go+laberit provider combination (Issue #242)"`

## Validation ownership

| Validation | Owner |
| --- | --- |
| `npx vitest run cli/tests/unit/config-gen.test.ts` | agent |
| `npx tsx -e` fragment emission checks | agent |
| `make check` | agent |
| Temp-repo real install (`--no-track --force`) + inspection | agent |
| OpenCode `/model` listing/switch on a temp install | human |

## Risks and mitigations

- **Config fragments are outside `make check`.** `tsc`/`eslint`/`prettier` are scoped to `cli/`, so fragment indentation and well-formedness are only covered by the new step-floor parse test and emission checks. Keep the JSONC structurally identical to neighboring files.
- **Order of provider resolution.** Exact-order matching would make `--providers laberit,opencode-go` behave differently from the menu. Use `includes` checks and cover both orders in tests.
- **Fallback reachability.** Placing the combo branch before the openai fallback but after openai+github-copilot preserves the existing `openai,laberit` fallback test. Verify that test still passes.
- **Kilocode parity.** The combo menu entry is added to the shared list; kilocode only filters `free-tier`, so no runtime-specific branch is needed. The generated `kilo.jsonc` uses the same agent block and defaults.

## Out of scope

- Frozen legacy installers (`install/legacy/**`) and `tests/bash/**`.
- Re-pinning any agent to `laberit/laberit-kimi-k2.7-code`.
- Adding `steps` to laberit-only agents other than `code`.
- Changing existing laberit defaults or models, or any OpenAI/GitHub/opencode-go model assignment outside the new block.
- Editing generated `.opencode/` or `opencode.jsonc`.
