import path from 'path'
import os from 'os'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'
import { isInstalledBinary, resolveInstallPrefix } from './install.js'
import { resolveLatestReleaseVersion, resolveReleaseRoot } from './release.js'
import { getCurrentVersion, isNewer } from './version.js'
import { promptYesNo } from './prompt.js'

const DOWNLOAD_TIMEOUT_MS = 60_000
const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const USER_AGENT = 'wayforge/self-update'

export type SelfUpdateOutcome =
	| 'dev-checkout'
	| 'no-prefix'
	| 'up-to-date'
	| 'check'
	| 'dry-run'
	| 'declined'
	| 'updated'

export interface SelfUpdateResult {
	outcome: SelfUpdateOutcome
	current: string
	latest: string
	binaryUrl?: string
	shareUrl?: string
}

export interface SelfUpdateOptions {
	checkOnly?: boolean
	yes?: boolean
	dryRun?: boolean
	prefix?: string
	releaseRoot?: string
	fetchImpl?: typeof fetch
	promptFn?: (question: string) => Promise<boolean>
	log?: (line: string) => void
}

export interface ReplacePaths {
	prefix: string
	extractedShareDir: string
	newBinaryPath: string
	/** Test seam: inject a rename failure. Defaults to renameWithRetry. */
	rename?: (from: string, to: string) => void
}

function binaryName(): string {
	return process.platform === 'win32' ? 'wfg.exe' : 'wfg'
}

function shareArchiveName(tag: string): string {
	const version = tag.replace(/^v/, '')
	return process.platform === 'win32'
		? `wayforge-share-${version}.zip`
		: `wayforge-share-${version}.tar.gz`
}

function binaryAssetName(): string {
	const ext = process.platform === 'win32' ? '.exe' : ''
	return `wayforge-${process.platform}-${process.arch}${ext}`
}

function assetUrl(releaseRoot: string, tag: string, asset: string): string {
	return `${releaseRoot}/download/${tag}/${asset}`
}

export function parseChecksums(text: string): Map<string, string> {
	const checksums = new Map<string, string>()
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (line === '') continue
		const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line)
		if (!match) continue
		// sha256sum keys include the path it was run from (e.g. `dist/…`);
		// normalize to the bare asset name.
		checksums.set(
			path.posix.basename(match[2].trim()),
			match[1].toLowerCase(),
		)
	}
	return checksums
}

export async function sha256File(filePath: string): Promise<string> {
	const hash = crypto.createHash('sha256')
	await pipeline(fs.createReadStream(filePath), hash)
	return hash.digest('hex')
}

async function downloadTo(
	url: string,
	dest: string,
	fetchImpl: typeof fetch,
): Promise<void> {
	const response = await fetchImpl(url, {
		redirect: 'follow',
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
		headers: { 'User-Agent': USER_AGENT },
	})
	if (!response.ok) {
		throw new Error(
			`Download failed with status ${String(response.status)}: ${url}`,
		)
	}
	if (!response.body) {
		throw new Error(`Download returned no body: ${url}`)
	}
	await pipeline(
		Readable.fromWeb(
			response.body as import('node:stream/web').ReadableStream,
		),
		fs.createWriteStream(dest),
	)
}

function extractArchive(archive: string, dest: string): void {
	// Windows 10+ ships bsdtar as tar.exe, which handles both tar.gz and zip.
	const result = spawnSync('tar', ['-xf', archive, '-C', dest])
	if (result.error) {
		throw new Error(
			`Extraction failed: could not run tar (${result.error.message})`,
		)
	}
	if (result.status !== 0) {
		const stderr = result.stderr.toString().trim()
		throw new Error(
			`Extraction failed: ${stderr || `tar exited ${String(result.status)}`}`,
		)
	}
}

function verifyExtractedShare(dir: string, tag: string): void {
	if (!fs.pathExistsSync(path.join(dir, 'base'))) {
		throw new Error('Extracted share archive is missing base/')
	}
	const versionFile = path.join(dir, 'VERSION')
	if (!fs.pathExistsSync(versionFile)) {
		throw new Error('Extracted share archive is missing VERSION')
	}
	const version = fs.readFileSync(versionFile, 'utf8').trim()
	if (version !== tag.replace(/^v/, '')) {
		throw new Error(
			`Extracted share VERSION (${version}) does not match target ${tag}`,
		)
	}
}

function backupName(name: string): string {
	return `${name}.old-${String(process.pid)}`
}

// Windows transiently locks freshly written/extracted trees (antivirus,
// indexer, lingering child handles), making rename fail with EPERM. A short
// retry absorbs the lock; exhaustion still throws so rollback runs.
function renameWithRetry(
	from: string,
	to: string,
	attempts = 4,
	delayMs = 75,
): void {
	for (let attempt = 1; ; attempt++) {
		try {
			fs.renameSync(from, to)
			return
		} catch (error) {
			if (attempt >= attempts) {
				throw error
			}
			Atomics.wait(
				new Int32Array(new SharedArrayBuffer(4)),
				0,
				0,
				delayMs,
			)
		}
	}
}

function restore(backupPath: string, originalPath: string): void {
	try {
		if (fs.pathExistsSync(backupPath)) {
			fs.renameSync(backupPath, originalPath)
		}
	} catch {
		// Best effort during rollback; the error below reports the real failure.
	}
}

/**
 * Replace `share/wayforge` (first) and the binary (second) using
 * `*.old-<pid>` backups, restoring them on any failure. Test seam for
 * rollback behaviour.
 */
export async function replaceInstall(paths: ReplacePaths): Promise<void> {
	const rename = paths.rename ?? renameWithRetry
	const shareDir = path.join(paths.prefix, 'share', 'wayforge')
	const shareBackup = path.join(paths.prefix, 'share', backupName('wayforge'))
	const binaryPath = path.join(paths.prefix, 'bin', binaryName())
	const binaryBackup = path.join(
		paths.prefix,
		'bin',
		backupName(binaryName()),
	)

	// Undo a partial share replacement so the install stays internally
	// consistent (new share must never pair with the old binary).
	const rollShareBack = (): void => {
		try {
			fs.renameSync(shareDir, paths.extractedShareDir)
			restore(shareBackup, shareDir)
		} catch {
			// Leave whatever could be restored; the caller reports the cause.
		}
	}

	fs.ensureDirSync(path.dirname(shareBackup))
	fs.ensureDirSync(path.dirname(binaryBackup))
	// A crashed earlier run may have left a backup with the same pid; clear it
	// so the rename below cannot collide.
	removeQuiet(shareBackup)
	removeQuiet(binaryBackup)

	// Share first: a failure here leaves the old binary in place.
	rename(shareDir, shareBackup)
	try {
		rename(paths.extractedShareDir, shareDir)
	} catch (error) {
		restore(shareBackup, shareDir)
		throw error
	}

	// Binary second: on Windows the running exe can only be renamed away,
	// not overwritten, so the backup rename is the mechanism on both platforms.
	try {
		rename(binaryPath, binaryBackup)
	} catch (error) {
		rollShareBack()
		throw error
	}
	try {
		if (process.platform !== 'win32') {
			await fs.chmod(paths.newBinaryPath, 0o755)
		}
		rename(paths.newBinaryPath, binaryPath)
	} catch (error) {
		restore(binaryBackup, binaryPath)
		// Roll the share back too: the install must stay internally consistent.
		rollShareBack()
		throw error
	}
}

export function cleanupStaleBackups(
	prefix: string,
	now: number = Date.now(),
): void {
	const cutoff = now - BACKUP_MAX_AGE_MS
	const binDir = path.join(prefix, 'bin')
	const shareDir = path.join(prefix, 'share')
	if (!fs.pathExistsSync(binDir) || !fs.pathExistsSync(shareDir)) {
		return
	}
	for (const name of fs.readdirSync(binDir)) {
		const filePath = path.join(binDir, name)
		if (
			(/\.old-\d+$/.test(name) || /^\.wfg-download-\d+$/.test(name)) &&
			fs.statSync(filePath).mtimeMs < cutoff
		) {
			fs.removeSync(filePath)
		}
	}
	for (const name of fs.readdirSync(shareDir)) {
		const dirPath = path.join(shareDir, name)
		if (
			(/^wayforge\.old-\d+$/.test(name) ||
				/^\.wayforge-update-\d+$/.test(name)) &&
			fs.statSync(dirPath).mtimeMs < cutoff
		) {
			fs.removeSync(dirPath)
		}
	}
}

function removeQuiet(target: string): void {
	try {
		if (fs.pathExistsSync(target)) {
			fs.removeSync(target)
		}
	} catch {
		// Best-effort temp cleanup.
	}
}

export async function selfUpdate(
	options: SelfUpdateOptions = {},
): Promise<SelfUpdateResult> {
	const log =
		options.log ?? ((line: string) => process.stdout.write(`${line}\n`))

	if (!isInstalledBinary()) {
		log('error: self-update only works for an installed wayforge CLI.')
		log(
			'  From a source checkout, update the repository (git pull) or run the',
		)
		log('  one-shot installer instead:')
		log(
			'    curl -fsSL https://github.com/Macacoders/wayforge/releases/latest/download/install.sh | sh',
		)
		log(
			'    powershell -c "irm https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 | iex"',
		)
		return {
			outcome: 'dev-checkout',
			current: getCurrentVersion(),
			latest: '',
		}
	}

	const prefix = options.prefix ?? resolveInstallPrefix()
	if (!prefix) {
		log(
			'error: could not resolve the install prefix (share/wayforge not found).',
		)
		log('  Set WAYFORGE_INSTALL_DIR to the wayforge install directory.')
		return {
			outcome: 'no-prefix',
			current: getCurrentVersion(),
			latest: '',
		}
	}

	const current = getCurrentVersion()
	const latest = await resolveLatestReleaseVersion({
		releaseRoot: options.releaseRoot,
		fetchImpl: options.fetchImpl,
	})

	const root = options.releaseRoot ?? resolveReleaseRoot()
	const binaryUrl = assetUrl(root, latest, binaryAssetName())
	const shareUrl = assetUrl(root, latest, shareArchiveName(latest))

	// --check is read-only and must report both versions, up to date or not.
	if (options.checkOnly) {
		log(`current version: v${current.replace(/^v/, '')}`)
		log(`latest version: ${latest}`)
		if (!isNewer(current, latest)) {
			log('wayforge is up to date')
		}
		return { outcome: 'check', current, latest, binaryUrl, shareUrl }
	}

	if (!isNewer(current, latest)) {
		log(`wayforge is up to date (v${current.replace(/^v/, '')})`)
		return { outcome: 'up-to-date', current, latest }
	}

	if (options.dryRun) {
		log(
			`DRY-RUN: would update wayforge v${current.replace(/^v/, '')} -> ${latest}`,
		)
		log(`DRY-RUN: binary asset: ${binaryUrl}`)
		log(`DRY-RUN: share asset: ${shareUrl}`)
		return { outcome: 'dry-run', current, latest, binaryUrl, shareUrl }
	}

	const promptFn = options.promptFn ?? promptYesNo
	if (!options.yes) {
		const confirmed = await promptFn(
			`Update wayforge v${current.replace(/^v/, '')} -> ${latest}? [y/N] `,
		)
		if (!confirmed) {
			log('update declined')
			return { outcome: 'declined', current, latest }
		}
	}

	const fetchImpl = options.fetchImpl ?? fetch
	// Only now (after confirmation) may the install be touched.
	cleanupStaleBackups(prefix)

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wayforge-update-'))
	const checksumsPath = path.join(tmpDir, 'wayforge-checksums.txt')
	const archivePath = path.join(tmpDir, shareArchiveName(latest))
	// The binary is downloaded into the temp dir and only staged into `bin/`
	// after checksum verification, so a failed download/verify leaves the
	// install untouched.
	const downloadedBinaryPath = path.join(tmpDir, binaryAssetName())
	const stagedBinaryPath = path.join(
		prefix,
		'bin',
		`.wfg-download-${String(process.pid)}`,
	)
	const extractDir = path.join(
		prefix,
		'share',
		`.wayforge-update-${String(process.pid)}`,
	)

	try {
		await downloadTo(
			assetUrl(root, latest, 'wayforge-checksums.txt'),
			checksumsPath,
			fetchImpl,
		)
		await downloadTo(binaryUrl, downloadedBinaryPath, fetchImpl)
		await downloadTo(shareUrl, archivePath, fetchImpl)

		// Verify before any filesystem mutation of the install.
		const checksums = parseChecksums(fs.readFileSync(checksumsPath, 'utf8'))
		const binaryExpected = checksums.get(binaryAssetName())
		if (!binaryExpected) {
			throw new Error(
				`checksum file has no entry for ${binaryAssetName()}; aborting without changes`,
			)
		}
		const shareExpected = checksums.get(shareArchiveName(latest))
		if (!shareExpected) {
			throw new Error(
				`checksum file has no entry for ${shareArchiveName(latest)}; aborting without changes`,
			)
		}
		const binaryHash = await sha256File(downloadedBinaryPath)
		if (binaryHash !== binaryExpected) {
			throw new Error(
				`checksum mismatch for ${binaryAssetName()}: expected ${binaryExpected}, got ${binaryHash}`,
			)
		}
		const shareHash = await sha256File(archivePath)
		if (shareHash !== shareExpected) {
			throw new Error(
				`checksum mismatch for ${shareArchiveName(latest)}: expected ${shareExpected}, got ${shareHash}`,
			)
		}

		fs.ensureDirSync(extractDir)
		extractArchive(archivePath, extractDir)
		verifyExtractedShare(extractDir, latest)

		// Stage the verified binary next to its target for the atomic rename.
		fs.copySync(downloadedBinaryPath, stagedBinaryPath)

		await replaceInstall({
			prefix,
			extractedShareDir: extractDir,
			newBinaryPath: stagedBinaryPath,
		})

		// Success: drop the backups created by replaceInstall.
		removeQuiet(path.join(prefix, 'share', backupName('wayforge')))
		removeQuiet(path.join(prefix, 'bin', backupName(binaryName())))

		log(`updated wayforge to ${latest}`)
		return { outcome: 'updated', current, latest }
	} finally {
		removeQuiet(stagedBinaryPath)
		removeQuiet(extractDir)
		removeQuiet(tmpDir)
	}
}
