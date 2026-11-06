---
status: completed
created: 2026-10-03
task: 1/1
required_gates:
  architect_review: false
  memory_update: true
---

# laberit-gpt-5.6-luna model registration (Issue #206) Implementation plan

**Goal:** Register `laberit-gpt-5.6-luna` as a third model in the laberit provider fragment so it is selectable via `/model laberit/laberit-gpt-5.6-luna`, leaving existing models and install defaults untouched.

**Architecture:** Purely additive edit to one source-of-truth JSONC fragment. `cli/src/lib/config-gen.ts:79-83` reads `providers/laberit-provider-block.jsonc` through `readFragment` (which normalizes CRLF to LF and strips one trailing newline) and concatenates it verbatim into generated `opencode.jsonc` via `fragments.join(',\n')`. No code parses, re-indents, or enumerates the `models` map, so adding a key cannot alter any existing path. `cli/src/lib/providers.ts:95-98` independently hardcodes laberit-only defaults (`laberit/laberit-ai-preview` + `laberit/laberit-ai`), so defaults are structurally insulated from this change.

**Tech Stack:** JSONC config fragment; Node CLI installer (TypeScript, tsx, vitest, bats).

**Scope classification:** `single-task`

**Task budget rationale:** Not required — 1 task. The work is one contiguous JSON object insertion with no independent sub-goal, no independently reviewable second deliverable, and no cross-module surface.

## Tasks

### Task 1: Add the `laberit-gpt-5.6-luna` entry to the laberit provider fragment

**Objective:** Insert one new model entry into the `models` map of `base/opencode/config/providers/laberit-provider-block.jsonc` with the specified display name and limits, preserving all existing content, order, and indentation.

**Files:**
- Modify: `base/opencode/config/providers/laberit-provider-block.jsonc:11-26` (`models` map)
- Validate: `cli/tests/unit/config-gen.test.ts:126-130`, `tests/bash/bootstrap_cli.bats:249-255`

**Step 1: Establish expected behaviour**

The emitted provider block for `--providers laberit` must contain a third model key `laberit-gpt-5.6-luna` with `name: "GPT-5.6-luna"`, `limit.context: 1000000`, `limit.output: 131072`. The two existing entries must remain byte-identical and in original order: `laberit-ai-preview` (context 262144, output 16384) and `laberit-ai` (context 131072, output 16384). Laberit-only install defaults must remain `model` = `laberit/laberit-ai-preview`, `small_model` = `laberit/laberit-ai`.

**Step 2: Add or update validation**

No new test. The only regression surface is a typo in a static key name or limit value, which surfaces immediately on `/model` selection — there is no logic path that can compute a wrong answer. Existing coverage that must stay green and unmodified:
- `cli/tests/unit/config-gen.test.ts` — laberit-only default assertions.
- `tests/bash/bootstrap_cli.bats` — rendered laberit defaults.

Note the issue's proposed `--dry-run` + `rg` check is **not executable**: `cli/src/lib/files.ts:50-59` shows `writeFile` under dry-run only logs `DRY-RUN: write file <path>` and never writes content, so the generated `opencode.jsonc` does not exist to grep. Use `buildProviderBlockJson` directly instead (no filesystem writes).

Note also that `make check` / `check-node` scope `tsc`, `eslint`, and `prettier` to `cli/` only, so they cannot observe this fragment. Running them would be theater, not evidence.

**Step 3: Write minimal implementation**

Append one new key as the last entry in the `models` map, after `laberit-ai` (add a comma after that entry's closing brace):

```jsonc
        "laberit-gpt-5.6-luna": {
          "name": "GPT-5.6-luna",
          "limit": {
            "context": 1000000,
            "output": 131072
          }
        }
```

Indentation is mandatory and must match sibling entries exactly (model key 8 spaces, `"name"`/`"limit"` 10, `"context"`/`"output"` 12), because the fragment is concatenated verbatim and any drift misaligns generated output. Do not reindent or reflow existing lines. Do not hand-mangle line endings: the working tree is CRLF via `text=auto` checkout while the git index is LF, and `readFragment` normalizes CRLF to LF, so the working-tree form is correct as-is.

Do not touch `cli/src/lib/providers.ts`, `base/opencode/config/agents/balanced-laberit-only-agent-block.jsonc`, `cli/src/**`, `install/legacy/**`, `tests/**`, or any other provider fragment.

**Step 4: Run test to verify pass**

```powershell
# Primary check — emitted provider JSON contains the new key; writes nothing
npx tsx -e "import {buildProviderBlockJson} from './cli/src/lib/config-gen.ts'; console.log(buildProviderBlockJson(['laberit'],'opencode','.'))"
# Unit tests
npx vitest run
# One-file diff
git diff --stat
```

Expected:
- Emitted JSON shows `laberit-gpt-5.6-luna` with the exact name and limits, correctly nested and indented inside `models`.
- `npx vitest run` → 287 passed / 2 skipped, plus one pre-existing unrelated win32 failure in `cli/tests/unit/uninstall.test.ts` (see Verification record).
- `git diff --stat` → exactly 1 file, 7 insertions, 0 deletions.

`tests/bash/bootstrap_cli.bats` could not be executed in the authoring environment (no `bash.exe` on Windows). It is structurally independent of this change — `install/legacy/bootstrap-thin.sh` contains no reference to `laberit`, `provider-block`, or `models` — but it remains unverified and should run in CI.

**Step 5: Commit**

```powershell
git add base/opencode/config/providers/laberit-provider-block.jsonc
git commit -m "chore(laberit): add laberit-gpt-5.6-luna model entry (Issue #206)"
```

The memory log (`docs/ai/logs/2026-10.md`) is a separate concern and should be committed separately as `docs: add October 2026 AI change log`.

## Verification record

| Check | Result |
|---|---|
| `git status --short` | Exactly 1 modified file + 1 new memory log; no commit, no stash, no stray files |
| `git diff` | +7 / −0; pure addition, 0 deletions, no existing byte modified |
| `git diff --stat` | 1 file changed, 7 insertions — matches acceptance criterion |
| Indentation | Model key 8 spaces, nested 10/12/14 — byte-identical column position to siblings |
| `buildProviderBlockJson(['laberit'],'opencode','.')` | Emits `laberit-gpt-5.6-luna` verbatim with correct limits and nesting |
| `npx vitest run` | 287 passed / 2 skipped / 1 failed (pre-existing, unrelated) |
| `git log` | Unchanged at `832c1c0` — no commit created during implementation |

**Pre-existing failure (not caused by this task):** `cli/tests/unit/uninstall.test.ts > removes tracking entry from state dir when uninstalling a tracked project` fails on native Windows. `resolveStateDir()` (`cli/src/lib/tracking.ts:7-13`) returns `path.join(process.env.LOCALAPPDATA, 'ai-config')` whenever `LOCALAPPDATA` is set, taking precedence over `os.homedir()`. The test stubs only `WSL_DISTRO_NAME` (line 21) and never `LOCALAPPDATA`, so its `os.homedir()` mock is never consulted: the fixture is written to `<testDir>/home/.ai-config/installed-projects.json` while `removeTrackingEntry` reads the developer's real `%LOCALAPPDATA%\ai-config\installed-projects.json`. `lookupPath` matches nothing there, so the function returns early at line 144-146, the fixture is left with both projects, and `toHaveLength(1)` fails. Invisible on Linux/macOS, where `LOCALAPPDATA` is undefined and the `os.homedir()` branch is taken — hence green in CI. This is the same bug class Issue #195 fixed in `cli/tests/unit/tracking.test.ts` (which stubs `LOCALAPPDATA` at line 40); `uninstall.test.ts` never received that fix. The one-line remedy would be `vi.stubEnv("LOCALAPPDATA", "")` in that test's `beforeEach` (`afterEach` already calls `vi.unstubAllEnvs()`), but it is deliberately out of scope here.

Confirmed unrelated to this task: `readFragment` / `buildProviderBlockJson` / `laberit-provider-block` have zero references anywhere in the uninstall path (`uninstall.ts`, `manifest.ts`, `tracking.ts`, `files.ts`, `reconcile.ts`).

## Gates

- **Architect review:** not required. The change touches none of the 6 boundary categories — it is additive model registration, not a change to any public contract, persistence format, auth surface, deployment topology, data model, or cross-module API.
- **Tests:** no new tests written; rationale recorded in Step 2.
- **Memory:** updated in `docs/ai/logs/2026-10.md`.

## Resolved decisions

1. **Additive-only model registration.** New laberit models are added as sibling entries in the fragment; existing models are never edited or deprecated. Defaults stay on `laberit-ai-preview` / `laberit-ai` unless a separate issue changes them.
2. **No agent-block re-pinning.** The new model is exposed only through explicit `/model` selection. `balanced-laberit-only-agent-block.jsonc` is unchanged, so agents keep their existing laberit models. `docs/ai/architecture.md:19` keeps `laberit/laberit-ai-preview` as its example, which remains valid.
3. **New model appended last** in the `models` map, keeping the diff a pure tail addition and preserving existing relative order.
4. **No automated gate covers `base/opencode/config/**`.** Correctness for provider fragments rests on unit/bats default assertions plus manual inspection. Follow-up candidate: a lint or JSONC-parse gate for that tree.
5. **Dated feasibility reports left unedited.** `docs/ai/reports/toon-feasibility-analysis.md:63` and `toon-feasibility-2026-07-14.md:88` both cite the fragment as "27 lines, 2 models with limits", now 34 lines / 3 models. Treated as point-in-time snapshots.

## Process deviation recorded

This task was planned and executed through the `quickcode` subagent and the `quick-delivery` skill loaded from `.opencode/`. Those surfaces were **removed from source** by Issue #47 (ADR-0038: deleted the `quick` command, `quickcode` agent, `quick-delivery` skill, and quick-code handoff template). `.opencode/` in this repo is stale gitignored generated output that still contains `agent/quickcode.md`, `skills/quick-delivery/`, and `skills/staged-delivery/`; `base/opencode/agents/` contains only `architect`, `code`, `delivery`, `planner`, `research`, `troubleshooter`.

Under ADR-0038 the conformant classification for this scope is `single-task` (which this plan now records) and the conformant route is a single-task plan handed to `code` through the normal `/implement-task` loop. No quick-delivery path exists in current source. The implemented change itself is conformant with Issue #206 and independently verified; only the planning route and vocabulary were non-conformant (ADR-0043 retired "phase" for task/step). Resolving the stale `.opencode/` is deferred to the maintainer's own version update.