import { upgrade } from '../lib/upgrade.js'

export interface UpgradeCommandOptions {
	yes?: boolean
}

export async function upgradeCommand(
	options: UpgradeCommandOptions,
): Promise<void> {
	try {
		const result = await upgrade({ yes: Boolean(options.yes) })
		if (
			result.outcome === 'dev-checkout' ||
			result.outcome === 'no-prefix'
		) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`error: upgrade failed: ${message}`)
		console.error(
			'The upgrade failed and was rolled back where possible; the install may need repair.',
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
