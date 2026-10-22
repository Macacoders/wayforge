import { selfUpdate } from '../lib/self-update.js'

export interface SelfUpdateCommandOptions {
	check?: boolean
	yes?: boolean
	dryRun?: boolean
}

export async function selfUpdateCommand(
	options: SelfUpdateCommandOptions,
): Promise<void> {
	try {
		const result = await selfUpdate({
			checkOnly: Boolean(options.check),
			yes: Boolean(options.yes),
			dryRun: Boolean(options.dryRun),
		})
		if (
			result.outcome === 'dev-checkout' ||
			result.outcome === 'no-prefix'
		) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`error: self-update failed: ${message}`)
		console.error(
			'The update failed and was rolled back where possible; the install may need repair.',
		)
		console.error('Run the one-shot installer to repair or reinstall:')
		console.error(
			'  curl -fsSL https://github.com/Macacoders/wayforge/releases/latest/download/install.sh | sh',
		)
		console.error(
			'  powershell -c "irm https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 | iex"',
		)
		process.exit(1)
	}
}
