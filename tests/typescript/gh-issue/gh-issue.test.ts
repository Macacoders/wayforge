// ── gh-issue.test.ts — Unit tests for gh-issue.ts ───────────────────────────
// Tests require vitest 4.x. Run: npx vitest run
//
// Strategy:
//   - Mock child_process.execFileSync globally (git commands)
//   - Mock global fetch (GitHub API)
//   - Set GITHUB_TOKEN env to bypass auth module
//   - Use exported functions from gh-issue.ts directly

import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';

// ── Module-level mocks (hoisted by vitest) ──────────────────────────────────

const mockExecFileSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFileSync: mockExecFileSync }));

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockUnlinkSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
}));
vi.mock('../../../base/opencode/skills/shared-task/scripts/gh-app-auth.ts', () => ({
  getValidToken: vi.fn().mockRejectedValue(new Error('auth mock')),
}));

// ── Stub globals before imports ─────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Bypass real auth module — use env var
process.env.GITHUB_TOKEN = 'test-token-value';

// ── Module under test ──────────────────────────────────────────────────────

import * as gh from '../../../base/opencode/skills/shared-task/scripts/gh-issue.ts';

// ── Test helpers ────────────────────────────────────────────────────────────

function okResponse(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(data),
  };
}

function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ message }),
  };
}

/** All 12 required labels as GitHub API objects */
const ALL_REQUIRED_LABELS_API = gh.REQUIRED_LABELS.map((name) => ({ name }));

/** Default issue response (open, unassigned, status:to-do) */
const DEFAULT_ISSUE = {
  number: 1,
  title: 'Test Issue',
  state: 'open',
  assignees: [],
  labels: [{ name: 'status:to-do' }],
  html_url: 'https://github.com/test/repo/issues/1',
};

/** Helper: makes mockFetch respond to labels endpoint (pagination-aware) */
function mockLabelsResponse(): void {
  let labelsCallCount = 0;
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/labels?per_page=100')) {
      labelsCallCount++;
      return Promise.resolve(
        labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

/** Helper: makes mockFetch respond to labels + a specific endpoint (pagination-aware) */
function mockWithLabels(
  urlPattern: string | RegExp,
  data: unknown,
  method = 'GET',
): void {
  let labelsCallCount = 0;
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    const reqMethod = opts?.method ?? 'GET';
    const matches =
      typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);

    if (url.includes('/labels?per_page=100') && reqMethod === 'GET') {
      labelsCallCount++;
      if (labelsCallCount > 1) {
        return Promise.resolve(okResponse([]));
      }
      return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
    }
    if (matches && reqMethod === method) {
      return Promise.resolve(okResponse(data));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${reqMethod} ${url}`));
  });
}

// ── Setup / teardown ────────────────────────────────────────────────────────

const baseCtx = { jsonMode: false, dryRun: false, repo: 'test/repo', token: 't' };

beforeEach(() => {
  process.env.GITHUB_TOKEN = 'test-token-value';
  delete process.env.GH_TOKEN;
  delete process.env.GH_REPO;
  mockFetch.mockReset();
  mockExecFileSync.mockReset();
  mockExistsSync.mockReset();
  mockReadFileSync.mockReset();
  mockUnlinkSync.mockReset();
  // Default: no template file exists; readFileSync returns empty
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue('');

  // Default execFileSync: git origin, repo root, current branch, clean tree
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    const key = [cmd, ...args].join(' ');
    const map: Record<string, string> = {
      'git remote get-url origin': 'git@github.com:owner/repo.git',
      'git rev-parse --show-toplevel': '/tmp/repo',
      'git rev-parse --abbrev-ref HEAD': 'feature/test',
      'git status --porcelain': '',
    };
    if (map[key] !== undefined) return map[key];
    throw new Error(`Unexpected execFileSync: ${cmd} ${args.join(' ')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure functions
// ─────────────────────────────────────────────────────────────────────────────

describe('extractRepoFromUrl', () => {
  it('parses git@github.com:OWNER/REPO.git', () => {
    expect(gh.extractRepoFromUrl('git@github.com:foo/bar.git')).toBe('foo/bar');
  });

  it('parses git@github.com:OWNER/REPO (no suffix)', () => {
    expect(gh.extractRepoFromUrl('git@github.com:foo/bar')).toBe('foo/bar');
  });

  it('parses https://github.com/OWNER/REPO.git', () => {
    expect(gh.extractRepoFromUrl('https://github.com/foo/bar.git')).toBe('foo/bar');
  });

  it('parses https://github.com/OWNER/REPO (no suffix)', () => {
    expect(gh.extractRepoFromUrl('https://github.com/foo/bar')).toBe('foo/bar');
  });

  it('parses ssh://git@github.com/OWNER/REPO.git', () => {
    expect(gh.extractRepoFromUrl('ssh://git@github.com/foo/bar.git')).toBe('foo/bar');
  });

  it('returns null for unsupported URL', () => {
    expect(gh.extractRepoFromUrl('https://gitlab.com/foo/bar')).toBeNull();
  });
});

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(gh.slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(gh.slugify('Fix bug #123!')).toBe('fix-bug-123');
  });

  it('collapses multiple hyphens', () => {
    expect(gh.slugify('a---b---c')).toBe('a-b-c');
  });

  it('strips leading and trailing hyphens', () => {
    expect(gh.slugify('--hello-world--')).toBe('hello-world');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    const slug = gh.slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('truncates to 60 characters without word-boundary awareness', () => {
    const slug = gh.slugify('a-' + 'a'.repeat(68));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).not.toMatch(/-$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRepoLabels (H1: pagination)
// ─────────────────────────────────────────────────────────────────────────────

describe('getRepoLabels', () => {
  it('collects all labels across multiple pages', async () => {
    const page1 = [{ name: 'status:to-do' }, { name: 'status:doing' }];
    const page2 = [{ name: 'type:task' }, { name: 'type:bug' }];
    let page = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        page++;
        if (page === 1) return Promise.resolve(okResponse(page1));
        if (page === 2) return Promise.resolve(okResponse(page2));
        return Promise.resolve(okResponse([]));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    const labels = await gh.getRepoLabels(baseCtx);
    expect(labels).toEqual(['status:to-do', 'status:doing', 'type:task', 'type:bug']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API retry behavior (H5)
// ─────────────────────────────────────────────────────────────────────────────

describe('api retry behavior', () => {
  it('retries on 502 and succeeds', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(errorResponse(502, 'Server Error'));
      return Promise.resolve(okResponse({ status: 'ok' }));
    });
    const result = await gh.api(baseCtx, 'GET', '/repos/test/repo');
    expect(result).toEqual({ status: 'ok' });
    expect(callCount).toBe(2);
  });

  it('throws after one 5xx retry', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve(errorResponse(502, 'Bad Gateway'));
    });
    await expect(gh.api(baseCtx, 'GET', '/repos/test/repo')).rejects.toThrow(
      'GitHub API error (502): Bad Gateway',
    );
    expect(callCount).toBe(2); // 1 initial + 1 retry
  }, 15000);

  it('does not retry on network error', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      return Promise.reject(new Error('Network failure'));
    });
    await expect(gh.api(baseCtx, 'GET', '/repos/test/repo')).rejects.toThrow('Network failure');
    expect(callCount).toBe(1);
  });

  it('does not retry on 4xx errors', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(errorResponse(404, 'Not Found')),
    );
    await expect(gh.api(baseCtx, 'GET', '/repos/test/repo')).rejects.toThrow(
      'GitHub API error (404): Not Found',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveToken', () => {
  it('returns GITHUB_TOKEN env var', async () => {
    process.env.GITHUB_TOKEN = 'from-env';
    process.env.GH_TOKEN = 'should-be-ignored';
    const token = await gh.resolveToken();
    expect(token).toBe('from-env');
  });

  it('falls back to GH_TOKEN env var', async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'from-gh-env';
    const token = await gh.resolveToken();
    expect(token).toBe('from-gh-env');
  });

  it('throws when no env vars set and auth fails', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    await expect(gh.resolveToken()).rejects.toThrow();
  });

  it('propagates expired-token/device-flow failure from gh-app-auth', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    await expect(gh.resolveToken()).rejects.toThrow('auth mock');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Repo resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveRepo', () => {
  it('returns the explicit repo argument', () => {
    const result = gh.resolveRepo('explicit/one');
    expect(result).toBe('explicit/one');
  });

  it('returns GH_REPO env var when no explicit repo', () => {
    process.env.GH_REPO = 'env/repo';
    const result = gh.resolveRepo('');
    expect(result).toBe('env/repo');
  });

  it('falls back to git remote origin', () => {
    const result = gh.resolveRepo('');
    expect(result).toBe('owner/repo');
  });

  it('throws when git origin is unavailable', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not a git repo'); });
    expect(() => gh.resolveRepo('')).toThrow('GH_REPO is not set');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Check operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdCheck', () => {
  it('succeeds with human-readable output', async () => {
    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCheck(baseCtx);
    expect(stdout.join('')).toContain('OK: GitHub access verified for test/repo');
  });

  it('succeeds with JSON output', async () => {
    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCheck({ ...baseCtx, jsonMode: true });
    const json = JSON.parse(stdout.join(''));
    expect(json).toEqual({ status: 'ok', repo: 'test/repo' });
  });

  it('throws on 404', async () => {
    mockFetch.mockResolvedValue(errorResponse(404, 'Not Found'));

    await expect(gh.cmdCheck(baseCtx)).rejects.toThrow('GitHub API error (404)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Labels-check operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdLabelsCheck', () => {
  it('succeeds when all required labels exist', async () => {
    let labelsCallCount = 0;
    mockFetch.mockImplementation(() => {
      labelsCallCount++;
      return Promise.resolve(
        labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
      );
    });

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdLabelsCheck(baseCtx);
    expect(stdout.join('')).toContain('OK: all required labels are present');
  });

  it('fails with numeric exit code when labels are missing', async () => {
    let labelsCallCount = 0;
    mockFetch.mockImplementation(() => {
      labelsCallCount++;
      const data = labelsCallCount === 1
        ? okResponse([{ name: 'status:to-do' }, { name: 'type:task' }])
        : okResponse([]);
      return Promise.resolve(data);
    });

    await expect(gh.cmdLabelsCheck(baseCtx)).rejects.toThrow(Error);
  });

  it('returns JSON error when labels are missing in JSON mode', async () => {
    let labelsCallCount = 0;
    mockFetch.mockImplementation(() => {
      labelsCallCount++;
      const data = labelsCallCount === 1
        ? okResponse([{ name: 'status:to-do' }])
        : okResponse([]);
      return Promise.resolve(data);
    });

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await expect(gh.cmdLabelsCheck({ ...baseCtx, jsonMode: true })).rejects.toThrow(Error);
    const json = JSON.parse(stdout.join(''));
    expect(json).toMatchObject({ status: 'error', repo: 'test/repo' });
    expect(json.missing.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// List operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdList', () => {
  const fakeIssues = [
    {
      number: 1,
      title: 'Issue One',
      state: 'open',
      assignees: [{ login: 'user1' }],
      labels: [{ name: 'status:doing' }, { name: 'type:task' }],
      html_url: 'https://github.com/test/repo/issues/1',
    },
    {
      number: 2,
      title: 'Issue Two',
      state: 'open',
      assignees: [],
      labels: [{ name: 'status:to-do' }, { name: 'type:feature' }],
      html_url: 'https://github.com/test/repo/issues/2',
    },
  ];

  it('outputs tab-separated lines for each issue', async () => {
    mockWithLabels('/issues?state=open', fakeIssues);

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdList(baseCtx);
    const output = stdout.join('');
    expect(output).toContain('#1\tIssue One\tassignee:user1\tstatus:doing');
    expect(output).toContain('#2\tIssue Two\tassignee:-\tstatus:to-do');
  });

  it('filters out pull requests', async () => {
    const issuesWithPr = [
      ...fakeIssues,
      { number: 3, title: 'PR', state: 'open', assignees: [], labels: [], html_url: '', pull_request: {} },
    ];
    mockWithLabels('/issues?state=open', issuesWithPr);

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdList(baseCtx);
    const output = stdout.join('');
    expect(output).not.toContain('#3');
    expect(output).toContain('#1');
  });

  it('returns JSON array in --json mode', async () => {
    mockWithLabels('/issues?state=open', fakeIssues);

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdList({ ...baseCtx, jsonMode: true });
    const json = JSON.parse(stdout.join(''));
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({ number: 1, title: 'Issue One' });
    expect(json[1]).toMatchObject({ number: 2, title: 'Issue Two' });
  });

  it('outputs full status label names with status: prefix for multiple status labels', async () => {
    const multiStatusIssues = [
      {
        number: 5,
        title: 'Multi Status',
        state: 'open',
        assignees: [],
        labels: [{ name: 'status:doing' }, { name: 'status:in-review' }, { name: 'type:task' }],
        html_url: 'https://github.com/test/repo/issues/5',
      },
    ];
    mockWithLabels('/issues?state=open', multiStatusIssues);

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdList(baseCtx);
    const output = stdout.join('');
    // Single status label with prefix preserved
    expect(output).toContain('#5\tMulti Status\tassignee:-\tstatus:doing,status:in-review');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdCreate', () => {
  const CREATED_ISSUE = {
    number: 42,
    title: 'New Issue',
    html_url: 'https://github.com/test/repo/issues/42',
    state: 'open',
    assignees: [],
    labels: [],
  };

  it('creates an issue with title only', async () => {
    mockWithLabels('/issues', CREATED_ISSUE, 'POST');

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCreate(baseCtx, ['My Issue']);
    expect(stdout.join('')).toContain(CREATED_ISSUE.html_url);
  });

  it('creates an issue with labels', async () => {
    mockWithLabels('/issues', CREATED_ISSUE, 'POST');

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCreate(baseCtx, ['Test', '--label', 'status:doing', '--label', 'type:bug']);
    expect(stdout.join('')).toContain(CREATED_ISSUE.html_url);
  });

  it('uses --dry-run and does not call API', async () => {

    await gh.cmdCreate({ ...baseCtx, dryRun: true }, ['Dry Run Title']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns JSON in --json mode', async () => {
    mockWithLabels('/issues', CREATED_ISSUE, 'POST');

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCreate({ ...baseCtx, jsonMode: true }, ['My Issue']);
    const json = JSON.parse(stdout.join(''));
    expect(json).toMatchObject({ number: 42, url: CREATED_ISSUE.html_url, title: 'New Issue' });
  });

  it('throws when title is missing', async () => {
    await expect(gh.cmdCreate(baseCtx, [])).rejects.toThrow(Error);
  });

  it('throws on unknown option', async () => {
    await expect(gh.cmdCreate(baseCtx, ['Title', '--bogus'])).rejects.toThrow(Error);
  });

  it('throws when --body-file has no path', async () => {
    await expect(gh.cmdCreate(baseCtx, ['Title', '--body-file'])).rejects.toThrow(Error);
  });

  it('throws when --label has no value', async () => {
    await expect(gh.cmdCreate(baseCtx, ['Title', '--label'])).rejects.toThrow(Error);
  });

  it('parses --body-file=path syntax with equals sign', async () => {
    // The --body-file=path format (with =) should be parsed correctly without error
    await expect(gh.cmdCreate({ ...baseCtx, dryRun: true }, ['Title', '--body-file=some/path.md']))
      .resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Claim operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdClaim', () => {
  it('claims an open unassigned issue', async () => {
    // Labels → Issue view → Issue view (assignee count) → Issue view (labels) → User → Assignee POST
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) {
        return Promise.resolve(okResponse(DEFAULT_ISSUE));
      }
      if (url.includes('/user')) {
        return Promise.resolve(okResponse({ login: 'testuser' }));
      }
      if (url.includes('/assignees')) {
        return Promise.resolve(okResponse({}));
      }
      if (url.includes('/comments')) {
        return Promise.resolve(okResponse({}));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    await gh.cmdClaim(baseCtx, ['1']);
    // Should not throw — means flow completed
  });

  it('throws when issue is already assigned', async () => {
    const assignedIssue = { ...DEFAULT_ISSUE, assignees: [{ login: 'other' }] };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedIssue));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClaim(baseCtx, ['1'])).rejects.toThrow('already assigned');
  });

  it('throws when issue already has status:doing', async () => {
    const doingIssue = { ...DEFAULT_ISSUE, labels: [{ name: 'status:doing' }] };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(doingIssue));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClaim(baseCtx, ['1'])).rejects.toThrow('already has status:doing');
  });

  it('throws when issue is closed', async () => {
    const closedIssue = { ...DEFAULT_ISSUE, state: 'closed' };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(closedIssue));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClaim(baseCtx, ['1'])).rejects.toThrow('not open');
  });

  it('does not mutate in --dry-run', async () => {
    // No fetch mocks needed — dry-run should return before any API call
    await gh.cmdClaim({ ...baseCtx, dryRun: true }, ['1']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('outputs JSON in --json mode', async () => {

    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdClaim({ ...baseCtx, jsonMode: true }, ['1']);
    const json = JSON.parse(stdout.join(''));
    expect(json).toMatchObject({ number: 1, assignee: 'testuser', status: 'doing' });
  });

  it('throws when issue number is missing', async () => {
    await expect(gh.cmdClaim(baseCtx, [])).rejects.toThrow(Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Assign operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdAssign', () => {
  it('assigns a collaborator to an open unassigned issue', async () => {
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdAssign(baseCtx, ['1', 'collabuser']);
  });

  it('throws when collaborator is missing', async () => {
    await expect(gh.cmdAssign(baseCtx, ['1'])).rejects.toThrow(Error);
  });

  it('throws when issue is already assigned', async () => {
    const assigned = { ...DEFAULT_ISSUE, assignees: [{ login: 'other' }] };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assigned));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdAssign(baseCtx, ['1', 'user'])).rejects.toThrow('already assigned');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Release operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdRelease', () => {
  it('releases issue back to status:to-do', async () => {
    const assignedToMe = { ...DEFAULT_ISSUE, assignees: [{ login: 'testuser' }] };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedToMe));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdRelease(baseCtx, ['1']);
  });

  it('handles --blocked reason', async () => {
    const assignedToMe = { ...DEFAULT_ISSUE, assignees: [{ login: 'testuser' }] };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedToMe));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdRelease(baseCtx, ['1', '--blocked', 'Waiting for review']);
  });

  it('throws when assigned to another user', async () => {
    const assignedToOther = { ...DEFAULT_ISSUE, assignees: [{ login: 'other' }] };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedToOther));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdRelease(baseCtx, ['1'])).rejects.toThrow('assigned to');
  });

  it('throws when --blocked has no reason', async () => {
    await expect(gh.cmdRelease(baseCtx, ['1', '--blocked'])).rejects.toThrow(Error);
  });

  it('mutates labels correctly on release to status:to-do', async () => {
    // Issue has all deletable status labels but NOT status:to-do
    const assignedToMe = {
      number: 1,
      title: 'Test Issue',
      state: 'open',
      assignees: [{ login: 'testuser' }],
      labels: [
        { name: 'status:doing' },
        { name: 'status:blocked' },
        { name: 'status:in-review' },
      ],
      html_url: 'https://github.com/test/repo/issues/1',
    };

    let labelsCallCount = 0;
    const deleteUrls: string[] = [];
    const postUrls: string[] = [];
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET';
      if (url.includes('/labels?per_page=100') && method === 'GET') {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1') && method === 'GET') {
        return Promise.resolve(okResponse(assignedToMe));
      }
      if (url.includes('/user') && method === 'GET') {
        return Promise.resolve(okResponse({ login: 'testuser' }));
      }
      if (url.includes('/assignees') && method === 'DELETE') {
        return Promise.resolve(okResponse({}));
      }
      if (url.includes('/labels/') && method === 'DELETE') {
        deleteUrls.push(url);
        return Promise.resolve(okResponse({}));
      }
      if (url.includes('/labels') && method === 'POST') {
        postUrls.push(url);
        return Promise.resolve(okResponse({}));
      }
      if (url.includes('/comments') && method === 'POST') {
        return Promise.resolve(okResponse({}));
      }
      return Promise.reject(new Error(`Unexpected: ${method} ${url}`));
    });

    await gh.cmdRelease(baseCtx, ['1']);

    // Must delete status:doing, status:blocked, status:in-review
    // (Colon is URL-encoded as %3A in the API path)
    expect(deleteUrls.some((u) => u.includes('status%3Adoing'))).toBe(true);
    expect(deleteUrls.some((u) => u.includes('status%3Ablocked'))).toBe(true);
    expect(deleteUrls.some((u) => u.includes('status%3Ain-review'))).toBe(true);
    // Verify exactly 3 label DELETE calls were made
    expect(deleteUrls).toHaveLength(3);
    // Must add status:to-do (issue doesn't have it initially)
    expect(postUrls.some((u) => u.includes('/labels'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Close operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdClose', () => {
  it('closes an open issue with custom summary', async () => {
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdClose(baseCtx, ['1', 'Fixed', 'the', 'bug']);
  });

  it('uses default summary when none provided', async () => {
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdClose(baseCtx, ['1']);
  });

  it('calls PATCH with state closed to close the issue', async () => {
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET';
      if (url.includes('/labels?per_page=100') && method === 'GET') {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1') && method === 'GET') { return Promise.resolve(okResponse(DEFAULT_ISSUE)); }
      if (url.includes('/comments') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/labels/') && method === 'DELETE') { return Promise.resolve(okResponse({})); }
      if (url.includes('/labels') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/issues/1') && method === 'PATCH') {
        return Promise.resolve(okResponse({ ...DEFAULT_ISSUE, state: 'closed' }));
      }
      return Promise.reject(new Error(`Unexpected: ${method} ${url}`));
    });

    await gh.cmdClose(baseCtx, ['1']);

    // Find the PATCH call and verify the request body
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]: [string, RequestInit]) =>
        url.includes('/issues/1') && opts?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(1);
    const body = JSON.parse(patchCalls[0][1].body as string);
    expect(body).toEqual({ state: 'closed' });
  });

  it('throws when issue is already closed', async () => {
    const closed = { ...DEFAULT_ISSUE, state: 'closed' };
    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(closed));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClose(baseCtx, ['1'])).rejects.toThrow('not open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prclose operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdPrclose', () => {
  it('works with --dry-run on feature branch', async () => {

    await gh.cmdPrclose({ ...baseCtx, dryRun: true }, ['1', 'Ready for review']);
    // Dry-run returns early; no API calls at all
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('works with --dry-run on protected branch', async () => {

    await gh.cmdPrclose({ ...baseCtx, dryRun: true }, ['1']);
    // Dry-run returns early; no API calls at all
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when on non-protected branch with dirty tree', async () => {
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      const key = [cmd, ...args].join(' ');
      const map: Record<string, string> = {
        'git rev-parse --show-toplevel': '/tmp/repo',
        'git rev-parse --abbrev-ref HEAD': 'feature/test',
        'git status --porcelain': 'M some-file.ts',
      };
      if (map[key] !== undefined) return map[key];
      throw new Error(`Unexpected execFileSync: ${cmd} ${args.join(' ')}`);
    });

    await expect(gh.cmdPrclose(baseCtx, ['1'])).rejects.toThrow('clean working tree');
  });

  it('throws when no active branch', async () => {
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' && args[2] === 'HEAD') return 'HEAD';
      return '';
    });

    await expect(gh.cmdPrclose(baseCtx, ['1'])).rejects.toThrow('active local branch');
  });

  it('performs full API flow on a feature branch and outputs PR URL', async () => {
    // Full non-dry-run flow on feature/test branch
    const PR_RESPONSE = {
      html_url: 'https://github.com/test/repo/pull/42',
      number: 42,
      title: 'PR Title',
      state: 'open',
    };

    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET';
      if (url.includes('/labels?per_page=100') && method === 'GET') {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1') && method === 'GET') { return Promise.resolve(okResponse(DEFAULT_ISSUE)); }
      if (url === 'https://api.github.com/repos/test/repo' && method === 'GET') {
        return Promise.resolve(okResponse({ default_branch: 'main' }));
      }
      if (url.includes('/user') && method === 'GET') { return Promise.resolve(okResponse({ login: 'testuser' })); }
      if (url.includes('/pulls') && method === 'POST') { return Promise.resolve(okResponse(PR_RESPONSE)); }
      if (url.includes('/comments') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/labels/') && method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204, headers: new Headers(), text: async () => '' });
      }
      if (url.includes('/issues/1/labels') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/issues/42/assignees') && method === 'POST') { return Promise.resolve(okResponse({})); }
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    });

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdPrclose(baseCtx, ['1', 'Ready for review']);
    expect(stdout.join('')).toContain(PR_RESPONSE.html_url);
  });

  it('throws when issue number is missing', async () => {
    await expect(gh.cmdPrclose(baseCtx, [])).rejects.toThrow(Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// prBodyScratchPath + buildPRBody
// ─────────────────────────────────────────────────────────────────────────────

describe('prBodyScratchPath', () => {
  it('returns the canonical temp scratch path for the PR body', () => {
    expect(gh.prBodyScratchPath('/repo/root', 7)).toBe(
      path.join('/repo/root', 'temp', 'pr-body-7.md'),
    );
  });
});

describe('buildPRBody', () => {
  it('reads from PR template when it exists', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValue('Template content\n# PR Title');

    const body = gh.buildPRBody(1);
    expect(body).toContain('Fixes #1');
    expect(body).toContain('Template content');
  });

  it('generates default body when no template file exists', () => {
    mockExistsSync.mockReturnValue(false);

    const body = gh.buildPRBody(1);
    expect(body.startsWith('Fixes #1')).toBe(true);
    expect(body).toContain('## Summary');
    expect(body).toContain('## Testing');
    expect(body).toContain('## Breaking changes');
  });

  it('reads from temp file when it exists', () => {
    // First existsSync call (temp path) returns true, second (template path) returns false
    mockExistsSync
      .mockReturnValueOnce(true)   // temp file exists
      .mockReturnValueOnce(false); // template path does not exist
    mockReadFileSync.mockReturnValue('Custom agent-generated content');

    const body = gh.buildPRBody(1);
    expect(body).toContain('Fixes #1');
    expect(body).toContain('Custom agent-generated content');
  });

  it('reads the scratch file from the canonical prBodyScratchPath (drift guard)', () => {
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockReadFileSync.mockReturnValue('Scratch content');

    gh.buildPRBody(1);

    const scratchPath = gh.prBodyScratchPath('/tmp/repo', 1);
    expect(mockExistsSync.mock.calls[0][0]).toBe(scratchPath);
    expect(mockReadFileSync).toHaveBeenCalledWith(scratchPath, 'utf8');
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// main() dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('main() dispatch', () => {
  it('runs cmdCheck when command is "check"', async () => {
    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    // Stub process.argv
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'test/repo', 'check'];

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.main();
    expect(stdout.join('')).toContain('OK: GitHub access verified');

    process.argv = origArgv;
  });

  it('shows usage and exits for unknown command', async () => {
    process.env.GITHUB_TOKEN = 't';
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'test/repo', 'bogus'];

    await expect(gh.main()).rejects.toThrow(Error);

    process.argv = origArgv;
  });

  it('prints usage and exits 0 for --help without auth', async () => {
    // Prove no auth is needed: --help returns before token resolution
    delete process.env.GITHUB_TOKEN;

    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--help'];

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await expect(gh.main()).resolves.toBeUndefined();
    const output = stdout.join('');
    expect(output).toContain('Usage:');
    expect(output).toContain('check');
    expect(mockFetch).not.toHaveBeenCalled();

    process.argv = origArgv;
  });

  it('prints usage and exits 0 for help command without auth', async () => {
    // Prove no auth is needed: help returns before token resolution
    delete process.env.GITHUB_TOKEN;

    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', 'help'];

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await expect(gh.main()).resolves.toBeUndefined();
    const output = stdout.join('');
    expect(output).toContain('Usage:');
    expect(output).toContain('check');
    expect(mockFetch).not.toHaveBeenCalled();

    process.argv = origArgv;
  });

  it('parses --dry-run flag and skips all API calls for dry-run-aware command', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--dry-run', '--repo', 'test/repo', 'prclose', '1'];

    await gh.main();
    // Dry-run returns early; no API calls at all
    expect(mockFetch).not.toHaveBeenCalled();

    process.argv = origArgv;
  });

  it('parses --json flag and outputs JSON via check', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--json', '--repo', 'test/repo', 'check'];

    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.main();
    const json = JSON.parse(stdout.join(''));
    expect(json).toEqual({ status: 'ok', repo: 'test/repo' });

    process.argv = origArgv;
  });

  it('parses --repo flag and dispatches to list without throwing', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'custom/repo', 'list'];

    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues?state=open')) {
        return Promise.resolve(okResponse([]));
      }
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.main()).resolves.toBeUndefined();

    process.argv = origArgv;
  });

  it('throws Error when no command is provided', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts'];

    await expect(gh.main()).rejects.toThrow(Error);

    process.argv = origArgv;
  });

  it('dispatches to cmdClaim through main()', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'test/repo', 'claim', '1'];

    let labelsCallCount = 0;
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET';
      if (url.includes('/labels?per_page=100') && method === 'GET') {
        labelsCallCount++;
        return Promise.resolve(
          labelsCallCount === 1 ? okResponse(ALL_REQUIRED_LABELS_API) : okResponse([]),
        );
      }
      if (url.includes('/issues/1') && method === 'GET') { return Promise.resolve(okResponse(DEFAULT_ISSUE)); }
      if (url.includes('/user')) { return Promise.resolve(okResponse({ login: 'testuser' })); }
      if (url.includes('/assignees') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/comments') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/labels/') && method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204, headers: new Headers(), text: async () => '' });
      }
      if (url.includes('/labels') && method === 'POST') { return Promise.resolve(okResponse({})); }
      return Promise.reject(new Error(`Unexpected: ${method} ${url}`));
    });

    await expect(gh.main()).resolves.toBeUndefined();

    process.argv = origArgv;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Show operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdShow', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('outputs human-readable issue details', async () => {
    const issue = {
      number: 123,
      title: 'Test Issue Title',
      state: 'open',
      assignees: [{ login: 'user1' }, { login: 'user2' }],
      labels: [{ name: 'status:doing' }, { name: 'type:task' }],
      html_url: 'https://github.com/test/repo/issues/123',
      body: 'Description text here.',
    };
    mockFetch.mockResolvedValue(okResponse(issue));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdShow(baseCtx, ['123']);
    const output = stdout.join('');
    expect(output).toContain('Issue #123: Test Issue Title');
    expect(output).toContain('State: open');
    expect(output).toContain('Assignees: user1, user2');
    expect(output).toContain('Labels: status:doing, type:task');
    expect(output).toContain('Description text here.');
  });

  it('handles unassigned issue with no labels', async () => {
    const issue = {
      number: 456,
      title: 'Minimal Issue',
      state: 'open',
      assignees: [],
      labels: [],
      html_url: 'https://github.com/test/repo/issues/456',
      body: null,
    };
    mockFetch.mockResolvedValue(okResponse(issue));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdShow(baseCtx, ['456']);
    const output = stdout.join('');
    expect(output).toContain('(unassigned)');
    expect(output).toContain('(none)');
    expect(output).toContain('(no description)');
  });

  it('outputs JSON in --json mode', async () => {
    const issue = {
      number: 789,
      title: 'JSON Issue',
      state: 'closed',
      assignees: [{ login: 'assignee1' }],
      labels: [{ name: 'type:bug' }],
      html_url: 'https://github.com/test/repo/issues/789',
      body: 'JSON body.',
    };
    mockFetch.mockResolvedValue(okResponse(issue));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdShow({ ...baseCtx, jsonMode: true }, ['789']);
    const json = JSON.parse(stdout.join(''));
    expect(json).toEqual({
      number: 789,
      title: 'JSON Issue',
      state: 'closed',
      assignees: ['assignee1'],
      labels: ['type:bug'],
      body: 'JSON body.',
      url: 'https://github.com/test/repo/issues/789',
    });
  });

  it('throws on non-existent issue', async () => {
    mockFetch.mockResolvedValue(errorResponse(404, 'Not Found'));
    await expect(gh.cmdShow(baseCtx, ['999'])).rejects.toThrow('GitHub API error (404): Not Found');
  });

  it('throws when issue number is missing', async () => {
    await expect(gh.cmdShow(baseCtx, [])).rejects.toThrow(Error);
  });

  it('throws on invalid issue number', async () => {
    await expect(gh.cmdShow(baseCtx, ['0'])).rejects.toThrow(Error);
    await expect(gh.cmdShow(baseCtx, ['-1'])).rejects.toThrow(Error);
    await expect(gh.cmdShow(baseCtx, ['abc'])).rejects.toThrow(Error);
  });
});
