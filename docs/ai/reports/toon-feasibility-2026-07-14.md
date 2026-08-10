---
status: final
created: 2026-07-14
issue: "#86"
resolution: "do not adopt"
---

# TOON Feasibility Report

**Issue:** [#86](https://github.com/Macacoders/ai-config/issues/86)
**Date:** 2026-07-14
**Author:** AI-assisted research (planner → delivery)
**Status:** Final

---

## Executive Summary

TOON (Token-Oriented Object Notation) is a compact, indentation-based format designed to reduce token count when data is sent to LLMs. This report evaluates whether TOON can replace JSON/JSONC in the `ai-config` repository across 20 candidate files.

**Recommendation: Do not adopt TOON.**

The investigation found that:

1. **No upstream TOON support exists.** OpenCode and Kilo Code require JSON/JSONC for configuration files (`opencode.jsonc`/`kilo.jsonc`). There is no plugin, hook, or runtime path that accepts TOON config input.

2. **Token savings are irrelevant.** TOON's value proposition is reducing tokens sent to LLMs. In this repository, JSON/JSONC files are either parsed by tooling (npm, TypeScript, Node.js) or read as raw text and embedded into JSONC output. None of the candidate files are sent to LLMs.

3. **Config fragments are read as raw text, not parsed as data.** All three installers (TS CLI, legacy bash, legacy PowerShell) read JSONC fragment files as raw text strings and concatenate them. The JSON structure is never inspected. Migrating these to TOON would add a TOON→JSONC conversion step with no benefit.

4. **The only partial candidate has no token value.** `installed-projects.json` is an internal tracking file that could theoretically use TOON's "uniform arrays" strength, but it is never sent to an LLM — so token savings are zero, while migration cost is medium (3 installers, backward compatibility, no PowerShell library).

**Estimated migration cost if adopted:** Medium-High (TS CLI + legacy bash + legacy PowerShell changes, new dependencies, backward compatibility for existing installs, TOON→JSONC conversion for fragments).
**Estimated benefit:** Zero token savings in the current pipeline.

---

## File Inventory

### Summary

| Category | Count | Recommendation | Rationale |
|----------|-------|----------------|-----------|
| Tooling-required JSON (npm, TS, Node.js) | 9 | **Must stay JSON** | External tooling mandates JSON |
| Internal tracking file | 1 | **Do not migrate** | No token benefit; medium effort; backward compat risk |
| JSONC config fragments | 10 | **Must stay JSONC** | Output is JSONC; fragments read as raw text |
| **Total** | **20** | **No migration** | — |

### Tooling-Required JSON (9 files) — No Migration

| File | Consumer | Reason |
|------|----------|--------|
| `package.json` (root) | npm | Required by npm specification |
| `package-lock.json` (root) | npm | Required by npm specification |
| `tsconfig.json` (root) | TypeScript | Required by TypeScript compiler |
| `cli/package.json` | npm | Required by npm specification |
| `cli/package-lock.json` | npm | Required by npm specification |
| `cli/tsconfig.json` | TypeScript | Required by TypeScript compiler |
| `base/opencode/plugins/token-counter/package.json` | Node.js plugin runtime | Plugin system reads package.json |
| `base/opencode/plugins/session-tracker/package.json` | Node.js plugin runtime | Plugin system reads package.json |
| `base/opencode/plugins/ponytail/package.json` | Node.js plugin runtime | Plugin system reads package.json |

**Assessment:** These files are consumed by external tools (npm, TypeScript, Node.js) that only accept JSON. TOON support would require upstream changes in those projects, which is outside our control.

### Internal Tracking File (1 file) — Do Not Migrate

| File | Current Format | Used By |
|------|---------------|---------|
| `installed-projects.json` | JSON | TS CLI (`JSON.parse`/`JSON.stringify`), legacy bash (`jq`), legacy PowerShell (`ConvertFrom-Json`/`ConvertTo-Json`) |

**Structure:** `{schemaVersion, projects[]}` — array of objects with path, name, version, timestamps.

**Why not migrate:**
- This file is never sent to an LLM. Token savings are zero.
- Migration requires changes across 3 installer implementations (TS CLI, legacy bash, legacy PowerShell).
- No PowerShell TOON library exists — would require calling Node.js CLI from PowerShell or writing a custom parser.
- Backward compatibility is required for existing `installed-projects.json` files in user repositories.
- Migration cost is Medium; benefit is Zero.

### JSONC Config Fragments (10 files) — Do Not Migrate

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

**Why not migrate:**
- These files are read as **raw text strings** by all three installers. The JSONC structure is never programmatically parsed.
- The output files (`opencode.jsonc`/`kilo.jsonc`) **must remain JSONC** because OpenCode/Kilo Code runtimes parse them.
- Migrating fragments to TOON would require a TOON→JSONC conversion step at generation time, adding complexity without benefit.
- TOON's own documentation acknowledges that "deeply nested or non-uniform data" may not be more efficient than JSON. Provider blocks contain nested `provider → models → options` structures.
- Token savings are irrelevant because the output is consumed by OpenCode (a program), not an LLM.

---

## Upstream Constraint Analysis

### Does OpenCode natively support TOON for config files?

| Question | Answer | Evidence |
|----------|--------|----------|
| OpenCode config format | JSON/JSONC only | Official docs: "OpenCode uses a JSON config file... supports both JSON and JSONC formats" |
| Kilo Code config format | JSON/JSONC only | Built on OpenCode server; uses `kilo.jsonc` |
| TOON support in config pipeline | None | No documentation, GitHub issues, or code references |
| `opencode-toon-config-plugin` | Rules files only | Converts `AGENTS.toon` → system prompt injection via `experimental.chat.system.transform`; does NOT affect config file format |

### Key Evidence

1. **OpenCode official documentation** (opencode.ai/docs/config): Configuration uses JSON/JSONC. No mention of TOON anywhere in the config pipeline.

2. **opencode-toon-config-plugin**: This plugin demonstrates TOON's intended use in the OpenCode ecosystem — converting Markdown rules files to TOON for token-efficient system prompt injection. It explicitly does not touch config file format.

3. **TOON official documentation**: "It's intended for LLM input, not output." and "Think of TOON as a translation layer: use JSON programmatically, convert to TOON for LLM input." This confirms TOON is designed for LLM-facing data, not tooling-facing config files.

### Conclusion

OpenCode and Kilo Code do not support TOON for configuration files. The runtime requirement for JSON/JSONC is a hard constraint that cannot be worked around without upstream changes.

---

## Installer Impact Assessment

### TS CLI (Primary Installer)

| Component | Current Behavior | Impact of TOON Migration |
|-----------|-----------------|--------------------------|
| `config-gen.ts` → `readFragment()` | Reads JSONC as raw text | No change needed (raw text) |
| `config-gen.ts` → `buildProviderBlockJson()` | Joins fragments with `,\n` | No change needed (raw text) |
| `tracking.ts` → `trackInstalledProject()` | `JSON.parse()`/`JSON.stringify()` | Would need `decode()`/`encode()` from `@toon-format/toon` |
| `tracking.ts` → `removeTrackingEntry()` | `JSON.parse()` + `splice` + `JSON.stringify()` | Would need TOON decode, array manipulation, TOON encode |
| Test suite | Uses `JSON.parse()` on tracking output | Would need TOON decode for assertions |
| New dependency | — | `@toon-format/toon` package |

**TS CLI effort:** Low-Medium for fragments (add conversion), Medium for tracking file (replace parse/serialize + update tests).

### Legacy Bash Installer

| Component | Current Behavior | Impact of TOON Migration |
|-----------|-----------------|--------------------------|
| `read_fragment()` / `read_agent_fragment()` | Reads file as raw text | No change needed |
| `build_provider_block_json()` / `build_agent_block_json()` | Concatenates raw text | No change needed |
| Tracking (`installed-projects.json`) | Uses `jq` for JSON manipulation | Would need `@toon-format/cli` or replace `jq` |
| `jq` dependency | Used for tracking file | Could be replaced, but adds Node.js requirement |

**Legacy bash effort:** None for fragments; Medium for tracking file (replace `jq` with TOON CLI, adding Node.js dependency to bash installer).

### Legacy PowerShell Installer

| Component | Current Behavior | Impact of TOON Migration |
|-----------|-----------------|--------------------------|
| `Read-ProviderBlockFragment()` / `Read-AgentBlockFragment()` | `Get-Content -Raw` | No change needed |
| Provider/agent block construction | String concatenation | No change needed |
| Tracking (`installed-projects.json`) | `ConvertFrom-Json`/`ConvertTo-Json` | **No PowerShell TOON library exists** |

**Legacy PowerShell effort:** None for fragments; **High** for tracking file — no PowerShell TOON library. Would require either a custom parser or calling Node.js TOON CLI from PowerShell via `pwsh`/`Start-Process`. This adds an external process dependency to an already-deprecated installer.

---

## TOON Tooling Evaluation

### SDK Availability

| Package | Version | Dependencies | TypeScript | License | Status |
|---------|---------|-------------|------------|---------|--------|
| `@toon-format/toon` | 2.3.0 | 0 | Built-in types | MIT | Active (412 dependents) |
| `@toon-format/cli` | — | — | — | — | Available via `npx` |
| `@toon-format/spec` | 3.0.3 | 0 | N/A | MIT | Active |

### Round-Trip Reliability

TOON is described as "lossless, drop-in representation of the JSON data model." The npm docs confirm: "TOON is fully reversible with JSON. You can convert JSON→TOON→JSON with zero data loss."

### Parsing Overhead

| Operation | JSON | TOON |
|-----------|------|------|
| Parse | `JSON.parse()` (native, V8-optimized) | `decode()` (external lib) |
| Serialize | `JSON.stringify()` (native, V8-optimized) | `encode()` (external lib) |
| File size | Baseline | Similar for small files |
| Token count | Baseline | 30-60% fewer (for LLM input only) |

### Tooling Strengths

- Active project (24.9k GitHub stars)
- MIT license, 0 dependencies
- TypeScript SDK with built-in types
- CLI tool available
- Specification v3.3 with conformance tests
- Lossless round-trip with JSON

### Tooling Limitations

- No PowerShell library
- No Bash-native library (requires Node.js)
- Still described as "an idea in progress" in official docs
- TOON's own docs: "For deeply nested or non-uniform data, JSON may be more efficient"

### Token Savings Analysis

| Data Flow | TOON Token Savings? | Explanation |
|-----------|---------------------|-------------|
| Config fragments → JSONC output | **No** | Output is JSONC, parsed by OpenCode runtime (not LLM) |
| `installed-projects.json` → installer | **No** | Internal tracking, never sent to LLM |
| Any file → LLM system prompt | **Yes** | TOON's intended use case — but no candidate files flow to LLMs |

**Conclusion:** The token savings that TOON provides have no applicability to any file in this repository's pipeline.

---

## Effort Estimates

| Category | Files | Migration Effort | Ongoing Cost | Token Benefit | Recommendation |
|----------|-------|-----------------|--------------|---------------|----------------|
| Tooling-required JSON | 9 | N/A (not possible) | N/A | N/A | Must stay JSON |
| `installed-projects.json` | 1 | Medium (3 installers, backward compat) | Low | Zero | Do not migrate |
| JSONC config fragments | 10 | Low-Medium (add TOON→JSONC converter) | Low-Medium (conversion step) | Zero | Do not migrate |
| **Total migration** | **20** | **Medium-High** | **Medium** | **Zero** | **Do not adopt** |

### Detailed Effort Breakdown

| Change | Effort | Risk |
|--------|--------|------|
| Add `@toon-format/toon` to TS CLI deps | Low | Low |
| Modify `tracking.ts` parse/serialize | Medium | Medium (backward compat) |
| Update tracking tests | Low | Low |
| Add TOON→JSONC converter for fragments | Low-Medium | Medium (unnecessary complexity) |
| Replace `jq` with TOON CLI in bash installer | Medium | Medium (adds Node.js dep to bash) |
| Add TOON support to PowerShell installer | High | High (no PS library, external process) |
| Migration path for existing `installed-projects.json` | Medium | Medium (user impact) |
| **Total** | **Medium-High** | **Medium-High** |

---

## Feasibility Recommendation

### **Do Not Adopt TOON**

**Rationale:**

1. **Zero benefit in this repository's pipeline.** TOON's value proposition is reducing tokens when data is sent to LLMs. None of the 20 candidate files flow to LLMs. Config fragments are embedded in JSONC output files consumed by OpenCode/Kilo Code (programs, not LLMs). `installed-projects.json` is internal tracking, never LLM-facing.

2. **Hard upstream constraint.** OpenCode and Kilo Code require JSON/JSONC for configuration files. There is no plugin, hook, or configuration path that accepts TOON. Any migration would require TOON→JSONC conversion at generation time, adding complexity for no benefit.

3. **Config fragments are read as raw text.** All three installers read JSONC fragment files as raw text strings. The JSON structure is never parsed. TOON migration would change the storage format while the access pattern remains "read as text" — a pure overhead change with no functional improvement.

4. **Migration cost exceeds any conceivable benefit.** Medium-High effort across 3 installers, new dependencies, backward compatibility handling, and ongoing conversion overhead — all to achieve zero token savings.

5. **Tooling gaps.** No PowerShell TOON library exists. Migrating `installed-projects.json` would require either a custom parser or calling Node.js from PowerShell, adding complexity to an already-deprecated installer.

### When TOON Would Make Sense

TOON adoption in this repository would become worth reconsidering if:

- OpenCode/Kilo Code add native TOON config file support
- A file in this repository's pipeline becomes LLM-facing (e.g., config data sent as context to an agent)
- The `installed-projects.json` file becomes large enough that token count matters (currently <1KB)
- PowerShell TOON library becomes available, reducing migration friction

---

## Related ADRs

- **ADR-0011** (tokenizer selection): Existing tokenizer decision; TOON is orthogonal
- **ADR-0018** (TS plugin migration analysis): Similar feasibility analysis pattern for a different technology

---

*Generated by Phase 2 of Issue #86. See `docs/ai/reports/toon-feasibility-analysis.md` for intermediate Phase 1 findings.*
