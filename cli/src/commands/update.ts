import { checkForUpdate } from '../lib/release.js'

export async function updateCommand(): Promise<void> {
	try {
		const { current, latest, updateAvailable } = await checkForUpdate()
		process.stdout.write(`current version: v${current.replace(/^v/, '')}\n`)
		process.stdout.write(`latest version: v${latest.replace(/^v/, '')}\n`)
		process.stdout.write(
			updateAvailable
				? "update available: run 'wfg upgrade'\n"
				: 'wayforge is up to date\n',
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`error: update check failed: ${message}`)
		process.exit(1)
	}
}
