---
status: completed
created: 2026-09-13
phase: 1/1
required_gates:
  test_verdict: true
  architect_review: false
  memory_update: true
---

# Add `--help` / `help` dispatch to gh-issue.ts

## Goal

Make `npx tsx gh-issue.ts --help` and `npx tsx gh-issue.ts help` print the full usage
text to stdout and exit 0, mirroring the sibling `gh-app-auth.ts --help` behavior.
Both forms must return before any token resolution or network work (no GitHub App
device flow triggered), reuse the existing `printUsage()`, and leave the
unknown-command error path unchanged.

Repository root: `/home/spinaks/dev/ai-config`

## Context

`base/opencode/skills/shared-task/scripts/gh-issue.ts` defines `printUsage()` but
never dispatches to it for `--help`/`help`. Today both tokens fall through global
arg parsing into `remainingArgs`, become the `command`, hit the `default` case of
the dispatch switch, and print `Error: unknown command: <cmd>` + usage with exit 1.
Worse, token resolution (`resolveToken()` → `getValidToken()` → device flow) runs
**before** dispatch, so a real `--help` invocation can trigger auth/device-flow
work before failing. Verified behavior (safe `--dry-run` probes):

```
$ npx tsx gh-issue.ts --dry-run --help   → "Error: unknown command: --help" + usage, exit 1
$ npx tsx gh-issue.ts --dry-run help     → "Error: unknown command: help" + usage, exit 1
```

Sibling pattern in `gh-app-auth.ts` `main()`:

```ts
const args = process.argv.slice(2);
if (args.includes('--help')) {
  usage();
  return;
}
```

## Decisions (locked)

- **`--help` handling (Design A — exact sibling mirror):** at the very top of
  `gh-issue.ts::main()`, before arg parsing and before the token/repo resolution
  lines, add:
  ```ts
  if (argv.includes('--help')) {
    printUsage();
    return;
  }
  ```
  Rationale: identical to `gh-app-auth.ts`; `--help` anywhere in argv wins (same
  semantics as the sibling); also fixes the `--repo --help` edge where `--repo`
  would otherwise consume `--help` as its value. Rejected alternative (flag
  collected in the global-flag parse loop) is worse: `--repo`/`-R` consume the
  next token as a value, so `--repo --help` would not be recognized.
- **`help` command handling:** after `const command = remainingArgs[0]` is
  extracted and **before** the `resolveToken()` / `resolveRepo()` lines, add:
  ```ts
  if (command === 'help') {
    printUsage();
    return;
  }
  ```
  Position check only (token at command position), not `argv.includes('help')`,
  so `create help` (a title) is unaffected. Early-return keeps `resolveRepo()` out
  of the `<git remote get-url origin>` path too.
- **Both checks precede `const token = opts?.token ?? (dryRun ? '' : await resolveToken());`.**
- **No changes to `printUsage()`** content — usage text is reused verbatim
  (acceptance: "reused, not duplicated"). The pre-existing cosmetic source-indent
  misalignment on the `show` usage line is out of scope.
- **Unknown-command path unchanged:** `default:` case keeps
  `Error: unknown command: <cmd>` + `printUsage()` + `throw` (exit 1). No-argument
  invocation (`remainingArgs.length === 0` → usage + throw, exit 1) also unchanged.
- **Out of scope:** `-h` alias, `--help` inside subcommand arg parsing, docs/
  SKILL.md/issue.md updates. The printed usage is the documentation surface.
- **Architect review:** NOT required — internal skill-script CLI behavior change,
  none of the 6 boundary categories (public contract, persistence, auth/security,
  deployment topology, data model, cross-module API).

## Files to change

1. `base/opencode/skills/shared-task/scripts/gh-issue.ts` — two early-return
   guards in `main()` (see Decisions).
2. `tests/typescript/gh-issue/gh-issue.test.ts` — new unit tests in the existing
   `main() dispatch` describe block.
3. `tests/typescript/gh-issue/e2e.test.ts` — new `gh-issue.ts help` describe block
   mirroring the existing `gh-app-auth.ts --help` e2e test.

## Tests to add

### Unit (`tests/typescript/gh-issue/gh-issue.test.ts`, in `main() dispatch`)

- `--help` → `gh.main()` resolves (no throw), stdout contains `Usage:` and a known
  command name. Explicitly `delete process.env.GITHUB_TOKEN` before the call and
  assert `mockFetch` was not called to prove no auth/network work.
- `help` command → same assertions.

Both follow the existing pattern: stub `process.argv`, spy on
`process.stdout.write`, restore `process.argv` afterwards.

### E2E (`tests/typescript/gh-issue/e2e.test.ts`)

New `describe('gh-issue.ts help')` with two tests (`--help`, `help`), each running
with a credential-hostile env override to prove no device flow is triggered:

```ts
run([ISSUE_SCRIPT, '--help'], {
  env: { GITHUB_TOKEN: '', GH_TOKEN: '', GH_APP_CLIENT_ID: '', GH_CONFIG_DIR: '/tmp/nonexistent-gh-config' },
});
```

Assert `status === 0` and `stdout` contains `Usage:`. This mirrors the existing
`gh-app-auth.ts --help exits 0` e2e test; if token resolution were reached under
this env it would fail (missing client id / no cache), so exit 0 proves the
early return.

## Verification

1. `npx vitest run tests/typescript/gh-issue/` — new + existing unit/e2e tests pass
   (existing suite: 1372-line unit file + 120-line e2e file; unknown-command and
   no-command tests must stay green).
2. `npx tsc --noEmit` — root `tsconfig.json` includes
   `base/opencode/skills/shared-task/scripts/**/*.ts` (strict mode).
3. Manual probes (must match):
   - `npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts --help; echo $?` → `Usage:` on stdout, 0
   - `npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts help; echo $?` → `Usage:` on stdout, 0
   - `GITHUB_TOKEN= GH_TOKEN= GH_APP_CLIENT_ID= GH_CONFIG_DIR=/tmp/nonexistent npx tsx …/gh-issue.ts --help; echo $?` → 0 (no device flow)
   - `npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts --dry-run bogus; echo $?` → `Error: unknown command: bogus` + usage, 1 (unchanged)
4. Full suite: `make check` (check-ts + check-node + check-duplication).

## Risks / Notes

- **Low risk:** two additive early-return guards in `main()`; no parsing or
  dispatch restructuring. Existing tests contain no `--help`/`help` argv tokens,
  so no interference.
- `--repo --help` now exits 0 with usage instead of treating `--help` as a repo
  value — intended improvement, consistent with the sibling script.
- Bare `gh-issue.ts` (no args) remains usage + exit 1; changing that is out of
  scope for this issue.

## Memory update (post-completion)

Add a line to `docs/ai/logs/2026-09.md` noting gh-issue.ts gained `--help`/`help`
(exit 0, no auth required), mirroring gh-app-auth.ts; test counts after change.

## Status: Complete

Phase 1/1 complete. Both guards implemented in `gh-issue.ts::main()`; 2 unit
tests + 2 e2e tests added. Full suite: 274 tests pass (270 baseline + 4 new),
`npx tsc --noEmit` clean, duplication gate exit 0. Manual probes: `--help`
exit 0, `help` exit 0, hostile-env `--help` exit 0 (no device flow),
`--dry-run bogus` exit 1 with `Error: unknown command: bogus` (unchanged).

Memory/log entry in `docs/ai/logs/2026-09.md` pending (separate follow-up per
implementation task constraints).