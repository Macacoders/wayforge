# ADR-0008: Use Modular OpenCode Sources With Provider-Selectable Generated Installs

Date: 2026-05-15
Status: Accepted

## Context

The previous installation model emphasized monolithic project-local symlinks and ADR-0001 established OpenAI as the only supported provider. The current workflow has evolved to support modular OpenCode sources, provider-selectable installs, and generated local runtime configuration per consuming repository.

That means the prior OpenAI-only provider constraint no longer fits the intended operating model, while OpenCode remains the only supported runtime.

## Decision

Adopt a modular source-and-generated-output architecture for OpenCode installation:

- Reusable, versioned OpenCode sources live in `base/opencode/**` in this repository.
- Consuming repositories receive generated/copied local runtime output, including:
  - `opencode.jsonc`
  - `.opencode/agents/**`
  - `.opencode/commands/**`
  - `.opencode/skills/**`
- Supported provider sets at install time are:
  - OpenAI (`openai`)
  - Kimi25 (`kimi25`)
  - OpenAI + Kimi25 (`openai,kimi25`)
- Generated `opencode.jsonc` is the provider/model control plane for each consumer repo:
  - global defaults (such as primary model and `small_model`)
  - centralized per-agent model assignments under `agent`
- Agent files remain model-agnostic; provider/model selection is centralized in generated config.

## Supersedes

This ADR partially supersedes ADR-0001 by replacing the OpenAI-only provider constraint.

- Superseded portion of ADR-0001: "OpenAI as the only supported provider."
- Still in force from ADR-0001: OpenCode remains the only supported runtime.

## Consequences And Tradeoffs

- Installation behavior becomes more flexible across provider environments, but bootstrap generation logic is more complex than static symlink-only setup.
- Managed output tracking (for example managed headers/markers) is required to safely refresh generated files without clobbering unmanaged local content.
- Secrets and credentials remain separated from versioned sources:
  - OpenAI authentication is handled through OpenCode `/connect`.
  - Kimi25 relies on environment variables (`KIMI_BASE_URL`, `KIMI_API_KEY`, `KIMI_API_VERSION`).
- Cross-platform parity is maintained by Bash and PowerShell installers, but in this environment runtime PowerShell validation remains limited because `pwsh` is unavailable.

## Alternatives Considered

- Keep symlink-first installation as the primary model: rejected because it does not represent the generated/provider-selectable architecture now required.
- Keep OpenAI as the only provider: rejected because current workflow needs first-class Kimi25 and mixed-provider installs.
