---
status: planned
created: 2026-11-02
updated: 2026-11-02
task: 0/7
sequence: future
depends_on:
  - 2026-10-22_171638-issue-226-opencode-v2-runtime.md
blocked_by: Kilo Code V2 release (upstream)
deferred_until: Kilo Code ships a V2 runtime/plugin API
issue: 277
required_gates:
  architect_review: true
  memory_update: true
---

# Kilo Code V2 migration (deferred, upstream-blocked)

> **Blocked upstream. Do not implement yet.**
> Kilo Code V2 has not shipped as of 2026-11-02. This is a deferred outline, not an executable plan. Start only after Kilo publishes a V2 runtime/plugin API and every item in the trigger checklist below passes. Tracked by GitHub issue #277.

**Goal:** When Kilo Code V2 ships, make `--runtime kilocode` emit native Kilo V2 artifacts - or a version-gated V1/V2 path, depending on Kilo's release policy - while keeping the `.agents/` artifact layout, the `.kilo` pointers, and the shared agent/command/skill content unchanged.

**Architecture:** Reuse the runtime descriptor introduced by Issue #226 Plan A. `RUNTIME_SHAPES.kilocode` already isolates the config filename, schema URL, top-level keys, plugin entries, and minimum major, so the migration should mostly change that descriptor plus a Kilo version detector, config/permission emission, and plugin entrypoints. Reuse the OpenCode V2 permission renderer and plugin entrypoints if Kilo V2's API matches; add a Kilo-specific adapter only where the runtime contract actually differs. Do not fork the workflow content or create a second artifact tree.

**Tech Stack:** TypeScript, Node.js >= 18, Commander, fs-extra, vitest, `ajv` 8 (draft 2020-12), `make check`.

**Scope classification:** `multi-task` (seven outlined tasks). When this outline is expanded, confirm the task budget with the user before implementation handoff.

## Status and trigger checklist

Start re-planning only when all of these are true:

1. Kilo Code V2 is publicly released with documentation and a stable version number.
2. The V2 config schema URL and native top-level keys are documented and fetchable.
3. The plugin API shape is documented: `Plugin.define`-style or a Kilo-specific API; local plugin resolution rules (directory + `exports` vs direct file entry); whether V1 plugins still load.
4. The permission model and action names are documented (`shell`/`subagent` vs Kilo-specific names).
5. Discovery paths for agents, commands, skills, and plugins are documented, including whether `.kilo/agents` and `.kilo/commands` pointers are still followed.
6. The minimum supported Kilo major is known, and the maintainer has decided whether Kilo 7.8.x V1 installs remain supported during a deprecation window.
7. Issue #226 Plan B has landed; PR #274's plugin set and PR #255's agent set are resolved or explicitly out of scope; the next free ADR number is verified (ADR-0049 is reserved for OpenCode V2, so this plan likely uses ADR-0050).
8. Human validation hosts are available for the target Kilo V2 version and, if applicable, Kilo 7.8.x V1.

If any item is unknown, stop and re-plan rather than assuming OpenCode V2 parity.

## Decisions to make at re-plan time

1. **V2-only vs version-gated dual path.** Recommendation: follow the OpenCode precedent - `--runtime kilocode` means Kilo V2 only, with a Kilo major preflight - unless Kilo V2 has a long overlap period or breaks the shipped plugins. A dual V1/V2 path requires version detection, two config shapes, and two plugin entrypoint sets; only adopt it if Kilo's support policy requires it.
2. **Permission parity.** Determine whether Kilo V2 uses the same `{ action, resource, effect }` rules and action names as OpenCode V2. If it does, reuse `renderAgentPermissionRules`; if not, add a mapping table rather than duplicating the renderer.
3. **Plugin API parity.** Determine whether the OpenCode V2 `Plugin.define` entrypoints load unchanged in Kilo V2. If they do, reuse them and keep one V2 entrypoint per plugin. If Kilo needs a different API, add a Kilo adapter entrypoint; do not force a single module to serve both APIs at load time.
4. **Version override variable.** Decide whether to use `WAYFORGE_KILOCODE_VERSION`, a generic `WAYFORGE_RUNTIME_VERSION`, or a CLI flag as the offline/CI escape hatch. Mirror `WAYFORGE_OPENCODE_VERSION` unless a generic variable is clearly better.
5. **Config filename and schema.** Confirm whether V2 still uses `kilo.jsonc` and `https://app.kilo.ai/config.json`, or whether Kilo publishes a new filename/schema. Do not infer V2 support from the current hybrid `app.kilo.ai` document.
6. **Deprecation policy.** Decide whether to keep a Kilo V1 snapshot mode for one release, and how stale V1 configs are regenerated.

## Deferred task outline

> Expand each task into the five-step contract only after the trigger checklist passes. Do not implement from this outline.

### Task 1: Verify and record the Kilo V2 runtime contract

**Objective:** Replace assumptions with verified evidence before changing any artifact.

**Work outline:**

- Read Kilo V2 release notes, config docs, plugin docs, and permission docs.
- Fetch and inspect the V2 config schema; record its `$id`, external refs, and native keys.
- Probe a scratch install: config discovery, agent/command/skill discovery, `.kilo` pointer traversal, plugin loading, and permission semantics.
- Update `docs/compatibility-matrix.md` with the Kilo V2 column and evidence (host, version, commands, output).
- Write a research brief or ADR input that distinguishes verified facts from unresolved questions.

**Acceptance:** The maintainer can answer every trigger-checklist item without guessing; unresolved items block the remaining tasks.

### Task 2: Update `RUNTIME_SHAPES.kilocode` for V2 and extend descriptor tests

**Objective:** Make the Kilo descriptor express the verified V2 config shape.

**Files:** `cli/src/lib/layout.ts`, `cli/tests/unit/layout-shapes.test.ts`.

**Acceptance outline:**

- `configFile`, `schemaUrl`, `keys`, `pluginEntries`, and `minimumOpenCodeMajor` match the verified Kilo V2 contract.
- If V2 requires plugin directories, `pluginEntries` are directories; if it still accepts files, keep files and document it.
- Descriptor tests cover every field, plugin-entry form, and the Kilo minimum major.
- If a dual V1/V2 path is chosen, the descriptor model is extended deliberately (for example a version-keyed shape map) rather than adding scattered conditionals.

### Task 3: Add the Kilo V2 version preflight and CLI help

**Objective:** Reject an unsupported Kilo major before install mutation, mirroring the OpenCode gate.

**Files:** `cli/src/lib/runtime-version.ts` (generalize or add Kilo detection), `cli/src/commands/install.ts`, `cli/src/index.ts`, unit/integration tests.

**Acceptance outline:**

- If V2-only: `--runtime kilocode` reads `WAYFORGE_KILOCODE_VERSION` or runs `kilo --version`/the verified binary; a major below the Kilo V2 minimum fails before `initManagedManifest`, including under `--dry-run`.
- Missing/unparsable output follows the same agreed policy as OpenCode (warn and assume V2) unless the Kilo contract justifies fail-closed; document the choice.
- `--runtime opencode` behavior is unchanged.
- CLI help names the Kilo V2 requirement and any V1 deprecation window.
- A negative dry-run test proves no `.wayforge-managed`, `.agents`, pointers, or config are written on failure.

### Task 4: Generate native Kilo V2 config and define the V1 policy

**Objective:** Emit the verified Kilo V2 config shape while preserving or deliberately deprecating V1.

**Files:** `cli/src/lib/config-gen.ts`, `cli/tests/unit/config-gen.test.ts`, schema fixture if Kilo publishes a distinct schema.

**Acceptance outline:**

- Kilo V2 output contains the verified native keys, plugin entries, permission section, and skills path.
- Every supported provider/model sample validates against the Kilo V2 schema (vendored offline if a distinct schema exists).
- If V2-only: the V1-shaped Kilo output is removed and a stale-V1-config regeneration test proves an upgrade rewrites it.
- If dual path: the V1 output is pinned by a snapshot and remains available for the supported overlap.
- `enabled_providers`, `model`, `small_model`, `default_agent`, and `share` behavior matches the verified V2 contract.

### Task 5: Render Kilo V2 permissions and settle `temperature`

**Objective:** Emit Kilo V2 permission frontmatter and remove or retain agent fields according to the V2 contract.

**Files:** `cli/src/lib/permissions.ts`, `cli/src/commands/install.ts`, `base/agents/*.md`, `cli/tests/unit/permissions.test.ts`.

**Acceptance outline:**

- If Kilo V2 uses the OpenCode V2 model, reuse the ordered rule renderer and verify Kilo's accepted action names.
- If it differs, add a Kilo-specific mapping table with tests for every action and ordering rule.
- Kilo V1 output is preserved only if the dual-path decision requires it.
- `temperature` is removed if Kilo V2 rejects it, or retained only if the verified V2 contract supports it. Do not guess.
- Frontmatter replacement strips old V1 and V2 permission blocks before inserting the new one.

### Task 6: Add Kilo V2 plugin entrypoints or adapters and validate the plugin set

**Objective:** Make every shipped plugin load under Kilo V2 without breaking the chosen V1 policy.

**Files:** `base/plugins/*`, plugin `package.json` files, `cli/tests/unit/plugin-entries.test.ts`.

**Acceptance outline:**

- If Kilo V2 is API-compatible with OpenCode V2, reuse the V2 entrypoints and verify they load; keep the V1 `main` only if the dual path requires it.
- If not, add Kilo-specific entrypoints/adapters with stable IDs and no load-time import of the wrong SDK.
- Package metadata matches the verified resolution rules (`main`, `exports`, peers).
- Plugin-entry tests assert every configured path exists, the entry form is correct for Kilo V2, and no V1 entrypoint imports the V2 SDK.
- Include `wayforge-update` if #274 has merged.
- Human smoke test: install into a scratch repo with Kilo V2 and confirm every shipped plugin loads and its commands/tools work.

### Task 7: Thread the descriptor through install/update, add integration tests, and record the decision

**Objective:** Prove the migration end to end and record the Kilo V2 compatibility contract.

**Files:** `cli/src/commands/install.ts`, `cli/src/commands/interactive.ts`, `cli/tests/helpers/install.ts`, `cli/tests/integration/`, `docs/ai/decisions/ADR-00XX-*.md`, `docs/ai/architecture.md`, `docs/compatibility-matrix.md`, `README.md`, `CHANGELOG.md`, `docs/ai/logs/YYYY-MM.md`.

**Acceptance outline:**

- A fresh Kilo V2 install writes the verified config, agent frontmatter, `.kilo` pointers, and plugin entries.
- A second install is idempotent.
- A stale Kilo V1 config is regenerated on upgrade according to the chosen policy.
- A Kilo major below the minimum exits before mutation.
- `--runtime opencode` is unchanged.
- The ADR records the Kilo V2 decision, the V1 policy/deprecation window, the plugin API choice, the permission mapping, the schema snapshot procedure, and the human validation evidence.
- `make check` is green and the compatibility matrix names the verified Kilo V2 version.

## Out of scope

- Implementing anything before Kilo Code V2 ships.
- Changing OpenCode behavior or reopening Issue #226 Plan A/Plan B.
- Inferring Kilo V2 support from the current `app.kilo.ai` schema or from OpenCode V2 parity without evidence.
- Migrating consuming repositories' already-committed Kilo configs in place beyond managed-config regeneration.
- Pi runtime work.
- New agents, commands, skills, or workflow features unrelated to Kilo V2.

## Risks and assumptions

- **Kilo V2 may diverge from OpenCode V2.** Plugin API, permission names, discovery paths, and config schema may differ. Do not assume parity; verify each surface.
- **Kilo may keep V1 compatibility for a long window.** A hard V2-only break could strand users on Kilo 7.8.x. Decide the deprecation policy from Kilo's actual support contract.
- **`.kilo` pointer behavior is unverified for V2.** #253 verified the pointers with Kilo 7.8.17 only. If V2 stops following them, the fallback is a generated stub or a new runtime-specific pointer; that reopens #227's "no duplication" rule.
- **Plugin resolution may differ.** Directory + `exports` is an OpenCode V2 rule; Kilo V2 may use a different mechanism. Confirm before changing package metadata.
- **Schema drift.** If Kilo publishes a distinct V2 schema, vendor it with the same one-transform discipline as the OpenCode fixture and record the refresh procedure.
- **ADR collision.** ADR-0049 is reserved for OpenCode V2. Re-verify the next free number when this plan is expanded; do not assume ADR-0050 is still free.
- **Issue/dependency drift.** #255, #274, and any new runtime work may land before Kilo V2. Re-read the open PR queue and issue state at re-plan time.

## References

- GitHub issue: <https://github.com/Macacoders/wayforge/issues/277>
- OpenCode V2 foundation (Plan A): `docs/ai/plans/2026-11-02_141731-issue-226-plan-a-opencode-v2-foundation.md`
- OpenCode V2 migration (Plan B, deferred): `docs/ai/plans/2026-10-22_171638-issue-226-opencode-v2-runtime.md`
- `.agents/` layout decision: `docs/ai/decisions/ADR-0046-generic-agents-artifact-directory.md`
- Runtime compatibility matrix: `docs/compatibility-matrix.md`
- OpenCode V2 upstream docs: <https://opencode.ai/v2/docs/>
