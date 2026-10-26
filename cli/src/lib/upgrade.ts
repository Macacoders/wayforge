import path from 'path'
import os from 'os'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { isInstalledBinary, resolveInstallPrefix } from './install.js'
import { checkForUpdate, resolveReleaseRoot } from './release.js'
import { displayVersion } from './version.js'
import { promptYesNo } from './prompt.js'

const DOWNLOAD_TIMEOUT_MS = 60_000
const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const USER_AGENT = 'wayforge/upgrade'
const BACKUP_SUFFIX = '.old-'
const TEMP_BINARY_PREFIX = '.wfg-download-'
const TEMP_SHARE_PREFIX = '.wayforge-update-'

export type UpgradeOutcome = 'up-to-date' | 'declined' | 'updated'

export interface UpgradeResult {
	outcome: UpgradeOutcome
	current: string
	latest: string
}

export interface UpgradeOptions {
	yes?: boolean
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
	rename?: (from: string, to: string) => Promise<void> | void
}

function binaryName(): string {
	return process.platform === 'win32' ? 'wfg.exe' : 'wfg'
}

export function shareArchiveName(tag: string): string {
	const version = tag.replace(/^v/, '')
	return process.platform === 'win32'
		? `wayforge-share-${version}.zip`
		: `wayforge-share-${version}.tar.gz`
}

export function binaryAssetName(): string {
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
	const base = fs.lstatSync(path.join(dir, 'base'), {
		throwIfNoEntry: false,
	})
	if (!base?.isDirectory()) {
		throw new Error('Extracted share archive is missing base/')
	}
	const versionFile = path.join(dir, 'VERSION')
	const versionStat = fs.lstatSync(versionFile, { throwIfNoEntry: false })
	if (!versionStat?.isFile()) {
		throw new Error('Extracted share archive is missing VERSION')
	}
	const version = fs.readFileSync(versionFile, 'utf8').trim()
	if (version !== tag.replace(/^v/, '')) {
		throw new Error(
			`Extracted share VERSION (${version}) does not match target ${tag}`,
		)
	}
}

const pid = String(process.pid)

function backupName(name: string): string {
	return `${name}${BACKUP_SUFFIX}${pid}`
}

const STALE_ARTIFACT_RE =
	/^(?:wfg|wfg\.exe|wayforge)\.old-\d+$|^\.(?:wfg-download|wayforge-update)-\d+(?:-[0-9a-f]{8})?$/

function isStaleArtifact(name: string): boolean {
	return STALE_ARTIFACT_RE.test(name)
}

// Windows transiently locks freshly written/extracted trees (antivirus,
// indexer, lingering child handles), making rename fail with EPERM. A short
// retry absorbs the lock; exhaustion still throws so rollback runs.
async function renameWithRetry(
	from: string,
	to: string,
	attempts = 4,
	delayMs = 75,
): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			fs.renameSync(from, to)
			return
		} catch (error) {
			if (attempt >= attempts) {
				throw error
			}
			await sleep(delayMs)
		}
	}
}

function restore(backupPath: string, originalPath: string): void {
	try {
		fs.renameSync(backupPath, originalPath)
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
	await rename(shareDir, shareBackup)
	try {
		await rename(paths.extractedShareDir, shareDir)
	} catch (error) {
		restore(shareBackup, shareDir)
		throw error
	}

	// Binary second: on Windows the running exe can only be renamed away,
	// not overwritten, so the backup rename is the mechanism on both platforms.
	try {
		await rename(binaryPath, binaryBackup)
	} catch (error) {
		rollShareBack()
		throw error
	}
	try {
		if (process.platform !== 'win32') {
			await fs.chmod(paths.newBinaryPath, 0o755)
		}
		await rename(paths.newBinaryPath, binaryPath)
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
	for (const dir of [path.join(prefix, 'bin'), path.join(prefix, 'share')]) {
		if (!fs.pathExistsSync(dir)) continue
		for (const name of fs.readdirSync(dir)) {
			const target = path.join(dir, name)
			if (isStaleArtifact(name) && fs.statSync(target).mtimeMs < cutoff) {
				fs.removeSync(target)
			}
		}
	}
}

function removeQuiet(target: string): void {
	try {
		fs.removeSync(target)
	} catch {
		// Best-effort temp cleanup.
	}
}

export async function upgrade(
	options: UpgradeOptions = {},
): Promise<UpgradeResult> {
	const log =
		options.log ?? ((line: string) => process.stdout.write(`${line}\n`))

	if (!isInstalledBinary()) {
		throw new Error(
			'upgrade only works for an installed wayforge CLI; from a source checkout run git pull',
		)
	}

	const prefix = options.prefix ?? resolveInstallPrefix()
	if (!prefix) {
		throw new Error(
			'could not resolve the install prefix (share/wayforge not found); set WAYFORGE_INSTALL_DIR to the wayforge install directory',
		)
	}

	const root = options.releaseRoot ?? resolveReleaseRoot()
	const check = await checkForUpdate({
		releaseRoot: root,
		fetchImpl: options.fetchImpl,
	})
	const { current, latest } = check

	if (!check.updateAvailable) {
		log(`wayforge is up to date (${displayVersion(current)})`)
		return { outcome: 'up-to-date', current, latest }
	}

	const binaryUrl = assetUrl(root, latest, binaryAssetName())
	const shareUrl = assetUrl(root, latest, shareArchiveName(latest))

	const promptFn = options.promptFn ?? promptYesNo
	if (!options.yes) {
		const confirmed = await promptFn(
			`Upgrade wayforge ${displayVersion(current)} -> ${latest}? [y/N] `,
		)
		if (!confirmed) {
			log('upgrade declined')
			return { outcome: 'declined', current, latest }
		}
	}

	const fetchImpl = options.fetchImpl ?? fetch

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wayforge-update-'))
	const checksumsPath = path.join(tmpDir, 'wayforge-checksums.txt')
	const archivePath = path.join(tmpDir, shareArchiveName(latest))
	// The binary is downloaded into the temp dir and only staged into `bin/`
	// after checksum verification, so a failed download/verify leaves the
	// install untouched.
	const downloadedBinaryPath = path.join(tmpDir, binaryAssetName())
	// Run-owned paths ensure failed verification cannot delete or reuse
	// pre-existing artifacts left by an earlier process with the same PID.
	const runId = `${pid}-${crypto.randomBytes(4).toString('hex')}`
	const stagedBinaryPath = path.join(
		prefix,
		'bin',
		`${TEMP_BINARY_PREFIX}${runId}`,
	)
	const extractDir = path.join(
		prefix,
		'share',
		`${TEMP_SHARE_PREFIX}${runId}`,
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

		// Cleared only after verification succeeds: a failed verification must
		// leave the install and any pre-existing stale artifacts untouched.
		cleanupStaleBackups(prefix)

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

		log(`upgraded wayforge to ${displayVersion(latest)}`)
		return { outcome: 'updated', current, latest }
	} finally {
		removeQuiet(stagedBinaryPath)
		removeQuiet(extractDir)
		removeQuiet(tmpDir)
	}
}
