# ADR-0011: Tokenizer Library Selection for Token Counter Plugin

Date: 2026-06-15
Status: Accepted

## Context

We need a reliable, offline tokenizer for a token-counter plugin that operates on OpenCode/Kilo Code AI configuration files in this repository (for example, `AGENTS.md`, `opencode.jsonc`, and skill files). The plugin will run inside the OpenCode SDK ecosystem, so a JavaScript/TypeScript library is required.

Key requirements:

- Accuracy must match OpenAI token counts for `cl100k_base` (the GPT-4 / `gpt-3.5-turbo` encoding).
- Must work fully offline after installation; no runtime network calls.
- Should be portable across Node.js versions and easy to distribute as a plugin dependency.
- The plugin is invoked occasionally, not in a hot execution path, so startup and per-call latency matter but are not as critical as correctness and maintenance health.

## Decision

Use **`gpt-tokenizer`** as the tokenizer library for the token-counter plugin.

- **Default encoding:** `cl100k_base`.
- **Version evaluated:** `3.4.0`.
- **Rationale:** `gpt-tokenizer` is a pure-JavaScript implementation with no native or WASM dependencies, the lowest measured per-call overhead, the most recent maintenance activity (2025-11-07), and produces token IDs that are identical to the other candidates. It is the most portable choice for a plugin that may be installed in varied Node.js environments.

## Evaluated Options

Three libraries were installed in a temporary directory and benchmarked against the first 1,000 characters of `AGENTS.md` and the reference string `"Hello, world!"`.

| Library | Version | Install size | Dependencies | Offline after install? | Accuracy (`cl100k_base`) | Performance (1k chars) | Last npm publish |
|---|---|---|---|---|---|---|---|
| `js-tiktoken` | 1.0.21 | ~22 MB | `base64-js` | Yes (WASM/grammar bundled inline) | Perfect match (203 tokens) | ~409 ms per fresh instantiation | 2025-08-09 |
| `tiktoken` | 1.0.22 | ~23 MB | none | Yes (ships local `tiktoken_bg.wasm`) | Perfect match (203 tokens) | ~2 ms after WASM init | 2025-08-09 |
| `gpt-tokenizer` | 3.4.0 | ~55 MB | none | Yes (pure JS + local BPE rank files) | Perfect match (203 tokens) | ~2 ms | 2025-11-07 |

Notes:

- All three libraries returned the exact same token array `[9906, 11, 1917, 0]` for `"Hello, world!"` and the same 203-token count for the `AGENTS.md` sample.
- `tiktoken` is **WASM-based**, not a native Node addon. The npm package loads `tiktoken_bg.wasm` from disk at runtime.
- `js-tiktoken` re-parses BPE data on each `getEncoding('cl100k_base')` call in the benchmark; caching the encoder instance would reduce the observed latency.
- `gpt-tokenizer` has the largest install footprint but the smallest runtime overhead and no WASM/native-compatibility surface area.

## Consequences

- Plugin installation gains ~55 MB of pure-JavaScript dependencies but avoids native-addon or WASM loading concerns.
- Token counts will be deterministic and fully offline.
- Future encoding additions (for example, `o200k_base`) can be imported from `gpt-tokenizer/cjs/encoding/<name>` using the same API pattern.

## Alternatives Considered

- **`js-tiktoken`** — rejected because it incurs higher per-instantiation overhead and is no more accurate than the pure-JS option. It is otherwise a solid fallback.
- **`tiktoken`** — rejected because it depends on WebAssembly and was less recently maintained than `gpt-tokenizer` at the time of evaluation. It is faster after initialization but introduces a WASM runtime surface that is unnecessary for this use case.

## Network Dependency Assessment

All three candidates are fully offline-capable after `npm install`. No candidate makes runtime HTTP requests or downloads additional assets. The chosen library (`gpt-tokenizer`) ships all BPE rank data as local JavaScript files, so token counting works without network access.
