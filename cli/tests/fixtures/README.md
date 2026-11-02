# OpenCode V2 config schema fixture

`opencode-v2-config.schema.json` is a vendored, point-in-time copy of the
OpenCode V2 config schema so tests can validate generated configs without
network access.

- **Source URL:** https://opencode.ai/config.json
- **Fetch date:** 2026-11-02
- **Raw size:** 71,447 bytes
- **Vendored size:** 71,236 bytes (pretty-printed JSON + trailing newline)

## Transform applied (the only one)

Every occurrence of the external reference

```
"$ref": "https://models.dev/model-schema.json#/$defs/Model"
```

was replaced with

```
"type": "string"
```

inside the containing object, so the schema resolves fully offline. Exactly
**3 occurrences** were replaced (inline `model`/`small_model` variants plus the
deprecated top-level `small_model` `$ref`). No other constraint was changed:
no properties, required lists, enums, patterns, or `$defs` were pruned,
renamed, or edited.

## Refresh procedure

1. Fetch https://opencode.ai/config.json.
2. Replace every occurrence of
   `"$ref": "https://models.dev/model-schema.json#/$defs/Model"` with
   `"type": "string"` (structurally, in the containing object).
3. Update the fetch date and byte sizes in this README.
4. Run `npx vitest run cli/tests/unit/schema-harness.test.ts`.
5. Record any upstream drift (new required fields, changed types) here.
