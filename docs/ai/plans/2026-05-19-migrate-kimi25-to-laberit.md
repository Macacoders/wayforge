# Plan: Migrate kimi25 Provider to laberit

**Date:** 2026-05-19  
**Issue:** #30  
**Status:** Completed  
**Claimed by:** PKCPablo

## Goal

Migrate all configuration from `kimi25` provider to new `laberit` provider across environment files, generated configuration, installation scripts, and documentation.

## Context

The kimi25 provider is being deprecated and needs to be replaced with the laberit provider which offers two models:
- `laberit-ai` (stable, 131072 context, 16384 output)
- `laberit-ai-preview` (preview, 262144 context, 16384 output)

Environment variables change from `KIMI_*` to `OPENAI_*`:
- Remove `KIMI_API_VERSION`
- Rename `KIMI_API_KEY` → `OPENAI_API_KEY`
- Rename `KIMI_BASE_URL` → `OPENAI_BASE_URL`

## Agent Model Distribution Decision

| Agent | Model | Rationale |
|-------|-------|-----------|
| **planner** | `laberit/laberit-ai-preview` | Large context (262K) for complex planning |
| **research** | `laberit/laberit-ai-preview` | Large context (262K) for repository onboarding |
| **code** | `laberit/laberit-ai` | Stable for reliable implementation |
| **quickcode** | `laberit/laberit-ai` | Stable for quick edits |
| **test** | `laberit/laberit-ai-preview` | Large context for comprehensive regression review |
| **taskanalyst** | `laberit/laberit-ai` | Stable for task analysis |

**Decision rationale:** Preview model (larger context) goes to agents that need to analyze large amounts of information: planner (complex plans), research (entire codebases), and test (comprehensive regression analysis). Stable model goes to agents focused on reliable output: code, quickcode, and taskanalyst.

## Phase 1: Core Configuration Files

**Status:** ✅ Complete  
**Files:** `profiles/defaults.env.example`, `opencode.jsonc`

### Changes Required

#### profiles/defaults.env.example
Replace KIMI_* variables with OPENAI_*:
```bash
# Remove: KIMI_API_VERSION
# Rename: KIMI_API_KEY → OPENAI_API_KEY
# Rename: KIMI_BASE_URL → OPENAI_BASE_URL
# Update placeholders to laberit values
```

#### opencode.jsonc
- `enabled_providers`: `["kimi25"]` → `["laberit"]`
- `model`: `"kimi25/Kimi-K2.5"` → `"laberit/laberit-ai-preview"`
- `small_model`: `"kimi25/Kimi-K2.5"` → `"laberit/laberit-ai"`
- Update all 6 agent models per distribution table
- Replace `provider.kimi25` block with `provider.laberit`:
  - `npm`: `@ai-sdk/openai-compatible`
  - `baseURL`: `{env:OPENAI_BASE_URL}`
  - `apiKey`: `{env:OPENAI_API_KEY}`
  - `headers.api-key`: `{env:OPENAI_API_KEY}`
  - **Remove:** `queryParams.api-version` (not needed for laberit)
  - Two models with limits: `laberit-ai` and `laberit-ai-preview`

### Acceptance Criteria

- [ ] `profiles/defaults.env.example` has `OPENAI_API_KEY` and `OPENAI_BASE_URL` (no `KIMI_API_VERSION`)
- [ ] `profiles/defaults.env.example` uses laberit placeholder values
- [ ] `opencode.jsonc` has `enabled_providers: ["laberit"]`
- [ ] `opencode.jsonc` global model: `laberit/laberit-ai-preview`
- [ ] `opencode.jsonc` small_model: `laberit/laberit-ai`
- [ ] All 6 agent models follow the distribution table
- [ ] `opencode.jsonc` provider section has `laberit` with two models (correct context/output limits)
- [ ] Provider configuration uses `{env:OPENAI_API_KEY}` and `{env:OPENAI_BASE_URL}`
- [ ] No `queryParams` or `api-version` references

---

## Phase 2: Bootstrap Installers

**Status:** ✅ Complete  
**Files:** `install/bootstrap.sh`, `install/bootstrap.ps1`

### Changes Required

Replace `kimi25` provider logic with `laberit` in both scripts:
- Provider option: `kimi25` → `laberit`
- Update provider block generation with laberit configuration (two models)
- Update agent block generation with model distribution
- Update default model logic when laberit is sole provider
- Replace KIMI_* env vars with OPENAI_* (remove api-version)
- Update help text and error messages

### Acceptance Criteria

- [ ] `bootstrap.sh` supports `laberit` provider option
- [ ] `bootstrap.sh` generates correct laberit provider block with two models
- [ ] `bootstrap.sh` uses agent model distribution per table
- [ ] `bootstrap.sh` uses `laberit/laberit-ai-preview` as default model
- [ ] `bootstrap.sh` uses `laberit/laberit-ai` as default small_model
- [ ] `bootstrap.ps1` matches all `bootstrap.sh` functionality
- [ ] Both scripts reference `OPENAI_BASE_URL` and `OPENAI_API_KEY`
- [ ] Help text updated to show `laberit` instead of `kimi25`
- [ ] No `queryParams` or `api-version` references remain

---

## Phase 3: Documentation Updates

**Status:** ✅ Complete  
**Files:** `README.md`, `docs/ai/architecture.md`, `docs/ai/decisions/ADR-0008-modular-opencode-provider-installs.md`

### Changes Required

- Replace all `kimi25` references with `laberit`
- Update environment variable references from `KIMI_*` to `OPENAI_*`
- Update provider examples and installation commands
- Update agent model table in README.md
- Update architecture.md provider boundary section
- Update ADR-0008 provider list and environment variables

### Acceptance Criteria

- [ ] `README.md` provider examples show `laberit` instead of `kimi25`
- [ ] `README.md` model switching section updated
- [ ] `README.md` environment variables section shows `OPENAI_*`
- [ ] `README.md` agent table updated with laberit models
- [ ] `docs/ai/architecture.md` provider boundary section updated
- [ ] `docs/ai/architecture.md` environment variables updated
- [ ] `ADR-0008` provider list includes `laberit`
- [ ] `ADR-0008` environment variables section updated
- [ ] `ADR-0008` no longer mentions `KIMI_API_VERSION`

---

## Risks

- Incorrect JSON structure in opencode.jsonc could break OpenCode
- Bootstrap scripts must stay synchronized between .sh and .ps1
- Documentation must remain consistent with implementation

## Validation Strategy

After each phase:
1. Run syntax validation on JSON files (`opencode.jsonc`)
2. Verify script syntax (`bash -n` for .sh, PowerShell parsing for .ps1)
3. Check git diff to confirm expected changes
4. Verify agent model distribution matches specification

## Related

- Issue #30
- ADR-0008: Modular OpenCode Provider Installs

---

## Completion Summary

**Completed:** 2026-05-19

**All phases completed successfully:**
- ✅ Phase 1: Core Configuration Files (`profiles/defaults.env.example`, `opencode.jsonc`)
- ✅ Phase 2: Bootstrap Installers (`install/bootstrap.sh`, `install/bootstrap.ps1`)
- ✅ Phase 3: Documentation Updates (`README.md`, `architecture.md`, `ADR-0008`)

**Files modified:**
1. `profiles/defaults.env.example` - Environment variables migrated from KIMI_* to OPENAI_*
2. `opencode.jsonc` - Provider configuration migrated to laberit
3. `install/bootstrap.sh` - Installer updated to generate laberit config
4. `install/bootstrap.ps1` - PowerShell installer updated to match
5. `README.md` - Documentation updated with laberit references
6. `docs/ai/architecture.md` - Architecture docs updated
7. `docs/ai/decisions/ADR-0008-modular-opencode-provider-installs.md` - Decision record updated

**Next step:** Update GitHub Issue #30 with completion summary and close.
