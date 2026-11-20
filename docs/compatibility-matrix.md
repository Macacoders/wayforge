# Runtime Compatibility Matrix

Date: 2026-10-28

Scope: wayforge installs content once into `.agents/`. OpenCode and Kilo Code reach it through runtime-specific directory pointers or generated config paths (ADR-0046); Claude Code reaches it through a generated projection (`.claude/**` + `CLAUDE.md`, ADR-0048). `verified` means the artifact was exercised against the named runtime version, revision, and environment stated in its evidence. `pending` means the implementation is in place but has not been exercised on the required post-fix environment; historical evidence does not change that status. `n/a` means the runtime does not consume that artifact format.

| Artifact | OpenCode 1.18.35 | Kilo Code 7.8.17 | Pi | Claude Code |
| --- | --- | --- | --- | --- |
| Agents | verified — post-fix Linux check at `3d5d3be`; `opencode agent list` confirmed `planner`, `delivery`, `troubleshooter`, `research`, `code`, `architect` | verified - 2026-10-28 post-fix Windows check at 6e90494 plus Task 1; agent list confirmed planner, delivery, troubleshooter, research, code, architect | n/a — Pi does not load OpenCode agent definitions | pending — 6 agents generated in `.claude/agents` (automated CLI smoke); no Claude Code session run yet |
| Commands | verified — post-fix Linux `opencode debug config` showed wayforge command entries, including `intent` and `load-plan`; only a partial excerpt was retained, so no fresh full-count claim | verified - 2026-10-28 post-fix Windows check; debug config showed wayforge command entries including intent and load-plan | n/a — Pi does not load OpenCode command definitions | pending — 6 command-only files generated in `.claude/commands` plus 9 colliding names as skills (automated CLI smoke); no Claude Code session run yet |
| Skills | verified — post-fix Linux `opencode debug skill` confirmed wayforge skills | verified - 2026-10-28 post-fix Windows check; debug skill resolved wayforge skills from .agents/skills | pending - Pi 0.73.1 package documentation confirms .agents/skills/**/SKILL.md auto-discovery, but no active session was run; explicit maintainer waiver still required | pending — 9 colliding skills generated, 4 skill-only entries linked (junction fallback observed on Windows); no Claude Code session run yet |
| Memory | pending — the installer path (managed `AGENTS.md`) is covered by the post-fix smokes above, but runtime `AGENTS.md` loading was not exercised in this matrix | pending — same: installer path covered, runtime `AGENTS.md` loading not exercised in this matrix | n/a — Pi AGENTS.md loading not in scope | pending — `CLAUDE.md` generated with `@AGENTS.md` (automated CLI smoke); `/memory` not exercised in a session |
| Plugins | verified — post-fix Linux `opencode debug config` confirmed the `.agents/plugins/ponytail` path | verified - 2026-10-28 post-fix Windows check; debug config resolved .agents/plugins/ponytail/ponytail.mjs | n/a — Pi does not consume OpenCode plugin modules | n/a — no plugin projection; the ponytail plugin port is a follow-up (ADR-0048) |

## Pointer mechanism

| Environment | Mechanism | Status |
| --- | --- | --- |
| Linux / macOS | relative directory symlink (keeps the repository relocatable) | verified |
| Windows | directory junction fallback with an absolute target; the pointer does not survive moving the repository | verified - 2026-10-28 on Microsoft Windows NT 10.0.26300.0 with Node v24.19.0: junction creation, relocation (the absolute target was no longer traversable), residual reporting on reinstall, recovery after removing stale pointers, and uninstall removal preserving a user-authored file. Junctions do not survive moving the repository. Removal falls back from unlink to rmdir for a junction (EPERM/EISDIR), which removes only the link |
| Filesystem rejects symlinks (WSL `/mnt/c`, exFAT/FAT32, SMB/UNC repository) | probe runs on the repository volume, so the junction is chosen up front; if creation still fails the pointer is reported as a residual with the OS error code and the install exits non-zero instead of crashing | implemented — covered on every platform by the mocked-`EPERM` case in `cli/tests/unit/pointers.test.ts` (`reports a residual instead of crashing`) |
| Symlinks and junctions unavailable | generated stub files (copy `.agents/` content into the native directory) | deferred — not implemented (ADR-0046 decision 6) |

## Claude projection mechanism

| Environment | Mechanism | Status |
| --- | --- | --- |
| Claude Code (all platforms) | generated projection files (`.claude/agents`, `.claude/commands`, colliding `.claude/skills`) plus skill-only links (relative symlink → junction → managed copy), all manifest-tracked. Junction links use an absolute target (ADR-0046 Decision 4 / ADR-0031) and do not survive moving the repository | pending — human smoke not run |

Per-runtime materialization of the `.agents/` tree into native runtime directories is future work for OpenCode and Kilo; their supported design is pointers plus generated config paths. Claude Code is the documented exception: its translated projection is generated (ADR-0048).

## Verification notes

The 2026-10-26 evidence below predates the final Issue #227 combined revision
`b1affb6`, so it remains historical evidence rather than post-fix verification.
The user-confirmed OpenCode 1.18.35 Linux check at `3d5d3be` is the separate
post-fix verification recorded below. The 2026-10-28 Windows check below
verifies Kilo 7.8.17. Pi remains pending or requires an explicit maintainer
waiver; record the host, runtime version, and output or the waiver.

Verified on 2026-10-26 with scratch installs from the pre-final-revision
checkout, not from `b1affb6`:

```bash
# OpenCode
npx tsx cli/src/index.ts install --repo /tmp/wfg-matrix-oc --providers openai --runtime opencode --no-track --skip-node-check
cd /tmp/wfg-matrix-oc
opencode agent list
OPENCODE_DISABLE_EXTERNAL_SKILLS=1 opencode debug skill
opencode debug config

# Kilo Code
npx tsx cli/src/index.ts install --repo /tmp/wfg-matrix-kilo --providers openai --runtime kilocode --no-track --skip-node-check
cd /tmp/wfg-matrix-kilo
npx --yes @kilocode/cli@7.8.17 agent list
npx --yes @kilocode/cli@7.8.17 debug skill
npx --yes @kilocode/cli@7.8.17 debug config
```

Pi evidence: this repository's active Pi session discovers its skills from `.agents/skills/<name>/SKILL.md`; Pi needs no installer output for skills. Pi has no equivalent loader for OpenCode agent, command, or plugin definitions.

### 2026-10-27 post-fix OpenCode smoke

User-reported Linux environment (distribution and host version unspecified), from a
fresh disposable `/tmp/wayforge-oc-ZC6xJi` install at `3d5d3be`: OpenCode
1.18.35 completed the dry-run and actual install without errors. `opencode agent
list`, `OPENCODE_DISABLE_EXTERNAL_SKILLS=1 opencode debug skill`, and `opencode
debug config` also completed without errors; the user confirmed all six agents,
wayforge skills, the `.agents/plugins/ponytail` plugin path, and wayforge command
entries including `intent` and `load-plan`. This is a user summary with only a
partial config excerpt rather than retained raw output, so it does not freshly
verify the historical 15-command count. Host metadata is partial. It verifies
OpenCode only; it does not verify Kilo, Pi, or Windows junction behavior.

### 2026-10-28 post-fix Windows and Kilo smoke

Native Windows host `Microsoft Windows NT 10.0.26300.0`, Node `v24.19.0`, revision
`6e90494` plus the refactor-only Task 1 working tree. A fresh OpenCode install
created real junction pointers for `.opencode/agents` and `.opencode/commands`
because symlink creation was unavailable; both were traversable. Moving the
repository left both junctions pointing at the old absolute path; reinstall
reported both as residuals and exited 1, and reinstall after removing the stale
pointers recreated junctions to the new path. Uninstall removed the pointers and
managed `.agents` targets while preserving a user-authored
`.agents/agents/user-note.md`.

Kilo Code 7.8.17 on the same host: `agent list` showed `planner`, `delivery`,
`troubleshooter`, `research`, `code`, and `architect`; `debug skill` resolved
wayforge skills from `.agents/skills`; `debug config` resolved
`.agents/plugins/ponytail/ponytail.mjs` and command entries including `intent`
and `load-plan`.

Pi 0.73.1 documents `.agents/skills` discovery but no active session was run;
Pi remains pending or requires an explicit maintainer waiver.

Uninstall removes pointer entries with `unlink`; a pointer that refuses `unlink` with `EPERM`/`EISDIR` (a Windows junction) is removed with `rmdir`, which deletes only the link. The fallback is covered on every platform by the mocked-`EPERM` case in `cli/tests/unit/uninstall.test.ts`; junction creation, relocation, recovery, and removal are verified on the 2026-10-28 Windows host above.

Kilo's `.kilo/.gitignore` is generated by Kilo itself; wayforge only manages the `.kilo/agents` and `.kilo/commands` pointers and does not blanket-ignore `.kilo/`.

### Claude Code verification (pending)

Automated evidence already observed (agent, 2026-11-05, Windows host `Microsoft Windows NT 10.0.26300.0`, from source):

- `make check` green (452 passed / 13 skipped; typecheck, ESLint, Prettier, jscpd clean).
- CLI install/uninstall smoke: `--dry-run` predicted the full surface with no writes; the real install created 6 `.claude/agents/*.md`, 9 colliding `.claude/skills/<name>/SKILL.md`, 6 `.claude/commands/*.md`, 4 skill-only links (junction fallback — symlink creation was unavailable on this host), and `CLAUDE.md` containing `@AGENTS.md`; `wfg uninstall` removed all managed files and links and cleaned `.claude/` and `CLAUDE.md`.

Human smoke **pending**: `claude --version` was unavailable on the automation host, so no Claude Code version or session observation is recorded and none is fabricated. A maintainer must run the plan's commands and checklist (ADR-0048 and plan `docs/ai/plans/2026-11-05_113638-issue-293-claude-runtime.md`):

```bash
claude --version
npx tsx cli/src/index.ts install --repo /tmp/wfg-claude --runtime claude --no-track --skip-node-check --dry-run
npx tsx cli/src/index.ts install --repo /tmp/wfg-claude --runtime claude --no-track --skip-node-check
cd /tmp/wfg-claude
claude
```

Checklist: `/agents` lists the six agents; `/skills` lists the wayforge skills and `/intent`, `/plan`, `/triage`, `/issue`, `/memory`, `/load-plan`, `/implement-task`, `/review-task`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain` are invocable; `/memory` shows `CLAUDE.md` and `AGENTS.md`; `/intent` and `/plan` accept an argument (for example `/plan issue 293`) and the `$ARGUMENTS` text reaches the skill; a subagent invocation shows the expected tool restriction (for example `architect` cannot edit); with a default install `/model` changes the session model and subagents follow it (`inherit`), with `--model sonnet` `/tasks` shows the generated agents on Sonnet — record which behavior was observed; `wfg uninstall --repo /tmp/wfg-claude` removes the managed surface and preserves a user-authored `.claude/agents/user.md`. On Windows, additionally verify the skill link fallback (symlink or junction) and record the mechanism used.

Record the Claude Code version, host, link mechanism, and observed output here before changing the Claude column from `pending` to `verified`.
