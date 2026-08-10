---
status: draft
created: 2026-07-14
phase: 1/2
issue: "#86"
---

# TOON Feasibility — Phase 1 Analysis

Intermediate working document. Phase 1 investigation findings for Issue #86.

## 1. File Inventory Classification

### Summary

| Category | Count | Classification |
|----------|-------|----------------|
| Tooling-required JSON (npm, TS) | 9 | **Must stay JSON** |
| Internal tracking file | 1 | **Could migrate to TOON** |
| JSONC config fragments | 10 | **Needs further investigation** |

### 1.1 Must Stay JSON (9 files)

These files are consumed by external tooling (npm, TypeScript, Node.js plugin system) and cannot be migrated.

| File | Reason |
|------|--------|
| `package.json` (root) | Required by npm |
| `package-lock.json` (root) | Required by npm |
| `tsconfig.json` (root) | Required by TypeScript |
| `cli/package.json` | Required by npm |
| `cli/package-lock.json` | Required by npm |
| `cli/tsconfig.json` | Required by TypeScript |
| `base/opencode/plugins/token-counter/package.json` | Required by Node.js plugin system |
| `base/opencode/plugins/session-tracker/package.json` | Required by Node.js plugin system |
| `base/opencode/plugins/ponytail/package.json` | Required by Node.js plugin system |

### 1.2 Could Migrate to TOON (1 file)

| File | Current format | Used by |
|------|---------------|---------|
| `installed-projects.json` | JSON | TS CLI (`JSON.parse`/`JSON.stringify`), legacy bash (`jq`), legacy PowerShell (`ConvertFrom-Json`/`ConvertTo-Json`) |

**Assessment:** This is an internal tracking file with a simple structure: `{schemaVersion, projects[]}`. It contains uniform array data (projects with path, name, version, timestamps) — exactly TOON's sweet spot. However, migrating it requires:

1. TS CLI: Replace `JSON.parse()`/`JSON.stringify()` with `@toon-format/toon` decode/encode
2. Legacy bash: Replace `jq` manipulation with `@toon-format/cli` calls or remove `jq` dependency
3. Legacy PowerShell: Replace `ConvertFrom-Json`/`ConvertTo-Json` with PowerShell-native TOON handling (no official PS library exists)
4. Backward compatibility: Need migration path for existing `installed-projects.json` files

**Estimated effort:** Medium — TS CLI changes are straightforward, but legacy installer changes and backward compatibility add complexity.

### 1.3 Needs Further Investigation (10 files)

All 10 are JSONC config fragment files under `base/opencode/config/`:

**Provider blocks (5):**

| File | Lines | Content |
|------|-------|---------|
| `providers/opencode-provider-block.jsonc` | 3 | Empty models block |
| `providers/openai-provider-block.jsonc` | 16 | 2 models with options |
| `providers/laberit-provider-block.jsonc` | 27 | 2 models with limits |
| `providers/github-copilot-provider-block.jsonc` | 28 | 4 models with options |
| `providers/opencode-go-provider-block.jsonc` | 47 | 13 models with options |

**Agent blocks (5):**

| File | Lines | Content |
|------|-------|---------|
| `agents/balanced-openai-github-copilot-agent-block.jsonc` | 34 | 8 agents with model + steps |
| `agents/balanced-laberit-only-agent-block.jsonc` | 26 | 8 agents with model only |
| `agents/balanced-github-copilot-only-agent-block.jsonc` | 34 | 8 agents with model + steps |
| `agents/balanced-openai-only-agent-block.jsonc` | 34 | 8 agents with model + steps |
| `agents/balanced-opencode-go-only-agent-block.jsonc` | 34 | 8 agents with model + steps |

**Critical finding:** These JSONC fragments are **NOT parsed as JSON objects** by any installer. They are read as **raw text strings** and concatenated into a template to generate `opencode.jsonc`/`kilo.jsonc`.

- TS CLI: `readFragment()` reads raw text, `buildProviderBlockJson()` joins with `,\n`
- Legacy bash: `read_fragment()` reads raw text, `build_provider_block_json()` concatenates
- Legacy PowerShell: `Read-ProviderBlockFragment` reads raw text via `Get-Content -Raw`

The output format (`opencode.jsonc`/`kilo.jsonc`) **must remain JSONC** because OpenCode/Kilo Code runtimes parse it.

**Implication:** Even if fragments were stored as TOON internally, they would need to be converted TOON → JSONC at generation time. This adds a conversion step without any runtime benefit, since the output must be JSONC anyway.

## 2. Upstream Constraint: OpenCode/Kilo Code TOON Support

### Findings

| Question | Answer | Evidence |
|----------|--------|----------|
| Does OpenCode natively support TOON for config files? | **No** | Official docs: config is JSON/JSONC only (`opencode.json`/`opencode.jsonc`) |
| Does Kilo Code natively support TOON for config files? | **No** | Built on OpenCode server; uses `kilo.jsonc` (JSONC format) |
| Is there a TOON plugin for OpenCode? | **Yes, but only for rules/instructions** | `opencode-toon-config-plugin` converts `AGENTS.toon` → system prompt injection |
| Does the TOON plugin affect config file format? | **No** | Uses `experimental.chat.system.transform` hook; config remains JSONC |

### Key Evidence

1. **OpenCode official docs** (opencode.ai/docs/config): "OpenCode uses a JSON config file for customization... supports both JSON and JSONC formats." No mention of TOON.

2. **opencode-toon-config-plugin** README: "TOON is a compact, indentation-based format that encodes the same information as Markdown in fewer tokens. Because OpenCode injects your rules file into the system prompt on every LLM turn, a smaller file saves tokens." — This is about **rules files** (AGENTS.md), not config files.

3. **TOON official documentation** (npm, GitHub): "It's intended for LLM input, not output." and "Think of TOON as a translation layer: use JSON programmatically, convert to TOON for LLM input."

4. **Config format search results**: Every reference to OpenCode/Kilo Code config uses JSON/JSONC. No TOON support anywhere in the config pipeline.

### Conclusion

**OpenCode and Kilo Code do not natively support TOON for configuration files.** The config format is JSON/JSONC. Any TOON migration of config fragments would require a TOON → JSONC conversion step at generation time, adding tooling complexity without any runtime benefit.

## 3. Installer Impact Assessment

### 3.1 TS CLI (Primary Installer)

| Component | Current behavior | Impact of TOON migration |
|-----------|-----------------|------------------------|
| `config-gen.ts` → `readFragment()` | Reads JSONC as raw text string | Would need TOON → JSONC conversion if fragments migrate |
| `config-gen.ts` → `buildProviderBlockJson()` | Joins fragments with `,\n` | No change needed (works on raw text) |
| `tracking.ts` → `trackInstalledProject()` | `JSON.parse()`/`JSON.stringify()` | Would need `decode()`/`encode()` from `@toon-format/toon` |
| `tracking.ts` → `removeTrackingEntry()` | `JSON.parse()` + `splice` + `JSON.stringify()` | Would need TOON decode, array manipulation, TOON encode |
| Test suite | Uses `JSON.parse()` on tracking output | Would need TOON decode for assertions |

**TS CLI effort estimate:**
- Fragment files: Low-Medium (add TOON→JSONC converter for readFragment)
- Tracking file: Medium (replace JSON parse/serialize, update tests)

### 3.2 Legacy Bash Installer

| Component | Current behavior | Impact of TOON migration |
|-----------|-----------------|------------------------|
| `read_fragment()` | Reads file as raw text | No change needed if output stays JSONC |
| `read_agent_fragment()` | Reads file as raw text | No change needed if output stays JSONC |
| `build_provider_block_json()` | Concatenates raw text fragments | No change needed |
| `build_agent_block_json()` | Selects and reads raw text fragment | No change needed |
| `generate_opencode_jsonc_content()` | Template-based JSONC generation | No change needed |
| Tracking (`installed-projects.json`) | Uses `jq` for JSON manipulation | Would need TOON CLI for reading/writing |
| `jq` dependency | Used for tracking file | Could be replaced, but adds TOON CLI dependency |

**Legacy bash effort estimate:**
- Fragment files: None (raw text, no parsing)
- Tracking file: Medium (replace `jq` with TOON CLI calls)
- New dependency: `@toon-format/cli` (adds Node.js requirement to bash installer)

### 3.3 Legacy PowerShell Installer

| Component | Current behavior | Impact of TOON migration |
|-----------|-----------------|------------------------|
| `Read-ProviderBlockFragment()` | `Get-Content -Raw` | No change needed if output stays JSONC |
| `Read-AgentBlockFragment()` | `Get-Content -Raw` | No change needed if output stays JSONC |
| Provider/agent block construction | String concatenation | No change needed |
| Tracking (`installed-projects.json`) | `ConvertFrom-Json`/`ConvertTo-Json` | No PowerShell-native TOON library exists |

**Legacy PowerShell effort estimate:**
- Fragment files: None (raw text, no parsing)
- Tracking file: High (no PowerShell TOON library; would need `pwsh` calling Node.js CLI, or custom parser)
- New dependency: Would require external process call to Node.js/TOON CLI

## 4. External Tool Dependencies

| Tool | Current usage | Needed for TOON? | Status |
|------|--------------|-------------------|--------|
| `jq` | Legacy bash: tracking file manipulation | Could be replaced by TOON CLI | Available but adds Node.js dep |
| `gh` | Shared task operations | Not affected | N/A |
| `npm`/`npx` | Package management, CLI execution | Would be used to install `@toon-format/toon`/`@toon-format/cli` | Available |
| OpenCode runtime | Reads `opencode.jsonc`/`kilo.jsonc` | Config must stay JSONC | No TOON support |
| Node.js | TS CLI runtime | Required for `@toon-format/toon` SDK | Available |

## 5. TOON Tooling Evaluation

### 5.1 SDK Availability

| Package | Version | Dependencies | TypeScript | Status |
|---------|---------|-------------|------------|--------|
| `@toon-format/toon` | 2.3.0 | 0 | Yes (built-in types) | Active, 412 dependents, MIT |
| `@toon-format/cli` | — | — | — | Available via `npx @toon-format/cli` |
| `@toon-format/spec` | 3.0.3 | 0 | N/A | Active, MIT |

### 5.2 Round-Trip Reliability

TOON is described as "lossless, drop-in representation of the JSON data model." The npm docs confirm: "TOON is fully reversible with JSON. You can convert JSON→TOON→JSON with zero data loss."

However, the TOON README explicitly notes limitations:
- "For deeply nested or non-uniform data, JSON may be more efficient."
- TOON's sweet spot is "uniform arrays of objects" — not deeply nested configs.

The JSONC fragment files contain nested objects (providers → models → options), which are NOT TOON's sweet spot. The `installed-projects.json` file with its `projects[]` array IS a good fit.

### 5.3 Parsing Overhead

| Operation | JSON | TOON |
|-----------|------|------|
| Parse | `JSON.parse()` (native, fast) | `decode()` (external lib, slower) |
| Serialize | `JSON.stringify()` (native, fast) | `encode()` (external lib, slower) |
| File size | Baseline | Similar for small files |
| Token count | Baseline | 30-60% fewer (for LLM input) |

**Key insight:** The token savings only matter when data is sent to an LLM. For config fragments that are read as text and embedded in JSONC output, there is no token benefit. For `installed-projects.json` which is never sent to an LLM, there is no token benefit either.

### 5.4 Tooling Maturity

- **Strengths:** Active project (24.9k GitHub stars), MIT license, 0 dependencies, TypeScript SDK with types, CLI tool, specification v3.3, conformance tests
- **Weaknesses:** No PowerShell library, no Bash-native library (requires Node.js), still described as "an idea in progress" in official docs

## 6. Effort Estimates by Category

| Category | Files | Effort | Risk | Token Savings |
|----------|-------|--------|------|---------------|
| Tooling-required JSON | 9 | N/A | N/A | N/A |
| `installed-projects.json` | 1 | Medium | Medium (backward compat, 3 installers) | None (never sent to LLM) |
| JSONC config fragments | 10 | Low-Medium | High (output must stay JSONC, adds conversion step) | None (output is JSONC) |

## 7. Key Findings

1. **No upstream TOON support for config files.** OpenCode/Kilo Code require JSON/JSONC for `opencode.jsonc`/`kilo.jsonc`. Any TOON migration of source fragments requires a TOON → JSONC conversion step at generation time.

2. **Config fragments are read as raw text, not parsed as JSON.** All three installers (TS CLI, legacy bash, legacy PowerShell) read fragment files as raw text strings and concatenate them. The JSONC structure is never programmatically inspected.

3. **Token savings are irrelevant for this use case.** TOON's value proposition is reducing tokens when data is sent to an LLM. Config fragments are embedded in JSONC output files that are parsed by OpenCode/Kilo Code, not sent to LLMs. `installed-projects.json` is never sent to an LLM either.

4. **Legacy PowerShell installer has no TOON library.** Migrating `installed-projects.json` would require either a custom PowerShell TOON parser or calling the Node.js TOON CLI from PowerShell — adding complexity to an already-deprecated installer.

5. **TOON's sweet spot doesn't match this repo's data.** The JSONC fragments contain nested objects (provider → models → options), which TOON's own docs acknowledge may not be more efficient than JSON.

6. **The `opencode-toon-config-plugin` demonstrates TOON's intended use:** converting Markdown rules files (AGENTS.md) to TOON for system prompt injection — not config files.

## 8. Preliminary Recommendation Direction

Based on Phase 1 findings, the investigation suggests **"do not adopt"** or at most **"adopt partially"** (limited to `installed-projects.json` if the token-tracking use case justifies it). The JSONC config fragments should remain JSONC because:
- The output format must be JSONC (upstream constraint)
- Fragments are read as raw text (no parsing benefit)
- No token savings in the current pipeline
- Adds conversion complexity to all three installers

Phase 2 will formalize this into the structured feasibility report with clear rationale.

---

*This document is an intermediate working artifact. It will be superseded by the final report at `docs/ai/reports/toon-feasibility-2026-07-14.md` in Phase 2.*
