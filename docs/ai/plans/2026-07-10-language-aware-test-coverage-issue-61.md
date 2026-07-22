---
status: planned
created: 2026-07-10
phase: 0/3
required_gates:
  test_verdict: false
  memory_update: true
---

# Issue #61 — Language-aware test coverage skill and command

## Goal

Implement a `/check-coverage` skill and command that detects project languages, maintains a registry of coverage tools per language, recommends tools to the user, and — upon user acceptance — generates an ADR and an automation script to run coverage checks.

## Questions

| # | Question | Answer |
|---|----------|--------|
| Q1 | Skill, command, or both? | **Both** — skill provides the workflow intelligence, `/check-coverage` command provides the entry point. Composable with other agents. |
| Q2 | Multi-language projects? | **Analyze each language separately** — not combined coverage. Each language gets its own recommendation. |
| Q3 | What does the system recommend? | **Coverage tools per language** from a built-in registry. Analyzes % of testable code and recommends appropriate libraries. |
| Q4 | Does it install tools? | **No.** Tools are recommended to the user. Installation is the user's responsibility. |
| Q5 | When is the ADR created? | **After user accepts recommendations.** ADR documents which tools were approved and that ai-config helps automate the check, not manage coverage. |
| Q6 | What if a language has no registered tool? | **Recommend opening a GitHub issue** requesting support for that language. |
| Q7 | Onboarding integration? | **No.** Only runs when the user explicitly invokes `/check-coverage`. Not automatic during onboarding. |
| Q8 | Coverage scope? | **Changed files by default**, full coverage only when prompted. |
| Q9 | Custom thresholds? | **Yes** — skill negotiates threshold with user during interaction. Default 80%. |

## Assumptions

- ai-config **does not manage** test coverage — it helps create an automation script.
- The coverage tools registry is a static data file maintained in the repo (extensible via PR or issue).
- Multi-language projects: each language analyzed **separately** with independent recommendations.
- The skill recommends tools; the user decides which to accept.
- ADR is generated only after explicit user acceptance — documents consent and tool selection.
- Unsupported languages prompt the user to open a GitHub issue.
- Coverage scope defaults to **changed files**; full coverage is opt-in.
- Safe execution: avoid unsafe dependency installation, network access, secret exposure, destructive commands.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Multi-phase |
| **Phase budget** | **3 phases** |
| **Phase budget rationale** | Three clearly separable deliverables: (1) data foundation — registry + recommendation algorithm, (2) interface — skill + command, (3) outputs — ADR generation + automation script. Each produces a reviewable artifact. |
| **Quick delivery eligible** | No — requires research, data curation, and multi-file implementation. |
| **Split required** | No — phases are sequential and tightly coupled. |

## Phases

### Phase 1: Coverage Tools Registry and Recommendation Algorithm

**Scope:**

- Create `base/opencode/skills/check-coverage/data/coverage-tools.json` — registry mapping languages to recommended coverage tools, each entry containing:
  - `language` — canonical name (go, python, javascript, typescript, java, rust, csharp, ruby, php, kotlin, swift, etc.)
  - `tool` — recommended tool name
  - `install_command` — how to install (e.g. `go install`, `pip install`, `npm install`)
  - `run_command` — how to run coverage (e.g. `go test -cover`, `pytest --cov`, `npx jest --coverage`)
  - `report_format` — output format (e.g. `coverage.out`, `coverage.xml`, `lcov`)
  - `default_threshold` — default coverage threshold (e.g. 80)
  - `notes` — any caveats or alternatives

- Implement recommendation logic as guidance in the SKILL.md (or a helper script if complexity warrants):
  - Detect all languages present in the project (file extension analysis, config file detection)
  - For each detected language, look up the registry
  - Calculate approximate % of testable code per language (files with tests vs files without)
  - Present recommendations per language: tool name, install command, run command
  - If language not in registry: recommend opening a GitHub issue

**Acceptance criteria:**

- [ ] `coverage-tools.json` exists with entries for at least: Go, Python, JavaScript, TypeScript, Java, Rust, C#
- [ ] Each entry has all required fields (language, tool, install_command, run_command, report_format, default_threshold, notes)
- [ ] Registry is extensible — adding a new language requires only a new JSON entry
- [ ] Language detection identifies all major languages in a multi-language project
- [ ] Recommendation output includes per-language tool name, install command, and run command
- [ ] Unhandled languages produce a "recommend opening an issue" message (not an error)
- [ ] Validation: a sample Go/Python/JS project produces correct per-language recommendations

**Risks:**

| Risk | Mitigation |
|------|------------|
| Registry goes stale | Document how to add new languages; make entries easy to update |
| Language detection false positives | Rely on config files (go.mod, package.json, etc.) over file extensions where possible |
| Tool recommendations become outdated | Include version hints and "check for latest" notes |

### Phase 2: Skill and Command Implementation

**Scope:**

- Create `base/opencode/skills/check-coverage/SKILL.md` — skill definition with:
  - Trigger conditions (`/check-coverage`, mentions of coverage analysis)
  - Workflow steps: detect languages → query registry → present recommendations → negotiate with user → confirm selections → hand off to Phase 3 outputs
  - User interaction protocol: present per-language recommendations, ask which to accept, negotiate threshold if user wants to override default 80%
  - Composability: can be invoked standalone or as part of staged-delivery

- Create `base/opencode/commands/check-coverage.md` — command definition that invokes the skill

**Acceptance criteria:**

- [ ] `SKILL.md` exists with correct frontmatter, trigger description, and concise workflow guidance
- [ ] `check-coverage.md` command exists and invokes the skill
- [ ] Skill detects languages in the current project
- [ ] Skill queries the registry and presents tool recommendations per language
- [ ] Skill negotiates with user: which languages to cover, custom threshold if desired
- [ ] Skill confirms user selections before proceeding to output generation
- [ ] Unsupported languages recommend opening a GitHub issue
- [ ] Skill instructions are concise and follow existing SKILL.md conventions

**Risks:**

| Risk | Mitigation |
|------|------------|
| Skill instructions become verbose | Keep workflow steps concise; defer details to registry data |
| User interaction too complex | Limit to 2-3 decision points: language selection, threshold, confirmation |

### Phase 3: ADR Generation and Automation Script

**Scope:**

- Generate ADR in the consuming repository when user accepts recommendations:
  - ADR documents: which coverage tools were approved, that ai-config helps automate the check (not manage coverage), user consent
  - Follows standard ADR format from `docs/ai/decisions/`

- Generate `check-coverage.sh` (or `.ps1` for Windows) automation script:
  - Runs coverage tools for each approved language
  - Outputs results per language
  - Handles missing tools gracefully (warns, does not crash)
  - POSIX-compatible (or platform-aware)

- ADR generation and script generation are triggered by the skill after user confirmation

**Acceptance criteria:**

- [ ] ADR is generated in `docs/ai/decisions/` with standard format
- [ ] ADR explicitly states ai-config automates the script, does not manage coverage
- [ ] ADR lists approved tools and languages
- [ ] `check-coverage.sh` runs coverage for each approved language
- [ ] Script outputs results per language in readable format
- [ ] Script handles missing tools gracefully (warning, not crash)
- [ ] Script is POSIX-compatible or platform-aware
- [ ] Validation: run script against a multi-language project with at least 2 approved languages

**Risks:**

| Risk | Mitigation |
|------|------------|
| Script portability across OS | Start with POSIX sh; add PowerShell variant if needed |
| ADR format drift | Reference existing ADRs for format consistency |
| Script breaks when tools update | Include version checks and helpful error messages |

## Validation Strategy

| Check | How |
|-------|-----|
| Registry completeness | Review `coverage-tools.json` entries against known coverage tools |
| Language detection | Test against sample multi-language projects |
| Recommendation accuracy | Verify recommendations match registry entries |
| Skill usability | Walk through `/check-coverage` workflow end-to-end |
| Script execution | Run generated script against a test project with coverage tools installed |
| ADR format | Compare generated ADR against existing ADRs in `docs/ai/decisions/` |

## Decisions To Record

| Decision | Value |
|----------|-------|
| Approach | Skill + command (not standalone agent) |
| Registry format | JSON data file in skill directory |
| Language coverage strategy | Language-agnostic with extensibility via registry entries |
| New language support | Add JSON entry to registry; recommend issue if missing |
| ai-config role | Automates script, does not manage coverage |
| ADR trigger | Generated after explicit user acceptance of recommendations |
| Coverage scope default | Changed files; full coverage opt-in |
| Threshold negotiation | During skill interaction, not onboarding |
| Multi-language handling | Each language analyzed and recommended separately |
| Missing tools behavior | Recommend opening GitHub issue (not silent, not error) |
