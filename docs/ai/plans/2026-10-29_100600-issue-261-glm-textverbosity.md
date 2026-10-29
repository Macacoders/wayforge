---
status: completed
created: 2026-10-29
task: 1/1
required_gates:
  architect_review: false
  memory_update: true
---

# Issue #261: Remove `textVerbosity` from the `opencode-go` GLM-5.3-Flash model

**Goal:** The `code` subagent starts successfully under both balanced opencode-go profiles because the generated `opencode-go` provider config no longer sends the unsupported `verbosity` field to `glm-5.3-flash`, and a regression test prevents it from being reintroduced.

**Architecture:** Provider model blocks remain the single source of truth for model options (ADR-0013). The only change is removing `textVerbosity` from the `glm-5.3-flash` entry in `base/config/providers/opencode-go-provider-block.jsonc`; `reasoningEffort` stays, and `textVerbosity` stays on the models whose endpoints accept it. A Vitest case parses the generated provider fragment and pins the exact options for GLM plus the retained options for DeepSeek and MiMo. No installer, agent-allocation, or OpenCode-mapping code changes.

**Tech Stack:** JSONC config fragments, TypeScript, Vitest 4 (root `vitest.config.ts`), `cli/src/lib/config-gen.ts` (`buildProviderBlockJson`), `cli/tests/unit/config-gen.test.ts`.

**Scope classification:** `single-task`

**Plan rationale:** One defect, one config-line fix, one regression assertion — the same reviewable deliverable. Task economy prefers a single task here. The memory log entry is the declared closeout gate, not a separate deliverable.

## Confirmed planning decisions

1. **Remove `textVerbosity` only from `glm-5.3-flash`.** OpenCode 1.19.2 sends `verbosity` derived from `textVerbosity`; GLM rejects it. DeepSeek and MiMo were verified working with `textVerbosity` (Issue #261), so their options are unchanged.
2. **Keep `reasoningEffort: "medium"` on GLM.** The upstream rejection names only `verbosity`; reasoning effort is not implicated and removing it would silently change model behavior.
3. **No per-model capability flag or option-filtering layer.** The provider fragment already sets options per model; the issue's conditional ("emit it per model") is already satisfied. A filtering mechanism would be speculative.
4. **No ADR.** ADR-0013 still describes the architecture correctly: options live in provider model blocks. This change narrows one model's options to those its endpoint accepts; it changes no public contract, persistence format, or topology.
5. **Do not edit generated output.** `opencode.jsonc`, `.agents/**`, `.opencode/**`, and `.kilo/**` are gitignored/generated. The source of truth is `base/config/providers/opencode-go-provider-block.jsonc`.
6. **Do not change agent/model allocation or OpenCode's `textVerbosity` -> `verbosity` mapping.** Both are explicitly out of scope in Issue #261.
7. **No live-endpoint unit test.** Endpoint acceptance cannot be asserted in Vitest; the unit test guards the structural regression, and a real `code` subagent handoff is a human validation.
8. **Existing installs need a forced config refresh.** `syncGeneratedOpenCodeJsonc` skips an existing non-symlink config unless `--force` is set (`cli/src/lib/config-gen.ts:263-283`; `cli/src/commands/install.ts:163-180`). Refresh is documented for human validation; installer behavior is not changed in this issue.
9. **Broader `textVerbosity` audit is a follow-up, not part of this fix.** OpenAI, GitHub Copilot, Laberit, and free-tier blocks are out of scope unless a model is proven to reject `verbosity`; record the open question in the memory log if desired.

## Repository facts the implementer needs

- `base/config/providers/opencode-go-provider-block.jsonc:21-26` is the GLM entry. Line 23 is `"reasoningEffort": "medium"` and line 24 is `"textVerbosity": "low"` (with a trailing comma on line 23 after removal).
- The same file keeps `textVerbosity` for `deepseek-v4.1-flash` (`"medium"`), `muse-spark-1.3-contributor` (`"low"`), and `mimo-v2.6-flash` (`"low"`). Those entries are intentionally untouched.
- Both balanced opencode-go agent blocks pin `code` to `opencode-go/glm-5.3-flash`: `base/config/agents/balanced-opencode-go-only-agent-block.jsonc:14-17` and `base/config/agents/balanced-opencode-go-laberit-agent-block.jsonc:14-17`.
- `buildProviderBlockJson` (`cli/src/lib/config-gen.ts:59-103`) reads each provider fragment as text and joins them with `,\n`; for the `opencode` runtime it also prepends `providers/opencode-provider-block.jsonc`. The fragments contain no comments, so wrapping the joined fragment in braces and calling `JSON.parse` is a valid way to inspect the generated provider object.
- `cli/tests/unit/config-gen.test.ts:268-315` already owns the `buildProviderBlockJson` cases; add the regression there rather than creating a new file.
- `cli/tests/unit/config-gen.test.ts:344-354` already asserts the opencode-go/laberit agent block pins `code` to `opencode-go/glm-5.3-flash`; that assertion remains valid and must not be weakened.
- `make check` runs the root Vitest suite plus CLI `tsc --noEmit`, ESLint, Prettier, and jscpd (8% threshold).
- This checkout is clean on `feature/issue-260-memory-command-agent-fix`, which has four unmerged commits. Issue #261 is independent: it touches `base/config/providers/opencode-go-provider-block.jsonc` and `cli/tests/unit/config-gen.test.ts`, neither of which appears in the #260 diff. Delivery should branch `feature/issue-261-glm-textverbosity` from `develop`; if `develop` still lacks #260, no conflict is expected.
- `rg` is unavailable in this Windows shell; use `git grep` or `Select-String` in validation commands.

## Tasks

### Task 1: Remove GLM `textVerbosity` and pin the provider-option regression

**Objective:** Generated `opencode-go` config for `glm-5.3-flash` carries only `reasoningEffort`, while DeepSeek and MiMo keep `textVerbosity`, and a unit test fails if GLM's `textVerbosity` returns.

**Files:**
- Modify: `base/config/providers/opencode-go-provider-block.jsonc:21-26`
- Validate: `cli/tests/unit/config-gen.test.ts` (new case in the `buildProviderBlockJson` describe block)

**Step 1: Establish expected behaviour**

- For `buildProviderBlockJson(["opencode-go"], "opencode", sourceDir)`, the parsed `"opencode-go"` provider has `models["glm-5.3-flash"].options` equal to exactly `{ reasoningEffort: "medium" }` — no `textVerbosity`.
- `models["deepseek-v4.1-flash"].options.textVerbosity` remains `"medium"` and `models["mimo-v2.6-flash"].options.textVerbosity` remains `"low"`, proving the fix is model-specific rather than a blanket removal.
- The generated fragment is still valid JSON when wrapped in braces, so the parse assertion also guards syntax.

**Step 2: Add or update validation**

Add a case to the existing `describe("buildProviderBlockJson", ...)` block in `cli/tests/unit/config-gen.test.ts` (after the fragment-joining case, before line 315):

```ts
it("omits textVerbosity for opencode-go glm-5.3-flash but keeps other model options", () => {
  const block = buildProviderBlockJson(["opencode-go"], "opencode", sourceDir);
  const opencodeGo = JSON.parse(`{${block}}`)["opencode-go"];

  expect(opencodeGo.models["glm-5.3-flash"].options).toEqual({
    reasoningEffort: "medium",
  });
  expect(
    opencodeGo.models["deepseek-v4.1-flash"].options.textVerbosity,
  ).toBe("medium");
  expect(opencodeGo.models["mimo-v2.6-flash"].options.textVerbosity).toBe(
    "low",
  );
});
```

Run it against the current tree first:

`npx vitest run cli/tests/unit/config-gen.test.ts -t "omits textVerbosity"`

Expected: **fails** because the current GLM options include `textVerbosity: "low"`, proving the guard catches the shipped defect. If the case passes before the fix, the assertion is not inspecting the GLM entry and must be corrected before proceeding.

**Step 3: Write minimal implementation**

Edit `base/config/providers/opencode-go-provider-block.jsonc`:

```diff
         "glm-5.3-flash": {
           "options": {
-            "reasoningEffort": "medium",
-            "textVerbosity": "low"
+            "reasoningEffort": "medium"
           }
         }
```

Do not touch the DeepSeek, MiMo, or `muse-spark` entries. Do not remove `reasoningEffort`. Do not modify the agent blocks.

**Step 4: Run test to verify pass**

Run:

`npx vitest run cli/tests/unit/config-gen.test.ts -t "omits textVerbosity"`

Expected: the new case passes; the rest of the file is unaffected.

Then run the full gate:

`npx vitest run`

Expected: full suite green.

Then run:

`make check`

or, if `make` is unavailable: `npx vitest run` followed by `cd cli && npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`.

Expected: typecheck, lint, format, and duplication checks pass.

Optionally confirm the generated text directly:

`npx tsx cli/src/index.ts install --repo <scratch-repo> --providers opencode-go --dry-run`

Expected dry-run output is read-only; the definitive structural check is the unit test. To inspect a real file, use the human validation below.

**Step 5: Commit**

`git add base/config/providers/opencode-go-provider-block.jsonc cli/tests/unit/config-gen.test.ts`

`git commit -m "fix: drop unsupported textVerbosity from opencode-go GLM model (Issue #261)"`

## Validation ownership

| Validation | Owner | Command / procedure | Expected |
| --- | --- | --- | --- |
| GLM provider-option regression (pre-fix red, post-fix green) | agent | `npx vitest run cli/tests/unit/config-gen.test.ts -t "omits textVerbosity"` | Fails on the old `textVerbosity: "low"`; passes after the one-line removal |
| Targeted config-gen suite | agent | `npx vitest run cli/tests/unit/config-gen.test.ts` | All config-gen cases pass |
| Full repository gate | agent | `make check` (or `npx vitest run` + `cd cli && npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`) | All checks pass |
| Existing install refresh | human | In a repo installed with the balanced opencode-go profile: `npx tsx cli/src/index.ts install --repo <repo> --providers opencode-go --force`; inspect `opencode.jsonc` for the `glm-5.3-flash` entry | The entry contains `reasoningEffort` and no `textVerbosity`; the rest of the managed config is unchanged |
| Real `code` subagent handoff (OpenCode 1.19.2) | human | In that refreshed repo, open OpenCode and invoke the `code` subagent (for example, a delivery `/implement-task` on a trivial approved plan) | The subagent starts; no `Upstream request failed: [invalid_request_error] Extra inputs are not permitted, field: 'verbosity'` |
| Optional endpoint spot-check | human | Compare the `code` agent start against the `architect` agent (MiMo) in the same install | Both start; only GLM was defect-specific |

Agent validations are bounded and non-interactive. The human rows require a real OpenCode session and an installed provider profile; agents must not attempt them.

## Closeout

- Set plan `status: completed` and `task: 1/1` after review.
- `memory_update: true`: append a `docs/ai/logs/2026-10.md` entry under 2026-10-29 recording the root cause (OpenCode 1.19.2 maps `textVerbosity` to `verbosity`; GLM rejects it), the removed GLM option, the retained DeepSeek/MiMo options, the new regression test, the `--force` refresh requirement for existing installs, and any outstanding human validation. If the broader provider audit remains undone, note it as a follow-up rather than implying coverage.
- `architect_review: false`: no ADR or architectural boundary is touched. If review proposes a general option-capability layer or agent/model reallocation, stop and escalate instead of widening this plan.
- Do not edit generated `opencode.jsonc`, `.agents/**`, `.opencode/**`, or `.kilo/**` as part of this task.
