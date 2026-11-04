# ADR-0048: Rename the `laberit` Provider to `openai-compatible`

Date: 2026-11-03
Status: Accepted

## Context

The installer exposed a vendor-specific provider id `laberit` with vendor-prefixed model IDs (`laberit-ai-preview`, `laberit-ai`, `laberit-gpt-5.6-luna`, `laberit-kimi-k2.7-code`). The provider is actually a generic OpenAI-compatible endpoint configuration, so the vendor name in the id misdescribes its behaviour and leaks a specific vendor into a neutral mechanism (Issue #275).

An earlier redesign attempt (install-time model IDs, generated provider blocks, a `generic-only` agent fragment) was abandoned and discarded; this ADR records the surviving rename-only decision.

## Decision

Rename the provider id from `laberit` to `openai-compatible`. This is a rename only; behaviour is unchanged:

- The environment variables stay `OPENAI_BASE_URL` and `OPENAI_API_KEY`, both required in the process environment before launch (a project `.env` file is not read; a missing variable leaves `${VAR}` literal and the request fails loudly).
- Model IDs are renamed to describe the model, not the vendor, with unchanged display names and limits:
  - `laberit-ai-preview` → `kimi-k2.6` (`Kimi K2.6`, 262144 / 16384)
  - `laberit-ai` → `kimi-k2.5` (`Kimi K2.5`, 131072 / 16384)
  - `laberit-gpt-5.6-luna` → `gpt-5.6-luna` (`GPT-5.6-luna`, 1000000 / 131072)
  - `laberit-kimi-k2.7-code` → `kimi-k2.7-code` (`Kimi K2.7 Code`, 262100 / 262100)
- Defaults keep the previous mapping: `model` = `openai-compatible/kimi-k2.6`, `small_model` = `openai-compatible/kimi-k2.5`.
- Agent pins keep the previous mapping: `planner`, `delivery`, `research`, `troubleshooter`, `architect` → `openai-compatible/kimi-k2.6`; `code` → `openai-compatible/kimi-k2.5` with `steps: 16`.
- `--model` / `--small-model` remain optional overrides; the provider is not required to receive model IDs at install time. No install-time model registration, no generated provider block, and no `generic-only` fragment are introduced.
- There is no `laberit` alias; this is a clean break.

### Upstream model ID mapping

The endpoint only accepts its original model IDs (`laberit-ai-preview`, `laberit-ai`, `laberit-gpt-5.6-luna`, `laberit-kimi-k2.7-code`), confirmed against its `/v1/models`. Renaming only the `models` map key changes the model name sent in `/chat/completions` and the endpoint rejects it with `Invalid model name`.

Each model entry therefore keeps a neutral key for OpenCode/Kilo and carries the real upstream ID in `id`:

```jsonc
"kimi-k2.6": {
  "name": "Kimi K2.6",
  "id": "laberit-ai-preview",
  "limit": { "context": 262144, "output": 16384 }
}
```

Verified with the real endpoint on OpenCode 1.19.5 and Kilo 7.3.8: the UI and model references use `openai-compatible/kimi-k2.6`, while requests send `laberit-ai-preview`.

## Supersedes

This ADR partially supersedes ADR-0008:

- Superseded portion of ADR-0008: the vendor-specific provider-list entry "laberit (`laberit`)" — the provider set now lists `openai-compatible` instead.
- Superseded portion of ADR-0008: the laberit authentication bullet ("laberit relies on environment variables (`OPENAI_BASE_URL`, `OPENAI_API_KEY`)") — the same env-var mechanism now belongs to the `openai-compatible` provider.
- Still in force from ADR-0008: the modular source-and-generated-output architecture, provider-selectable installs, comma-separated combinations, and generated `opencode.jsonc` as the provider/model control plane.

## Consequences

- Existing installs that used `--providers laberit` must re-install with `--providers openai-compatible` (e.g. `wfg install --repo <path> --providers openai-compatible --force`); existing generated configs are self-contained and keep working until the next refresh, which migrates them to the new ids. There is no alias.
- The vendor name remains only in the `id` field of each model entry (the upstream identifier required by the endpoint). Provider id, display names, model keys, defaults, agent pins, env vars, and `/models` references are neutral.
- Alternatives rejected: keep `laberit-*` as the model keys (vendor stays visible in `/models` and every model reference); ask the endpoint owner for neutral aliases (outside this repo); inject the upstream IDs through environment variables (`id` has no `${VAR}` interpolation and it would add four undocumented variables).
- The generated config keeps the existing Kilo-safe shape: `env: ["OPENAI_API_KEY"]` and a literal `${OPENAI_BASE_URL}`; never `{env:}` / `{file:}`.
- Kilo config compatibility fix included in this change: `kilo.jsonc` emits `skills` as `{ "paths": ["..."] }` because Kilo 7.3.8 rejects the OpenCode array form with `ConfigInvalidError`; `opencode.jsonc` keeps the array form. This pre-existing kilocode bug affected all providers.
- Git history, tags, and release artifacts still contain the old name; scrubbing is tracked in #284.

## Related

- [ADR-0008](ADR-0008-modular-opencode-provider-installs.md) (Modular OpenCode Sources With Provider-Selectable Generated Installs) — partially superseded.
- Plan: `docs/ai/plans/2026-11-03_160000-issue-275-rename-laberit-provider.md`
