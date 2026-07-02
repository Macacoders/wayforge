# ADR-0019: Keep TypeScript-Native gh-issue Over GitHub MCP Server

**Date:** 2026-07-01
**Status:** Accepted

## Context

Issue #16 originally posed the question: **"Evaluate `gh` CLI vs MCP for shared task management"** — should the shared-task workflow use the `gh` CLI or a Model Context Protocol (MCP) server for GitHub issue operations?

Since the issue was filed, the landscape shifted significantly:

1. **Issue #84 (2026-06-16)** replaced the Bash/PowerShell `gh` CLI wrappers with a single TypeScript script (`gh-issue.ts`) using native `fetch` against the GitHub REST API. The `gh` CLI dependency was completely eliminated.
2. **Issue #120/#121 (2026-06-25)** applied ponytail simplification: simplified retry, slugify, eliminated N+1 API calls, and inlined dead abstractions. Net −62 lines.
3. **ADR-0017** documents the single-TypeScript-script decision.
4. **ADR-0016** documents the move from PAT to GitHub App Device Flow authentication.

The question is now: **Keep the current TypeScript-native approach (`gh-issue.ts` + `gh-app-auth.ts` via native `fetch`) or migrate to the GitHub MCP Server (`github/github-mcp-server`)?**

## Options Evaluated

### Option A: TypeScript-native (current)

- `gh-issue.ts`: ~1,020 lines, pure TypeScript, native `fetch`
- `gh-app-auth.ts`: ~359 lines, GitHub App Device Flow OAuth
- 132 vitest tests (85 for gh-issue + 47 for gh-app-auth) with mocked API and git commands
- 9 commands: `check`, `labels-check`, `list`, `create`, `claim`, `assign`, `release`, `close`, `prclose`, `show`
- No runtime dependencies beyond `npx tsx` (already required by the project)
- Works on all platforms via Node.js
- No Docker, no Go, no MCP protocol layer

### Option B: GitHub MCP Server (`github/github-mcp-server`)

- Official GitHub server, v1.5.0 (June 2026), 31k⭐, 150 contributors, Go (93.6%)
- **Remote mode:** Hosted at `api.githubcopilot.com/mcp/`, needs PAT in OpenCode config
- **Local mode:** Docker (`ghcr.io/github/github-mcp-server`) or Go binary
- Issue toolset: `issue_read`, `issue_write`, `search_issues` (3 tools)
- Explicit OpenCode installation guide exists

## Analysis

### 1. Feature Coverage

| Operation | TS-native | MCP Server |
|-----------|-----------|------------|
| `list` issues | ✅ Full pagination, PR filtering, assignee/status output | ✅ `search_issues` |
| `create` issue | ✅ With body-file, labels, title | ✅ `issue_write` |
| `show` issue | ✅ Full detail with assignee/labels/body | ✅ `issue_read` |
| `claim` (self-assign + status labels + comment) | ✅ Single command, guards against double-claim | ❌ Would need 3+ tool calls + agent orchestration |
| `assign` to collaborator | ✅ Single command with validation | ❌ Would need 3+ tool calls |
| `release` (unassign + status:to-do/blocked) | ✅ Single command with ownership check | ❌ Would need 4+ tool calls |
| `close` with summary comment | ✅ Single command | ✅ `issue_write` (state=closed) |
| `prclose` (git branch + commit + push + PR + labels) | ✅ **Single coordinated command** with dry-run safety | ❌ Would need 6+ separate tool calls + git CLI ops |
| `labels-check` (pagination-aware) | ✅ Custom command, pagination handled | ❌ No dedicated labels-check tool |
| `--dry-run` for all mutations | ✅ Full dry-run support | ❌ Not supported |
| `--json` structured output | ✅ | ❌ Agent would need to parse MCP tool output |

**Key gap:** The `prclose` command is a coordinated 10-step workflow (detect branch → check clean tree → create feature branch → auto-commit staged files → push → create PR → assign PR → comment on issue → update labels → report URL). No MCP tool can replicate this as a single operation — it requires orchestrating git CLI, MCP issue tools, and MCP PR tools across multiple agent tool calls, increasing failure risk and token consumption.

### 2. Authentication & Security

| Dimension | TS-native | MCP Remote | MCP Local (Docker) |
|-----------|-----------|------------|-------------------|
| **Auth model** | GitHub App Device Flow OAuth | PAT in `Authorization` header | OAuth auto-login or PAT |
| **Credentials on disk** | Cached OAuth token in `.gh-config/github-token.json` (hardened with `icacls` on Windows) | PAT in `opencode.json` or env var | OAuth token in memory (Docker) or PAT in config |
| **Credential lifetime** | Token expires, refresh tokens extend sessions transparently | PAT persists until manually revoked | Token in memory only (Docker OAuth); PAT if used |
| **Exposure risk** | Low — OAuth token, repo-scoped via GitHub App | Medium — PAT in config or env var | Low (OAuth) or Medium (PAT) |
| **User experience** | One-time browser authorization | Create and paste PAT | OAuth browser login (Docker) or PAT setup |

**Finding:** The current Device Flow approach is more secure than the PAT-based MCP Remote mode. The MCP Local mode can use OAuth but requires Docker.

### 3. Testability

| Dimension | TS-native | MCP Server |
|-----------|-----------|------------|
| **Test count** | 132 tests (85 + 47) | No test infra in this project |
| **Test framework** | vitest, mocked API (`fetch`) + mocked git (`execFileSync`) | Would require Go server or MCP protocol mocking |
| **Test speed** | ~3.5s | Unknown — likely slower due to Docker/protocol overhead |
| **Determinism** | Full — all external calls mocked | Unknown — depends on mock strategy |
| **Edge case coverage** | Retries, auth failures, missing labels, duplicate claims, protected branch scenarios | Limited to MCP server's built-in behavior |

**Finding:** The current approach has strong, fast, deterministic test coverage. Testing an MCP-based replacement would be significantly more complex.

### 4. Token & Context Overhead

| Dimension | TS-native | MCP Server |
|-----------|-----------|------------|
| **Context footprint** | ~1,020 lines of owned code | Full MCP tool registry (dozens of tools) |
| **Protocol overhead** | None — direct HTTP | JSON-RPC over stdio or HTTP |
| **Official docs warning** | N/A | *"The GitHub MCP server can add a lot of tokens to your context. Consider limiting toolsets..."* |
| **Per-operation tokens** | Equal to HTTP request + response | MCP protocol framing + tool registration + request/response |

**Finding:** The MCP approach adds measurable token overhead through tool registration, protocol framing, and context window pressure. The TS-native approach has zero overhead beyond the explicit API calls.

### 5. Dependencies

| Dependency | TS-native | MCP Remote | MCP Local |
|-----------|-----------|------------|-----------|
| `npx tsx` | ✅ Required | ✅ Required | ✅ Required |
| Docker | ❌ Not needed | ❌ Not needed | ✅ Required |
| Go toolchain | ❌ Not needed | ❌ Not needed | ❌ Optional (build from source) |
| GitHub PAT | ❌ Not needed | ✅ Required | ⚠️ Optional (OAuth alternative) |
| OpenCode MCP config | ❌ Not needed | ✅ Required | ✅ Required |

**Finding:** The MCP Remote mode adds a PAT dependency and MCP configuration. The MCP Local mode adds Docker. The current approach adds zero additional dependencies beyond what the project already requires.

### 6. Maintenance

| Dimension | TS-native | MCP Server |
|-----------|-----------|------------|
| **Owned code** | ~1,379 lines (gh-issue.ts + gh-app-auth.ts) | Zero owned code for API calls |
| **Configuration** | None — direct script invocation | OpenCode MCP config in opencode.json |
| **Server updates** | None — fully owned | Server maintained by GitHub (but breaking changes possible) |
| **Bug fixes** | Full control | Depends on upstream release cycle |
| **Security patches** | Full control | Depends on upstream release cycle |
| **Platform issues** | All handled in TypeScript | Go binary (all platforms) or Docker |

**Finding:** The MCP approach reduces owned code but introduces dependency on an external server with its own release cycle, open issues (324 open), and potential for breaking changes.

### 7. Original Issue Concerns (from Issue #16)

| Concern | Status with TS-native | Status with MCP |
|---------|----------------------|----------------|
| PowerShell quoting | ✅ **Moot** — TypeScript script eliminated shell-specific quoting (issue #84) | ✅ Not applicable (MCP protocol) |
| `gh` CLI dependency | ✅ **Moot** — eliminated in issue #84 | ❌ MCP adds new dependencies (Docker/PAT) |
| Token scope/security | ✅ Device Flow, no stored PAT | ❌ PAT required for Remote mode |
| Platform portability | ✅ All platforms via Node.js | ✅ All platforms via Docker/Go |
| Tool call efficiency | ✅ Single command per operation | ❌ 3-6+ tool calls per operation |
| Maintenance burden | ✅ Single TypeScript file | ✅ Zero API code, but MCP config + testing |

## Recommendation

**Keep the TypeScript-native approach.** Do not migrate to the GitHub MCP Server.

### Rationale

1. **The original problem is already solved.** The `gh` CLI dependency was eliminated, PowerShell quoting issues are moot, and the script is battle-tested with 132 tests across all platforms.

2. **Feature gap is too large.** The MCP server cannot replicate 5 of 9 commands (`labels-check`, `claim`, `assign`, `release`, `prclose`) as single operations. The `prclose` command alone requires coordinating git operations with API calls in a way no MCP tool can match.

3. **Security regression.** The current Device Flow OAuth is more secure than storing a PAT in OpenCode configuration. Remote MCP mode requires PAT; Local mode requires Docker.

4. **Token overhead.** The MCP server's own documentation warns about context window pressure from tool registration. The TS approach has zero protocol overhead.

5. **Testability loss.** 132 deterministic tests would require complex MCP mocking to replace.

6. **Dependency cost.** MCP adds Docker (local) or PAT management (remote) as requirements. The current approach needs only `npx tsx`.

### What Would Change the Decision

- If OpenCode's MCP integration becomes the **primary agent-to-service interface** and TS subprocess scripts become non-standard or deprecated.
- If the GitHub MCP Server adds dedicated sub-commands for claim/release/prclose workflows (unlikely — these are project-specific workflows, not GitHub API concepts).
- If the project already required Docker for other reasons and the feature gap were closed by wrapping MCP with a thin orchestration layer.

None of these conditions are met today.

## Consequences

- The existing `gh-issue.ts` + `gh-app-auth.ts` approach continues as the shared-task workflow implementation.
- No changes to `SKILL.md`, `issue.md`, `permissions/agents.yml`, or tests.
- Issue #16 will be updated with this analysis and closed.
- The GitHub MCP Server remains available as a general-purpose tool for future needs (e.g., repository browsing, code search, Actions monitoring) if those use cases arise.

## ADRs Affected

- **ADR-0017** (Single TS gh-issue): Unchanged — this ADR confirms the TS-native direction.
- **ADR-0016** (GitHub App Device Flow): Unchanged — auth model remains the same.

## References

- Issue #16: "Evaluar gh CLI vs MCP para la gestión de tareas compartidas"
- Issue #84: "Rewrite gh-issue as single TypeScript script"
- Issue #120/#121: "gh-issue QA fixes" and ponytail simplification
- ADR-0016: "Authenticate gh-issue via GitHub App Device Flow"
- ADR-0017: "Replace Bash/PowerShell gh-issue with Single TypeScript Script"
- `github/github-mcp-server` v1.5.0: https://github.com/github/github-mcp-server
- OpenCode MCP installation guide: https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-opencode.md
