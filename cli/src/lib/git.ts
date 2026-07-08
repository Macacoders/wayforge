import { execSync } from 'child_process'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { readFileOrDefault } from './files.js'

/**
 * Clone ai-config at a specific git ref into a temp directory.
 * Returns { sourceDir, version, cleanup } where cleanup() removes temp dir.
 * Exits process on clone failure (matches bash behavior).
 */
export function cloneRef(
	rootDir: string,
	ref: string,
	log: (msg: string) => void,
): { sourceDir: string; version: string; cleanup: () => void } {
	let repoUrl = ''
	try {
		repoUrl = execSync('git remote get-url origin', {
			cwd: rootDir,
			encoding: 'utf8',
		}).trim()
	} catch {
		repoUrl = 'https://github.com/Macacoders/ai-config.git'
	}

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-config-'))

	log(`fetching ref '${ref}' from ${repoUrl} ...`)
	try {
		execSync(
			`git clone --branch "${ref}" --depth 1 "${repoUrl}" "${tempDir}"`,
			{
				encoding: 'utf8',
				stdio: 'pipe',
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: '0',
					GIT_ASKPASS: 'echo',
				},
			},
		)
	} catch (err) {
		fs.removeSync(tempDir)
		const message = err instanceof Error ? err.message : String(err)
		log(`error: failed to clone ref '${ref}' from ${repoUrl}`)
		log(`       verify the ref exists and is reachable`)
		log(`       ${message}`)
		process.exit(1)
	}

	const version = readFileOrDefault(tempDir, 'VERSION', '0.0.0')

	log(`using release source from ref '${ref}' (version ${version})`)

	return {
		sourceDir: tempDir,
		version,
		cleanup: () => {
			try {
				fs.removeSync(tempDir)
			} catch {
				/* ignore */
			}
		},
	}
}
