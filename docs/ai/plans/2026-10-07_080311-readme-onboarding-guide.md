---
status: completed
created: 2026-10-07
task: 4/4
required_gates:
  architect_review: false
  memory_update: true
---

# README onboarding guide Implementation plan

**Goal:** Make the root `README.md` the single onboarding entry point that takes a new human user from install through provider connection, runtime install, generated-file review, `/init` repository onboarding, GitHub App authentication for `/issue`, and the main workflows.

**Architecture:** Documentation-only change confined to root `README.md`. No CLI, source template, new skill, or new command changes. The guide reuses behavior that already exists: OpenCode's built-in `/connect` (provider credentials), ai-config's `/init` command (`base/opencode/commands/init.md`, which scaffolds `docs/ai/` memory and generates/improves root `AGENTS.md`), and the GitHub App Device Flow auth in `base/opencode/skills/shared-task/scripts/gh-app-auth.ts`. Existing mermaid workflow diagrams are retained; a `/memory` section is added in the same style.

**Tech Stack:** Markdown with Mermaid flowcharts rendered by GitHub.

**Scope classification:** `multi-task`

**Source of intent:** Issue #58 scope-update comment (2026-10-07), extended in conversation with the GitHub-authentication requirement. Supersedes the original `/tutorial`-skill proposal and removes staged-vs-quick delivery framing.

**Documentation constraints (apply to every task):**
- Audience is **human users** of ai-config setting it up in their repositories. The root `README.md` is their single entry point.
- Keep it **concise, step-by-step, and command-focused**; prefer short numbered steps over prose.
- Do **not** add a new skill or command, and do not duplicate deep docs — link to `docs/ai/README.md`, `AGENTS.md`, and upstream OpenCode docs.
- Never commit secrets; `.gh-config/` is gitignored.

**Task budget rationale:** Four separable user milestones — model/providers setup, `/init` onboarding, GitHub App auth for `/issue`, and workflow coverage — each independently reviewable and all confined to one file. Four exceeds the preferred three, justified by the distinct, user-facing nature of the GitHub-auth requirement; below the 6-task confirmation threshold.

## Tasks

### Task 1: Document the set-up path (connect providers, install runtime, review generated files)

**Objective:** README explains, in order, how to connect model providers, install the ai-config runtime into a repo, and review the generated artifacts.

**Files:**
- Modify: `README.md` (the `## Install` region and a new getting-started framing)
- Validate: `README.md`

**Step 1: Establish expected behaviour**

The README must present a numbered getting-started flow covering points 1–4 of the issue:
1. Install the CLI (already present in `## Install` — keep and fold into the flow).
2. Connect providers via `/connect` in the TUI, then select a model with `/models`; credentials are stored by OpenCode outside the repo and provider IDs must match `enabled_providers`/the `provider` block in `opencode.jsonc`.
3. Run `ai-config install --repo <path> --providers ...` (existing table + "Use from source" content retained).
4. Review generated files: `opencode.jsonc` (generated runtime config: schema, enabled providers, `default_agent`, plugins) and `.ai-config-managed` (manifest listing managed paths, with a `project_id` header) — explain both are generated/managed and must not be hand-edited.
No staged/quick delivery terminology anywhere.

**Step 2: Add or update validation**

Agent-run checks after editing:
- `rg -n "quick|staged" README.md` → no matches.
- `rg -n "/connect" README.md` → present.
- `rg -n "opencode\.jsonc" README.md` and `rg -n "\.ai-config-managed" README.md` → present.
- `test -f RELEASE.md CHANGELOG.md docs/ai/README.md AGENTS.md` → exit 0.
- Cross-check wording against this repo's live `.ai-config-managed` and `opencode.jsonc` (read-only reference for accurate field names).

**Step 3: Write minimal implementation**

Edit `README.md`:
- Reframe `## Install` so the one-shot installer, `ai-config install`, and the new provider step read as one ordered flow.
- Add a provider-connection step: run `/connect` (TUI), pick the provider, authenticate (API key/OAuth); run `/models` to pick a model. Link to the OpenCode providers doc (`https://opencode.ai/docs/providers`).
- Add a generated-files step describing `opencode.jsonc` and `.ai-config-managed`, noting they are managed output (not source) and are refreshed with `--force`.
- Keep prose command-first and progressively disclosed; link to deeper docs rather than duplicating them.

**Step 4: Run test to verify pass**

Run: the Step 2 commands.
Expected: no `quick`/`staged` matches; `/connect`, `opencode.jsonc`, `.ai-config-managed` all present; referenced files exist.

**Step 5: Commit**

`git add README.md`
`git commit -m "docs: add README set-up path for providers and generated files (Issue #58)"`

**Human validation (owner: human):** Render the README on GitHub and run through the install/connect steps in a scratch repository to confirm the instructions match the files actually produced. Agents must not execute this.

### Task 2: Document `/init` repository onboarding

**Objective:** README explains how to onboard a repository with `/init`, including the existing-`AGENTS.md` case.

**Files:**
- Modify: `README.md` (new `/init` onboarding step/subsection)
- Validate: `README.md`

**Step 1: Establish expected behaviour**

`/init` onboarding is documented, matching `base/opencode/commands/init.md`:
- `/init` is ai-config's overridden command and initializes **both** durable `docs/ai/` memory (architecture, decisions, logs, plans) and the root `AGENTS.md`.
- It generates `AGENTS.md` from the `base/AGENTS.md` placeholder template.
- If `AGENTS.md` already exists with useful content, `/init` improves it in place rather than replacing it.
- Keep the `## Contribute` note that agents must not merge changes to `base/opencode` markdown without a PR — retained.

**Step 2: Add or update validation**

Agent-run checks after editing:
- `rg -n "/init" README.md` → present.
- `rg -n "AGENTS\.md" README.md` → present, with the existing-file case described.
- `rg -n "docs/ai" README.md` → present in the `/init` passage.
- `test -f base/opencode/commands/init.md` → exit 0 (source of truth referenced).

**Step 3: Write minimal implementation**

Add an onboarding step/subsection after the install steps: run `/init` from the repo root; describe that it initializes `docs/ai/` memory **and** generates `AGENTS.md`; state the existing-`AGENTS.md` behaviour (improve in place). Link to `docs/ai/README.md` and `AGENTS.md`. Keep it brief — one short passage.

**Step 4: Run test to verify pass**

Run: the Step 2 commands.
Expected: `/init`, `AGENTS.md`, and `docs/ai` documented; `init.md` exists.

**Step 5: Commit**

`git add README.md`
`git commit -m "docs: document /init repository onboarding in README (Issue #58)"`

**Human validation (owner: human):** Render on GitHub and confirm the `/init` description matches the command's actual behavior when run in an un-onboarded repo. Agents must not execute this.

### Task 3: Document GitHub App authentication for the `/issue` workflow

**Objective:** README explains how to create and configure GitHub authentication end to end so `/issue` works — not just what `.gh-config/app.yml` contains.

**Files:**
- Modify: `README.md` (new GitHub-authentication subsection)
- Validate: `README.md`

**Step 1: Establish expected behaviour**

A distinct section documents the full setup, grounded in `gh-app-auth.ts` and `cli/src/commands/install.ts`:
- Create a GitHub App at `https://github.com/settings/apps` → **New GitHub App**.
- Permissions: **Issues (Read & Write)** and **Pull Requests (Read & Write)**.
- Under "Identifying and authorizing users", enable **Device Flow**.
- Install the app on the target repository/organization.
- Capture the **Client ID** (as shown by GitHub; modern IDs look like `Iv23li…` — do not hard-code "Iv1").
- Supply the Client ID by one of: `ai-config install --gh-app-client-id <client-id>` (writes `.gh-config/app.yml`), the `GH_APP_CLIENT_ID` env var, or a hand-created `.gh-config/app.yml` with `client_id:`.
- State explicitly that `.gh-config/app.yml` alone is insufficient — it only stores the Client ID; the app must be created, permissioned, installed, and then authorized.
- First `/issue` use triggers a one-time browser device authorization; the token is cached at `.gh-config/github-token.json` (mode `0600`) and refreshed silently.
- `GH_CONFIG_DIR` overrides the config location; the repo-local `.gh-config/` directory is gitignored and must never be committed.
- Headless/CI: set `GITHUB_TOKEN` (or `GH_TOKEN`), which takes precedence over the device flow.

**Step 2: Add or update validation**

Agent-run checks after editing:
- `rg -n "gh-app-client-id|GH_APP_CLIENT_ID|GH_CONFIG_DIR|GITHUB_TOKEN" README.md` → present.
- `rg -n "Device Flow" README.md` → present.
- `rg -n "\.gh-config" README.md` → present.
- `test -f .gh-config/app.yml base/opencode/skills/shared-task/scripts/gh-app-auth.ts` → exit 0.
- Cross-check claims against `gh-app-auth.ts`: `getConfigDir()` (env → `.gh-config` → `~/.config/opencode`), `getClientId()` precedence, token path, and `getValidToken()` precedence (`GITHUB_TOKEN` → `GH_TOKEN` → device flow).
- `rg -n "Iv1\b" README.md` → absent or explicitly qualified, since newer Client IDs start with `Iv23li`.

**Step 3: Write minimal implementation**

Add a concise, numbered "GitHub authentication for `/issue`" subsection (place it in setup, before or beside the `/issue` workflow): app creation, permissions, Device Flow, install, Client ID, the config options, first-use authorization, and the CI override. Link to `base/opencode/skills/shared-task/SKILL.md` for helper operations rather than restating them. Do not document secrets or paste real tokens.

**Step 4: Run test to verify pass**

Run: the Step 2 commands.
Expected: all required terms present and consistent with the auth script; no stale `Iv1`-only claim.

**Step 5: Commit**

`git add README.md`
`git commit -m "docs: document GitHub App auth setup for /issue (Issue #58)"`

**Human validation (owner: human):** Create a GitHub App following the README, install it on a scratch repo, and run `/issue check` to confirm the device flow and token cache work as described. Agents must not execute this (interactive browser + external GitHub).

### Task 4: Complete workflow coverage and add `/memory`, then verify the whole guide

**Objective:** `/issue`, `/intent`, `/plan`, the delivery loop, and `/memory` are all documented, and the full guide is free of stale references with diagrams intact.

**Files:**
- Modify: `README.md` (add `### /memory`; adjust the "four workflows" intro line)
- Validate: `README.md`

**Step 1: Establish expected behaviour**

- A `### /memory` subsection exists alongside `### /intent`, `### /plan`, `### /issue`, and the delivery loop.
- The intro line describing the number/kind of workflows matches the sections present.
- All pre-existing mermaid diagrams (`/intent`, `/plan`, `/issue`, delivery loop) remain.
- No staged/quick delivery references.

**Step 2: Add or update validation**

Agent-run checks after editing:
- `rg -n "^### \`/(intent|plan|issue|memory)\`" README.md` → all four headings present.
- `rg -n "Delivery loop" README.md` → present.
- `rg -c "mermaid" README.md` → count ≥ 5 (existing four plus the memory section).
- `rg -n "quick|staged" README.md` → no matches.
- `rg -n "/connect|/init|gh-app-client-id|/memory|opencode\.jsonc|\.ai-config-managed" README.md` → confirms the full onboarding scope survived editing.

**Step 3: Write minimal implementation**

Add a `### /memory` section in the same style as neighbors: `/memory` finds, checks, and updates durable `docs/ai/` memory with low-token routing (supported intents: `find`, `check`, `update`), owned by `planner`. Add a small mermaid diagram consistent with the existing color scheme (planner = blue). Adjust the intro sentence on the current line ~60 to include memory. Do not remove or alter existing diagrams.

**Step 4: Run test to verify pass**

Run: the Step 2 commands.
Expected: four workflow headings plus delivery loop; mermaid count ≥ 5; no `quick`/`staged`; all onboarding terms present.

**Step 5: Commit**

`git add README.md`
`git commit -m "docs: document /memory workflow in README (Issue #58)"`

**Human validation (owner: human):** Render on GitHub and confirm every mermaid diagram renders without errors and the guide reads correctly end to end. Agents must not execute this.

## Out of scope

- New `/tutorial` or onboarding skill/command.
- Staged-vs-quick delivery guidance.
- Changes to `cli/**`, `base/opencode/**`, `gh-issue.ts`, `gh-app-auth.ts`, or generated `.opencode/**` — documentation only.
- Installing the guide into consuming repositories (this is the human-facing root `README.md` only).

## Verification summary

- **Agent validations:** the `rg`/`test -f` checks in each task, run from the repo root.
- **Human validations:** GitHub rendering plus a scratch-repo walkthrough of install/connect, `/init`, and the GitHub App device flow; required in Tasks 1–4.
- **No automated CI check covers README content** (`make check` only lints `cli/src`), so human review is the primary gate.
