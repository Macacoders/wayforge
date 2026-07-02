// ── release.test.ts — Unit tests for scripts/release.ts ─────────────────────
//
// Strategy:
//   - Mock child_process.execFileSync globally (git commands)
//   - Mock node:fs readFileSync and writeFileSync (file I/O)
//   - Use exported functions from release.ts directly
//   - Pure functions (validateSemVer, buildNewEntry, updateChangelogContent)
//     are tested directly without mocks

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Module-level mocks (hoisted by vitest) ──────────────────────────────────

const mockExecFileSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFileSync: mockExecFileSync }));

const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

// ── Module under test ──────────────────────────────────────────────────────

import * as release from '../../../scripts/release.ts';

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_CHANGELOG =
  '# Changelog\n' +
  '\n' +
  'All notable changes...\n' +
  '\n' +
  '## [0.1.0] - 2026-06-10\n' +
  '\n' +
  '### Added\n' +
  '\n' +
  '- Something.\n' +
  '\n' +
  '[0.1.0]: https://github.com/Macacoders/ai-config/releases/tag/v0.1.0\n';

const DEFAULT_CHANGELOG_HEADER =
  '# Changelog\n' +
  '\n' +
  'All notable changes...\n';

/** Helper: capture console.error output during a callback. */
function captureStderr(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
    lines.push(String(msg));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

// ── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  process.exitCode = 0;
  mockExecFileSync.mockReset();
  mockReadFileSync.mockReset();
  mockWriteFileSync.mockReset();

  // Default git: clean tree on develop, tag creation succeeds
  mockExecFileSync.mockImplementation((_cmd: string, _args: string[]) => {
    const key = [_cmd, ..._args].join(' ');
    const map: Record<string, string> = {
      'git status --porcelain': '',
      'git rev-parse --abbrev-ref HEAD': 'develop',
    };
    if (map[key] !== undefined) return map[key];
    // Accept any git tag command (used in non-dry-run pipeline)
    if (_cmd === 'git' && _args[0] === 'tag') return '';
    throw new Error(`Unexpected execFileSync: ${_cmd} ${_args.join(' ')}`);
  });

  // Default fs: VERSION present, CHANGELOG with one entry
  mockReadFileSync.mockImplementation((filePath: string) => {
    if (filePath.endsWith('VERSION')) return '0.1.0\n';
    if (filePath.endsWith('CHANGELOG.md')) return DEFAULT_CHANGELOG;
    throw new Error(`Unexpected readFileSync: ${filePath}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSemVer — pure function
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSemVer', () => {
  it.each([
    ['0.1.0'],
    ['1.0.0-alpha.1'],
  ])('accepts valid SemVer: %s', (version) => {
    expect(release.validateSemVer(version)).toBe(true);
  });

  it.each([
    ['v1.0.0'],
    ['abc'],
    [''],
  ])('rejects invalid SemVer: %s', (version) => {
    expect(release.validateSemVer(version)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildNewEntry — pure function
// ─────────────────────────────────────────────────────────────────────────────

describe('buildNewEntry', () => {
  it('builds the entry with correct format', () => {
    const entry = release.buildNewEntry('0.2.0', '2026-07-01');
    expect(entry).toBe(
      '## [0.2.0] - 2026-07-01\n' +
      '\n' +
      '### Added\n' +
      '\n' +
      '- Placeholder: describe changes for this release.\n',
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// updateChangelogContent — pure function
// ─────────────────────────────────────────────────────────────────────────────

describe('updateChangelogContent', () => {
  it('inserts new entry before the first existing entry', () => {
    const result = release.updateChangelogContent(
      DEFAULT_CHANGELOG,
      '0.2.0',
      '0.1.0',
      '2026-07-01',
    );

    // New entry heading appears
    expect(result).toContain('## [0.2.0] - 2026-07-01');
    // Old entry still present
    expect(result).toContain('## [0.1.0] - 2026-06-10');
    // New entry comes before old entry
    expect(result.indexOf('## [0.2.0]')).toBeLessThan(result.indexOf('## [0.1.0]'));
  });

  it('adds new version link before the old link', () => {
    const result = release.updateChangelogContent(
      DEFAULT_CHANGELOG,
      '0.2.0',
      '0.1.0',
      '2026-07-01',
    );

    expect(result).toContain(
      '[0.2.0]: https://github.com/Macacoders/ai-config/releases/tag/v0.2.0',
    );
    expect(result).toContain('[0.1.0]: https://github.com/Macacoders/ai-config/releases/tag/v0.1.0');
    // New link before old link
    expect(result.indexOf('[0.2.0]:')).toBeLessThan(result.indexOf('[0.1.0]:'));
  });

  it('preserves content before the first entry (header)', () => {
    const result = release.updateChangelogContent(
      DEFAULT_CHANGELOG,
      '0.2.0',
      '0.1.0',
      '2026-07-01',
    );

    expect(result.startsWith('# Changelog\n\nAll notable changes...\n\n')).toBe(true);
  });

  it('appends entry when changelog has no existing entries', () => {
    const headerOnly = '# Changelog\n\nHeader content.\n';
    const result = release.updateChangelogContent(headerOnly, '0.2.0', '0.0.0', '2026-07-01');

    expect(result).toContain('## [0.2.0] - 2026-07-01');
    expect(result).toContain('# Changelog');
  });

  it('does not add version link when old link is absent', () => {
    const noLink = DEFAULT_CHANGELOG_HEADER + '## [0.1.0] - 2026-06-10\n\n### Added\n\n- Foo.\n';
    const result = release.updateChangelogContent(noLink, '0.2.0', '0.1.0', '2026-07-01');

    // Matches original shell behavior: new link is only inserted before
    // the existing [oldVersion]: link. If absent, no link is added.
    expect(result).not.toContain('[0.2.0]:');
    // New entry is still added
    expect(result).toContain('## [0.2.0] - 2026-07-01');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// main() — argument parsing, git checks, file updates, dry-run
// ─────────────────────────────────────────────────────────────────────────────

describe('main', () => {
  it('shows usage with no arguments and exits 0', () => {
    const lines = captureStderr(() => release.main([]));

    expect(lines.some((l) => l.includes('Usage:'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('shows usage with --help and exits 0', () => {
    const lines = captureStderr(() => release.main(['--help']));

    expect(lines.some((l) => l.includes('Usage:'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('shows usage with -h and exits 0', () => {
    const lines = captureStderr(() => release.main(['-h']));

    expect(lines.some((l) => l.includes('Usage:'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('errors on unknown option', () => {
    const lines = captureStderr(() => release.main(['--bogus']));

    expect(lines.some((l) => l.includes('unknown option'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors when --version has no value', () => {
    const lines = captureStderr(() => release.main(['--version']));

    expect(lines.some((l) => l.includes('requires a value'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors when --version is missing', () => {
    const lines = captureStderr(() => release.main(['--dry-run']));

    expect(lines.some((l) => l.includes('--version is required'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors on invalid SemVer version', () => {
    const lines = captureStderr(() => release.main(['--version', 'abc']));

    expect(lines.some((l) => l.includes('invalid version format'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors on dirty working tree', () => {
    mockExecFileSync.mockImplementation((_cmd: string, _args: string[]) => {
      const key = [_cmd, ..._args].join(' ');
      if (key === 'git status --porcelain') return 'M some-file.ts\n';
      if (key === 'git rev-parse --abbrev-ref HEAD') return 'develop';
      throw new Error(`Unexpected: ${_cmd} ${_args.join(' ')}`);
    });

    const lines = captureStderr(() => release.main(['--version', '0.2.0']));

    expect(lines.some((l) => l.includes('working tree is not clean'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors when not on develop branch', () => {
    mockExecFileSync.mockImplementation((_cmd: string, _args: string[]) => {
      const key = [_cmd, ..._args].join(' ');
      if (key === 'git status --porcelain') return '';
      if (key === 'git rev-parse --abbrev-ref HEAD') return 'main';
      throw new Error(`Unexpected: ${_cmd} ${_args.join(' ')}`);
    });

    const lines = captureStderr(() => release.main(['--version', '0.2.0']));

    expect(lines.some((l) => l.includes("must be on 'develop'"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('dry-run does not write files or create tag', () => {
    const lines = captureStderr(() => release.main(['--version', '0.2.0', '--dry-run']));

    expect(lines.some((l) => l.includes('[dry-run] would write VERSION'))).toBe(true);
    expect(lines.some((l) => l.includes('[dry-run] would add entry to CHANGELOG.md'))).toBe(true);
    expect(lines.some((l) => l.includes('[dry-run] would create tag'))).toBe(true);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    const tagCalls = mockExecFileSync.mock.calls.filter(
      ([cmd, args]: [string, string[]]) => cmd === 'git' && args[0] === 'tag',
    );
    expect(tagCalls).toHaveLength(0);
    expect(process.exitCode).toBe(0);
  });

  it('performs full release pipeline in normal mode', () => {
    captureStderr(() => release.main(['--version', '0.2.0']));

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('VERSION'),
      '0.2.0\n',
      'utf8',
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('CHANGELOG.md'),
      expect.stringContaining('## [0.2.0]'),
      'utf8',
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['tag', '-a', 'v0.2.0', '-m', 'Release v0.2.0'],
      expect.objectContaining({ cwd: expect.any(String), encoding: 'utf8' }),
    );
    expect(process.exitCode).toBe(0);
  });

  it('falls back to 0.0.0 when VERSION file is missing', () => {
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('VERSION')) throw new Error('ENOENT');
      if (filePath.endsWith('CHANGELOG.md')) return DEFAULT_CHANGELOG;
      throw new Error(`Unexpected: ${filePath}`);
    });

    const lines = captureStderr(() => release.main(['--version', '0.2.0', '--dry-run']));

    expect(lines.some((l) => l.includes('Current version: 0.0.0'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });
});
