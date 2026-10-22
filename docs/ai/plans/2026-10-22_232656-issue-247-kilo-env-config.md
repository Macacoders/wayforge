---
status: completed
created: 2026-10-22
task: 2/2
required_gates:
  architect_review: true
  memory_update: true
---

# Unify laberit env handling across OpenCode and Kilo (Issue #247) Implementation plan

**Goal:** Make `--providers laberit` emit one env-driven provider block that works in both OpenCode and Kilo, and that Kilo 7.8.x accepts without `{env:}` in project config.

**Architecture:** Use a single laberit fragment for all runtimes with `env: ["OPENAI_API_KEY"]` and `baseURL: "${OPENAI_BASE_URL}"`. Both OpenCode and Kilo read the API key from the process environment through `provider.env`, and both substitute `${VAR}` inside `baseURL` when building the provider SDK. The generated config contains no `{env:}` and no `{file:}`, so no runtime-specific transform and no global config edit are needed.

**Tech Stack:** JSONC provider fragment, TypeScript CLI (`cli/src/lib/config-gen.ts` reads fragments verbatim), Vitest, OpenCode 1.19.2 and Kilo 7.8.15 for runtime validation.

**Scope classification:** `multi-task`

## Verified facts

Repository state: `develop` at `69baecb`, clean working tree.

- `base/opencode/config/providers/laberit-provider-block.jsonc:5-6` currently emits `{env:OPENAI_BASE_URL}` and `{env:OPENAI_API_KEY}`.
- `cli/src/lib/config-gen.ts:79-83` appends that fragment for every runtime, so kilocode+laberit currently writes an invalid `kilo.jsonc`.
- Only the laberit fragment uses `{env:}`; no generated fragment uses `{file:}`.
- Kilo 7.8.15 source (`v7.8.15` tag) confirms:
  - `ConfigProviderV1.Info` accepts `env: string[]` and `options.baseURL`.
  - Config-defined providers use `env: provider.env ?? existing?.env ?? []`.
  - The provider loader reads those env names from `process.env` and, when exactly one name is present, sets the provider key.
  - `resolveSDK` replaces `${VAR}` inside `baseURL` with the process environment value, then injects `provider.key` as `apiKey` when `options.apiKey` is absent.
  - Untrusted project config rejects `{env:}` but does not reject `provider.env` or `${VAR}`.
- OpenCode 1.19.2 source (`anomalyco/opencode` dev) has the same mechanism:
  - The provider config schema accepts `env: string[]`, `options.apiKey`, and `options.baseURL`.
  - Config providers contribute `provider.env`; the loader reads those names from the environment and assigns the key when exactly one name is present.
  - `resolveSDK` replaces `${VAR}` inside `baseURL` and injects `provider.key` when `options.apiKey` is absent.
  - Project config may use both `env` + `${VAR}` and `{env:}`.
- Runtime validation on Kilo 7.8.15 with the proposed config:
  - `kilo config check` printed `No config warnings.` and exited `0`.
  - `kilo debug config` showed the laberit provider with `env: ["OPENAI_API_KEY"]` and `baseURL: "${OPENAI_BASE_URL}"`.
  - A local HTTP server captured `POST /v1/chat/completions` with `Authorization: Bearer test-key-123`, proving both the `${OPENAI_BASE_URL}` substitution and the `OPENAI_API_KEY` injection.
  - Control config using `{env:OPENAI_BASE_URL}` failed with `environment references are not allowed in project config`, confirming the guard is active in 7.8.15.
- Runtime validation on OpenCode 1.19.2 with the same config:
  - A local HTTP server captured `POST /v1/chat/completions` with `Authorization: Bearer opencode-test-key-789`, proving the same `env` + `${OPENAI_BASE_URL}` form works without changes.
- `install/legacy/bootstrap-legacy.sh:329-335` reads the same laberit fragment. Changing the fragment propagates to the frozen legacy installers without editing their scripts. Legacy script edits remain out of scope.

## Decisions and constraints

- Use one runtime-agnostic laberit fragment. Delete the need for a kilocode-specific transform; `buildProviderBlockJson` continues to read the fragment verbatim for both runtimes.
- `provider.env` must contain exactly one name (`OPENAI_API_KEY`). Both runtimes only assign `provider.key` when `provider.env.length === 1`; adding `OPENAI_BASE_URL` there would silently drop the API key.
- Both variables must be present in the process environment. A project `.env` file was not picked up by Kilo 7.8.15 or OpenCode 1.19.2 in validation; users must set shell or system environment variables before launching the runtime.
- If an environment variable is missing, `${VAR}` remains a literal placeholder and the request fails. This differs from the old `{env:}` behavior, which substituted an empty string. Documentation must say both variables are required.
- This intentionally changes OpenCode laberit output from `{env:...}` to `env` + `${VAR}`. Both formats work in OpenCode, but the unified form is the one Kilo accepts.
- Risk to record: Kilo could tighten project-level `provider.env` handling in a future release because it is an env-reading path. The documented fallback is trusted global config (`~/.config/kilo/kilo.jsonc` with `{env:...}`). The architect review gate should confirm the trust-boundary trade-off is acceptable.
- The issue's separate findings about `.opencode/` scanning and `opencode.jsonc` precedence are out of scope.

## Tasks

### Task 1: Unify the laberit provider fragment and add regression tests

**Objective:** Emit the same `env` + `${OPENAI_BASE_URL}` laberit block for OpenCode and Kilo, with tests covering both runtimes and all provider combinations.

**Files:**
- Modify: `base/opencode/config/providers/laberit-provider-block.jsonc:1-10` (`options` block)
- Modify: `cli/tests/unit/config-gen.test.ts` (`buildProviderBlockJson`, `generateOpenCodeJsonc`)
- Validate: `cli/tests/unit/config-gen.test.ts`

**Step 1: Establish expected behaviour**

For both `runtime === 'opencode'` and `runtime === 'kilocode'`, the laberit provider block must contain:

```jsonc
"laberit": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "Laberit AI",
  "env": ["OPENAI_API_KEY"],
  "options": {
    "baseURL": "${OPENAI_BASE_URL}",
    "headers": {
      "Content-Type": "application/json"
    }
  },
  "models": { "...": "..." }
}
```

The block must not contain `{env:` or `{file:}`. The three laberit models must remain unchanged:

- `laberit-ai-preview`
- `laberit-ai`
- `laberit-gpt-5.6-luna`

The OpenCode and kilocode laberit blocks must be identical because both read the same fragment.

**Step 2: Add or update validation**

Update `cli/tests/unit/config-gen.test.ts`:

- For each runtime (`opencode`, `kilocode`), `buildProviderBlockJson(['laberit'], runtime, sourceDir)` contains `"env": ["OPENAI_API_KEY"]` and `"${OPENAI_BASE_URL}"`, and does not contain `{env:` or `{file:`.
- Assert the `env` array has exactly one element. This guards the `provider.env.length === 1` key-injection invariant shared by both runtimes.
- Assert both runtimes produce identical laberit block text.
- Assert all three laberit model keys are present.
- For each runtime, `generateOpenCodeJsonc(makeOpts(runtime, ['laberit']))` contains no `{env:` / `{file:}` and parses as JSON after removing the generated header comment.
- Add a table-driven case over provider combinations for both runtimes (`openai`, `github-copilot`, `laberit`, `opencode-go`, `openai,laberit`, `openai,github-copilot`, `openai,github-copilot,laberit`) asserting no `{env:` / `{file:}` in the full generated content.
- Keep existing model/default assertions unchanged.

**Step 3: Write minimal implementation**

- Edit `base/opencode/config/providers/laberit-provider-block.jsonc`:
  - add `"env": ["OPENAI_API_KEY"],` after `"name": "Laberit AI",`;
  - change `"baseURL": "{env:OPENAI_BASE_URL}"` to `"baseURL": "${OPENAI_BASE_URL}"`;
  - remove the `"apiKey": "{env:OPENAI_API_KEY}",` line.
- Do not change `cli/src/lib/config-gen.ts`; it already reads the fragment for both runtimes. Do not add a runtime branch.
- Do not change the laberit model list or headers.
- Add a short JSONC comment only if the fragment format already supports comments and the surrounding fragments use them; otherwise keep the fragment comment-free and document the invariant in the test.

**Step 4: Run test to verify pass**

Run:

```bash
npx vitest run cli/tests/unit/config-gen.test.ts
make check
```

Expected: the targeted unit tests pass; `make check` passes typecheck, lint, format, and duplication. Both runtimes emit `env` + `${OPENAI_BASE_URL}` and no `{env:` / `{file:}`.

**Step 5: Commit**

```bash
git add base/opencode/config/providers/laberit-provider-block.jsonc cli/tests/unit/config-gen.test.ts
git commit -m "fix(laberit): unify env-based provider config for OpenCode and Kilo (Issue #247)"
```

### Task 2: Document the unified env contract and record the decision

**Objective:** Explain that both runtimes use the same `env` + `${OPENAI_BASE_URL}` form, how users set both variables, and what to do if Kilo tightens the rule.

**Files:**
- Modify: `README.md` (install/runtime guidance, around the `wfg install` section)
- Modify: `docs/ai/architecture.md:14`
- Modify: `docs/ai/logs/2026-10.md` (memory update)
- Validate: rendered Markdown and `git diff --check`

**Step 1: Establish expected behaviour**

The documentation must state:

- Both OpenCode and Kilo use `env: ["OPENAI_API_KEY"]` and `baseURL: "${OPENAI_BASE_URL}"` for laberit.
- Kilo treats a project-level `kilo.jsonc` as untrusted and rejects active `{env:VAR}` references; the unified form avoids that guard.
- Users must set both variables in the process environment before launching either runtime. A project `.env` file was not picked up in validation.
- Example:

```bash
export OPENAI_BASE_URL="https://<laberit-endpoint>/v1"
export OPENAI_API_KEY="<laberit-key>"
```

- For Kilo, run `kilo config check` after setting the variables. It validates the config shape but not the presence of the variables.
- If a future Kilo release stops honoring project-level `provider.env`, the fallback is to put the laberit `options` with `{env:...}` in the trusted global `~/.config/kilo/kilo.jsonc` and keep only provider/model metadata in the project config.
- Existing installs that used `{env:}` in OpenCode will switch to the unified form on the next `--force` regeneration; the environment variable names do not change.

**Step 2: Add or update documentation**

- Add a concise subsection under the install/runtime guidance in `README.md`; do not restructure the existing getting-started flow.
- Update `docs/ai/architecture.md:14` to describe the unified `env` + `${VAR}` form and the Kilo trusted-config fallback.
- Add a `docs/ai/logs/2026-10.md` entry after implementation, recording Issue #247, the unified approach, the OpenCode 1.19.2 and Kilo 7.8.15 evidence, and the fallback risk.

**Step 3: Validate the documentation**

Run:

```bash
git diff --check
```

Expected: no whitespace errors. Review the rendered Markdown for correct code fences and no contradictory claims about `{env:}`.

**Step 4: Human validation**

Owner: human. On a machine with the real Laberit endpoint, validate both runtimes:

```bash
wfg install --repo <opencode-temp> --runtime opencode --providers laberit
wfg install --repo <kilo-temp> --runtime kilocode --providers laberit
export OPENAI_BASE_URL="https://<laberit-endpoint>/v1"
export OPENAI_API_KEY="<laberit-key>"

cd <opencode-temp>
opencode run --model laberit/laberit-ai-preview "say ok"

cd <kilo-temp>
kilo config check
kilo debug config
kilo run --model laberit/laberit-ai-preview "say ok"
```

Expected: both runtimes send requests to the configured Laberit endpoint with the API key; `kilo config check` reports no config warnings; `kilo debug config` shows `env: ["OPENAI_API_KEY"]` and `${OPENAI_BASE_URL}`. Do not run this validation as an agent because it needs external credentials.

**Step 5: Commit**

```bash
git add README.md docs/ai/architecture.md docs/ai/logs/2026-10.md
git commit -m "docs: document unified laberit env configuration (Issue #247)"
```

## Out of scope

- Editing frozen legacy installers under `install/legacy/**`; they will emit the new fragment automatically because they read the same source file.
- Fixing Kilo's `.opencode/` scanning behavior or `opencode.jsonc` precedence (separate issue findings).
- The OpenCode V2 migration (#226).
- Writing to the user's global Kilo configuration from the installer.
