---
status: completed
created: 2026-08-31
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: true
---

# Add `troubleshooter` chat agent for command-first diagnostics

## Goal

Add a new `mode: primary` chat agent named `troubleshooter`, defined in
`base/opencode/agents/troubleshooter.md`, that gives users command-first, safe
diagnostic troubleshooting guidance. Wire it consistently into the install
surface (auto-discovered agent + mandatory `agents.yml` permissions + provider
agent-block model assignment), and document when users should choose it over
`planner`/`code`.

Repository root: `C:\DEV\ai-config`

## Context

Issue #57 requests a chat-oriented troubleshooting agent that prioritizes safe,
non-destructive diagnostic commands over speculative edits or broad
implementation plans. This repo is the source-of-truth: consumable agents live
under `base/opencode/agents/` and are installed into target repos as generated
`.opencode/agents/**`. No `troubleshoot*` reference exists today.

### Key installer facts (verified)

- The installer auto-discovers agents: `syncAgentsTreeWithPermissions` iterates
  every `.md` under `base/opencode/agents/`. There is **no** explicit agent
  registration list to update.
- `renderAgentPermissionBlock` **throws / exits** if an agent has no entry in
  `base/opencode/permissions/agents.yml` — so the `troubleshooter:` permission
  entry is **mandatory** or installs break (ADR-0014, ADR-0036).
- Per-agent model overrides live in the generated `opencode.jsonc` `agent`
  section, sourced from `base/opencode/config/agents/balanced-*.jsonc`
  provider blocks (ADR-0013: agent blocks define only `model` + `steps`).
  Agent `.md` frontmatter carries `mode` only, **no** `model`.
- `default_agent` stays `planner`; `troubleshooter` is opt-in via `/troubleshooter`.
- Top-level `"model"` / `"small_model"` defaults are assigned at install level;
  `troubleshooter` gets `default model` by being assigned the provider's main
  model in each non-free-tier block (matching how other agents are configured).

## Decisions (locked)

- **Agent id / file:** `troubleshooter` → `base/opencode/agents/troubleshooter.md`.
- **Mode:** `mode: primary`, reachable via `/troubleshooter`; **not** the default
  agent (`default_agent` remains `planner`).
- **Model:** default model (no per-agent frontmatter override; assigned the
  provider's main model in the non-free-tier provider agent blocks).
- **Permissions** (`agents.yml`, ADR-0036 coarse model — read-mostly diagnostics
  agent, matching the `research`/`test` category): `read: allow`, `edit: ask`,
  `bash "*": allow` + deny-list (`"sudo*"`, `"rm -rf*"`, `"git push --force*"`,
  `"git push -f*"` = `deny`), `external_directory "*": deny` + `"/tmp/**": allow`,
  `task: deny`.
- **Provider agent blocks** (ADR-0013, only `model`+`steps`):
  - Add `troubleshooter` with the provider's default/main model + a chat-
    appropriate `steps` to: `balanced-openai-only`, `balanced-github-copilot-only`,
    `balanced-opencode-go-only`, `balanced-openai-github-copilot`.
  - Add `troubleshooter` with `model` **only** (no `steps`) to
    `balanced-laberit-only` (matches that block's existing style).
  - `free-tier-agent-block.jsonc`: **no change** (stays empty — free-tier
    intentionally assigns no per-agent model; `troubleshooter` falls back to the
    top-level default like all other agents).
- **Architect review:** NOT required — adding an agent definition is an internal
  workflow-surface addition, not one of the 6 boundary categories (public
  contract, persistence, auth/security, deployment topology, data model,
  cross-module API). `architect.md` also explicitly says not to invoke it merely
  because a change touches documentation.
- **No new tests:** config- and docs-only change; validation via dry-run installs.

## Assumptions

- All edits stay in `C:\DEV\ai-config`; never edit gitignored generated `.opencode/`.
- `troubleshooter` follows the existing agent Markdown contract (YAML frontmatter
  `description`/`mode` + body, references `base/opencode/agents/references/invariants.md`).
- Doc surface: `docs/ai/architecture.md` Agent Topology update + brief usage
  guidance (when to use over planner/code).
- A new ADR records the durable topology addition + conventions.

## Phases

### Phase 1: Add `troubleshooter` chat agent + wire install, model blocks, docs (1/1)

**Scope / files to touch:**

1. `base/opencode/agents/troubleshooter.md` (new) — `mode: primary`, `description`
   for `/troubleshooter`, per repo agent contract. Body must require **command-first**
   responses (smallest useful command first; explain what each command proves;
   branch on expected output), promote non-destructive local checks (status, logs,
   syntax checks, tests, env, process, targeted repro), and enforce safety rules
   (no destructive commands, credential dumps, broad filesystem scans, or
   state-mutating commands without explicit approval + risk explanation). Reference
   the shared invariants file.
2. `base/opencode/permissions/agents.yml` — add `troubleshooter:` block per the
   locked ADR-0036 coarse model above (mandatory; installer exits if missing).
3. Provider agent blocks under `base/opencode/config/agents/`:
   - `balanced-openai-only-agent-block.jsonc` — add `troubleshooter` (main model,
     e.g. `openai/gpt-5.5`, + `steps`).
   - `balanced-github-copilot-only-agent-block.jsonc` — add (main model
     `github-copilot/gpt-5.4`, + `steps`).
   - `balanced-opencode-go-only-agent-block.jsonc` — add (main model
     `opencode-go/deepseek-v4-pro`, + `steps`).
   - `balanced-openai-github-copilot-agent-block.jsonc` — add (main model, + `steps`).
   - `balanced-laberit-only-agent-block.jsonc` — add with `model` only (no `steps`).
   - `free-tier-agent-block.jsonc` — **no change**.
4. `docs/ai/architecture.md` — add `troubleshooter` to the **Agent Topology** section.
5. Brief usage documentation explaining when to choose `troubleshooter` over
   `planner`/`code` (in the agent doc + architecture note).

**Acceptance criteria (from issue #57):**

- [ ] A new chat-oriented troubleshoot agent is defined under `base/opencode/agents/`
      (`troubleshooter.md`).
- [ ] Prompt guidelines require command-first responses for troubleshooting scenarios.
- [ ] The agent explains what each diagnostic command is intended to confirm or rule out.
- [ ] Safety guidance prevents destructive commands, secret exposure, and unnecessary
      state changes.
- [ ] Configuration/template surfaces are updated so the agent can be installed
      consistently (`agents.yml` + provider blocks; verified via dry-run installs).
- [ ] Documentation briefly explains when users should choose this agent instead of
      planner/code agents.

**Risks:**

- Missing `agents.yml` entry breaks installs (renderer exits). Mitigated by making
  the entry part of the same phase + validating with dry-run installs.
- Broad `bash "*": allow` on a "diagnostics" agent could run destructive commands;
  mitigated by the standard deny-list, `edit: ask`, `external_directory` deny, and
  explicit safety rules in the prompt.

## Validation Strategy

- Multi-provider **dry-run** installs into temp target repos, confirming discovery,
  permissions injection, provider agent-block rendering, and no missing-permissions
  exit:
  - `npx tsx cli/src/index.ts install --repo <tmp> --providers free-tier --dry-run`
  - `npx tsx cli/src/index.ts install --repo <tmp> --providers openai --dry-run`
  - `npx tsx cli/src/index.ts install --repo <tmp> --providers github-copilot --dry-run`
  - `npx tsx cli/src/index.ts install --repo <tmp> --providers laberit --dry-run`
  - `npx tsx cli/src/index.ts install --repo <tmp> --providers opencode-go --dry-run`
- Inspect the generated temp `.opencode/agents/troubleshooter.md` for correctly
  rendered frontmatter + injected permissions.
- `make check-node` (lint/type-check for `cli/src/`) — unaffected by config/markdown
  changes but cheap to confirm nothing regressed.
- **No new tests** (config- and docs-only; dry-run installs cover the regression
  risk).

## Decisions To Record

- New **ADR**: "Add `troubleshooter` chat agent for command-first diagnostics".
  Records: new `mode: primary`, non-default/opt-in agent; default model; provider
  agent-block model assignment (ADR-0013 style); mandatory `agents.yml` permission
  entry (ADR-0014/0036); auto-discovery via installer; no `architect` boundary
  review required.
- `docs/ai/architecture.md` Agent Topology update (in-phase).

## Follow-ups

- Phase 1 is the single phase; on completion set frontmatter `status: completed`
  and `phase: 1/1`.
- Provide a concise commit message (e.g. `feat: add troubleshoot-assistant chat agent (#57)`)
  but do not commit unless explicitly requested.
