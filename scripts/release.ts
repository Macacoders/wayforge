import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { git } from './lib/git.ts';

// ── State ──────────────────────────────────────────────────────────────────
// State is local inside main(). No module-level mutable globals.

// ── Help ─────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.error([
    'Usage: scripts/release.ts --set-version <semver> [--dry-run]',
    '',
    'Prepare a new wayforge release.',
    '',
    'Options:',
    '  --set-version <semver>  New version (e.g., 0.2.0)',
    '  --dry-run               Preview operations without making changes',
    '  -h, --help              Show this help',
  ].join('\n'));
}

// ── Validation ───────────────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

function validateSemVer(version: string): boolean {
  return SEMVER_RE.test(version);
}

// ── CHANGELOG helpers ────────────────────────────────────────────────────────

function buildNewEntry(version: string, date: string): string {
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
  const newLink = `[${newVersion}]: https://github.com/Macacoders/wayforge/releases/tag/v${newVersion}`;
  if (updated.includes(oldLink)) {
    updated = updated.replace(oldLink, `${newLink}\n${oldLink}`);
  }

  return updated;
}

// ── Main pipeline ────────────────────────────────────────────────────────────

export function main(argv = process.argv.slice(2), opts?: { dryRun?: boolean; rootDir?: string }): void {
  let dryRun = opts?.dryRun ?? false;
  const rootDir = opts?.rootDir ?? process.cwd();

  if (argv.length === 0) {
    printUsage();
    return;
  }

  let newVersion: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        'set-version': { type: 'string' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
    });

    if (values.help) {
      printUsage();
      return;
    }

    dryRun = opts?.dryRun ?? values['dry-run'] ?? false;
    newVersion = values['set-version'];
  } catch (err) {
    const typed = err as TypeError & { code?: string; option?: string };
    if (typed.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      const option =
        typed.option ??
        typed.message.match(/Unknown option '(.+?)'/)?.[1] ??
        'unknown';
      console.error(`error: unknown option: ${option}`);
      printUsage();
      process.exitCode = 1;
      return;
    }
    if (typed.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      console.error('error: --set-version requires a value');
      printUsage();
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (!newVersion) {
    console.error('error: --set-version is required');
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

  try {

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
    const status = git(['status', '--porcelain'], rootDir, 10000);
    if (status.length > 0) {
      console.error('error: working tree is not clean. Commit or stash changes first.');
      process.exitCode = 1;
      return;
    }

    // 2. Verify we're on develop
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], rootDir, 10000);
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
      console.error('  [dry-run] would add entry to CHANGELOG.md:\n    ' + buildNewEntry(newVersion, new Date().toISOString().slice(0, 10)).split('\n').join('\n    '));
    } else {
      const content = readFileSync(changelogPath, 'utf8');
      const date = new Date().toISOString().slice(0, 10);
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
      git(['tag', '-a', `v${newVersion}`, '-m', `Release v${newVersion}`], rootDir, 10000);
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
if (process.argv[1] === __filename) {
  main();
}
