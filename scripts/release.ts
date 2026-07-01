import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Global state ─────────────────────────────────────────────────────────────
// Mutable via exports for testing; rootDir defaults to cwd because the script
// is expected to run from the repo root.

let dryRun = false;
let rootDir: string = process.cwd();

export function resetState(): void {
  dryRun = false;
  rootDir = process.cwd();
}

export function _setDryRun(v: boolean): void { dryRun = v; }
export function _setRootDir(d: string): void { rootDir = d; }

// ── Help ─────────────────────────────────────────────────────────────────────

export function printUsage(): void {
  console.error([
    'Usage: scripts/release.ts --version <semver> [--dry-run]',
    '',
    'Prepare a new ai-config release.',
    '',
    'Options:',
    '  --version <semver>  New version (e.g., 0.2.0)',
    '  --dry-run           Preview operations without making changes',
    '  -h, --help          Show this help',
  ].join('\n'));
}

// ── Validation ───────────────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export function validateSemVer(version: string): boolean {
  return SEMVER_RE.test(version);
}

// ── Date helper ──────────────────────────────────────────────────────────────

export function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── CHANGELOG helpers ────────────────────────────────────────────────────────

export function buildNewEntry(version: string, date: string): string {
  return (
    `## [${version}] - ${date}\n` +
    '\n' +
    '### Added\n' +
    '\n' +
    '- Placeholder: describe changes for this release.\n'
  );
}

/**
 * Pure function: given the current CHANGELOG content, return the updated
 * content with a new release entry inserted after the header and a new
 * version link prepended at the bottom.
 */
export function updateChangelogContent(
  content: string,
  newVersion: string,
  currentVersion: string,
  date: string,
): string {
  const newEntry = buildNewEntry(newVersion, date);

  // Insert new entry before the first existing ## [version] line
  const entryMatch = content.match(/^## \[/m);
  let updated: string;
  if (entryMatch) {
    const insertPos = entryMatch.index!;
    updated = content.slice(0, insertPos) + newEntry + content.slice(insertPos);
  } else {
    // No existing entry — append
    updated = content + '\n' + newEntry;
  }

  // Prepend new version link before the current version's link
  const oldLink = `[${currentVersion}]:`;
  const newLink = `[${newVersion}]: https://github.com/Macacoders/ai-config/releases/tag/v${newVersion}`;
  if (updated.includes(oldLink)) {
    updated = updated.replace(oldLink, `${newLink}\n${oldLink}`);
  }

  return updated;
}

// ── Git helpers ──────────────────────────────────────────────────────────────

function getGitStatus(): string {
  return execFileSync('git', ['status', '--porcelain'], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
}

function getCurrentBranch(): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
}

function createTag(version: string): void {
  execFileSync('git', ['tag', '-a', `v${version}`, '-m', `Release v${version}`], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 10000,
  });
}

// ── Main pipeline ────────────────────────────────────────────────────────────

export function main(): void {
  try {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      printUsage();
      return;
    }

    let newVersion = '';

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--version') {
        i++;
        if (i >= args.length) {
          console.error('error: --version requires a value');
          printUsage();
          process.exitCode = 1;
          return;
        }
        newVersion = args[i];
      } else if (arg === '--dry-run') {
        dryRun = true;
      } else if (arg === '-h' || arg === '--help') {
        printUsage();
        return;
      } else {
        console.error(`error: unknown option: ${arg}`);
        printUsage();
        process.exitCode = 1;
        return;
      }
    }

    if (!newVersion) {
      console.error('error: --version is required');
      printUsage();
      process.exitCode = 1;
      return;
    }

    // Validate SemVer
    if (!validateSemVer(newVersion)) {
      console.error(
        `error: invalid version format '${newVersion}'. Expected SemVer (e.g., 0.2.0)`,
      );
      process.exitCode = 1;
      return;
    }

    // Read current version from VERSION file
    const versionPath = path.join(rootDir, 'VERSION');
    let currentVersion: string;
    try {
      currentVersion = readFileSync(versionPath, 'utf8').trim();
    } catch {
      currentVersion = '0.0.0';
    }

    console.error(`[release] Current version: ${currentVersion}`);
    console.error(`[release] New version:     ${newVersion}`);
    console.error('');

    // 1. Verify clean working tree
    const status = getGitStatus();
    if (status.length > 0) {
      console.error('error: working tree is not clean. Commit or stash changes first.');
      process.exitCode = 1;
      return;
    }

    // 2. Verify we're on develop
    const branch = getCurrentBranch();
    if (branch !== 'develop') {
      console.error(
        `error: must be on 'develop' branch (currently on '${branch}')`,
      );
      process.exitCode = 1;
      return;
    }

    // 3. Update VERSION file
    console.error(`[release] update VERSION: ${currentVersion} -> ${newVersion}`);
    if (dryRun) {
      console.error('  [dry-run] would write VERSION');
    } else {
      writeFileSync(versionPath, `${newVersion}\n`, 'utf8');
      console.error('  written: VERSION');
    }

    // 4. Update CHANGELOG.md
    const changelogPath = path.join(rootDir, 'CHANGELOG.md');
    if (dryRun) {
      console.error('  [dry-run] would add entry to CHANGELOG.md:\n    ' + buildNewEntry(newVersion, formatDate()).split('\n').join('\n    '));
    } else {
      const content = readFileSync(changelogPath, 'utf8');
      const date = formatDate();
      const updated = updateChangelogContent(content, newVersion, currentVersion, date);
      writeFileSync(changelogPath, updated, 'utf8');
      console.error('  updated: CHANGELOG.md');
    }

    // 5. Create tag
    console.error('');
    console.error(`[release] git tag -a v${newVersion} -m "Release v${newVersion}"`);
    if (dryRun) {
      console.error('  [dry-run] would create tag');
    } else {
      createTag(newVersion);
      console.error(`  created tag: v${newVersion}`);
    }

    // 6. Summary
    console.error('');
    console.error(`=== Release v${newVersion} prepared ===`);
    console.error('');
    console.error('Next steps:');
    console.error(`  1. Review CHANGELOG.md and update the placeholder entry`);
    console.error(`  2. Push the tag:       git push origin v${newVersion}`);
    console.error(`  3. Merge to main:      git checkout main && git merge develop && git push origin main`);
    console.error(`  4. Or push both:       git push origin main v${newVersion}`);
    console.error('');
    console.error('The GitHub Actions workflow will auto-create the release when main is pushed.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message) console.error(message);
    process.exitCode = 1;
  }
}

// ── Main entry guard ─────────────────────────────────────────────────────────
// Only runs when executed directly, not when imported (e.g., by tests).

const __filename = fileURLToPath(import.meta.url);
if (
  __filename === process.argv[1] ||
  process.argv
    .slice(1)
    .some((arg) => arg === __filename || arg.endsWith(path.basename(__filename)))
) {
  main();
}
