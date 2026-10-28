# token-counter

OpenCode plugin that counts tokens in AI configuration files.

## Tool: `count_tokens`

Counts tokens for text files using the `cl100k_base` tokenizer via `gpt-tokenizer`.

### Arguments

- `paths` (array of strings, required): file globs or directory paths to scan.
- `encoding` (string, optional): tokenizer encoding. Defaults to `cl100k_base`.

### Supported file types

`.md`, `.json`, `.jsonc`, `.yaml`, `.yml`, `.txt`, `.sh`, `.ps1`

Directories named `node_modules` or `.git` are skipped automatically.

### Example

```json
{
  "paths": ["docs", "AGENTS.md", "opencode.jsonc"]
}
```

### Offline capability

Token counting runs entirely offline. No content is sent to any model provider.
