# ADR-0019: Keep TypeScript-Native gh-issue Over GitHub MCP Server

**Date:** 2026-07-01
**Status:** Accepted
**Amended:** 2026-10-27 — the original comparison below is retained as a
historical record. The current TypeScript-native credential boundary is
`GITHUB_TOKEN` → `GH_TOKEN` → an internal `gh auth token` lookup; `gh` remains
an optional credential source, not the API client.

## Context

Issue #16 originally posed the question: **"Evaluate `gh` CLI vs MCP for shared task management"** — should the shared-task workflow use the `gh` CLI or a Model Context Protocol (MCP) server for GitHub issue operations?

Since the issue was filed, the landscape shifted significantly:

1. **Issue #84 (2026-06-16)** replaced the Bash/PowerShell `gh` CLI wrappers with a single TypeScript script (`gh-issue.ts`) using native `fetch` against the GitHub REST API. The `gh` CLI was eliminated as an API-client dependency.
2. **Issue #120/#121 (2026-06-25)** applied ponytail simplification: simplified retry, slugify, eliminated N+1 API calls, and inlined dead abstractions. Net −62 lines.
3. **ADR-0017** documents the single-TypeScript-script decision.
4. **ADR-0016** records the then-current GitHub App Device Flow authentication decision.

The question was: **Keep the TypeScript-native approach (native `fetch`) or migrate to the GitHub MCP Server (`github/github-mcp-server`)?**

## Options Evaluated

### Option A: TypeScript-native (original comparison)

- At the time of this decision, `gh-issue.ts` plus its Device Flow helper used
  native `fetch` with mocked API and git commands.
- Supported operations include `check`, `labels-check`, issue lifecycle commands,
  and the coordinated `prclose` workflow.
- No API-client runtime dependency beyond `npx tsx` (already required by the project)
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
| **Auth model** | Environment token, then internal GitHub CLI credential lookup | PAT in `Authorization` header | OAuth auto-login or PAT |
| **Credentials on disk** | None managed by this workflow | PAT in `opencode.json` or env var | OAuth token in memory (Docker) or PAT in config |
| **Credential lifetime** | Managed by the selected environment source or GitHub CLI | PAT persists until manually revoked | Token in memory only (Docker OAuth); PAT if used |
| **Exposure risk** | Depends on secure environment/CLI credential handling | Medium — PAT in config or env var | Low (OAuth) or Medium (PAT) |
| **User experience** | Configure a repository-scoped token or authenticate GitHub CLI | Create and paste PAT | OAuth browser login (Docker) or PAT setup |

**Finding (amended 2026-10-27):** The TypeScript-native approach avoids
workflow-managed credential files and still avoids Docker. Securely injected,
repo-scoped tokens or a user-managed GitHub CLI login remain its credential
boundary; the MCP Local mode still requires Docker.

### 3. Testability

| Dimension | TS-native | MCP Server |
|-----------|-----------|------------|
| **Test coverage** | Deterministic helper tests with mocked API and git commands | No test infra in this project |
| **Test framework** | vitest, mocked API (`fetch`) + mocked git (`execFileSync`) | Would require Go server or MCP protocol mocking |
| **Test speed** | ~3.5s | Unknown — likely slower due to Docker/protocol overhead |
| **Determinism** | Full — all external calls mocked | Unknown — depends on mock strategy |
| **Edge case coverage** | Retries, auth failures, missing labels, duplicate claims, protected branch scenarios | Limited to MCP server's built-in behavior |

**Finding:** The current approach has strong, fast, deterministic test coverage. Testing an MCP-based replacement would be significantly more complex.

### 4. Token & Context Overhead

| Dimension | TS-native | MCP Server |
|-----------|-----------|------------|
| **Context footprint** | Purpose-built owned helper code | Full MCP tool registry (dozens of tools) |
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
| GitHub credential | Fine-grained PAT or existing `gh` login | ✅ PAT required | ⚠️ Optional (OAuth alternative) |
| OpenCode MCP config | ❌ Not needed | ✅ Required | ✅ Required |

**Current implication (amended 2026-10-27):** MCP Remote adds PAT configuration and MCP Local adds Docker. The current approach has no workflow-managed credential file or API-client dependency; it requires a securely supplied token or an existing `gh` login, with `gh` optional when an environment token is supplied.

### 6. Maintenance

| Dimension | TS-native | MCP Server |
|-----------|-----------|------------|
| **Owned code** | Purpose-built TypeScript helper | Zero owned code for API calls |
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
| `gh` CLI dependency | ✅ API operations remain native; CLI is an optional credential fallback | ❌ MCP adds new dependencies (Docker/PAT) |
| Token scope/security | ✅ No workflow-managed credential file; use a repo-scoped token or managed CLI login | ❌ PAT required for Remote mode |
| Platform portability | ✅ All platforms via Node.js | ✅ All platforms via Docker/Go |
| Tool call efficiency | ✅ Single command per operation | ❌ 3-6+ tool calls per operation |
| Maintenance burden | ✅ Single TypeScript file | ✅ Zero API code, but MCP config + testing |

## Recommendation

**Keep the TypeScript-native approach.** Do not migrate to the GitHub MCP Server.

### Rationale

1. **The original problem is already solved.** PowerShell quoting issues are moot, and the TypeScript helper remains covered by deterministic tests across supported platforms. GitHub CLI is only an optional credential fallback, not an API implementation dependency.

2. **Feature gap is too large.** The MCP server cannot replicate several
project-specific workflows (`labels-check`, `claim`, `assign`, `release`, and
`prclose`) as single operations. The `prclose` command alone requires
coordinating git operations with API calls in a way no MCP tool can match.

3. **Security boundary.** The helper does not manage credential files; it uses securely injected, repo-scoped tokens or an existing GitHub CLI login. Remote MCP mode requires PAT; Local mode requires Docker.

4. **Token overhead.** The MCP server's own documentation warns about context window pressure from tool registration. The TS approach has zero protocol overhead.

5. **Testability loss.** The existing deterministic helper tests would require complex MCP mocking to replace.

6. **Dependency cost.** MCP adds Docker (local) or PAT management (remote) as requirements. The current approach needs `npx tsx` and a GitHub credential; `gh` is optional as a credential fallback.

### What Would Change the Decision

- If OpenCode's MCP integration becomes the **primary agent-to-service interface** and TS subprocess scripts become non-standard or deprecated.
- If the GitHub MCP Server adds dedicated sub-commands for claim/release/prclose workflows (unlikely — these are project-specific workflows, not GitHub API concepts).
- If the project already required Docker for other reasons and the feature gap were closed by wrapping MCP with a thin orchestration layer.

None of these conditions are met today.

## Consequences (original decision record)

- At the time of the original decision, the TypeScript-native `gh-issue.ts` approach continued as the shared-task workflow implementation. Its current credential resolution is documented in ADR-0016's supersession and this ADR's 2026-10-27 amendment.
- No changes to `SKILL.md`, `issue.md`, `permissions/agents.yml`, or tests.
- Issue #16 will be updated with this analysis and closed.
- The GitHub MCP Server remains available as a general-purpose tool for future needs (e.g., repository browsing, code search, Actions monitoring) if those use cases arise.

## ADRs Affected

- **ADR-0017** (Single TS gh-issue): Unchanged — this ADR confirms the TS-native direction.
- **ADR-0016** (GitHub App Device Flow): superseded on 2026-10-27; this ADR's TypeScript-native versus MCP decision remains unchanged.

## References

- Issue #16: "Evaluar gh CLI vs MCP para la gestión de tareas compartidas"
- Issue #84: "Rewrite gh-issue as single TypeScript script"
- Issue #120/#121: "gh-issue QA fixes" and ponytail simplification
- ADR-0016: "Authenticate gh-issue via GitHub App Device Flow"
- ADR-0017: "Replace Bash/PowerShell gh-issue with Single TypeScript Script"
- `github/github-mcp-server` v1.5.0: https://github.com/github/github-mcp-server
- OpenCode MCP installation guide: https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-opencode.md
