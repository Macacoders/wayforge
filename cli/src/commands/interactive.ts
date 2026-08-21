import fs from 'fs-extra'
import readline from 'node:readline/promises'
import { doInstall } from './install.js'
import type { InstallOptions, Provider } from '../types.js'
import { parseProviders, resolveFastModels } from '../lib/providers.js'

// ponytail: rung 2 — data-driven menu helper; eliminates 7× repeated prompt+switch pattern
async function promptMenu<T>(
	rl: readline.Interface,
	title: string,
	choices: { label: string; value: T; hint?: string }[],
	defaultIdx: number,
): Promise<T> {
	console.log(`\n${title}:`)
	choices.forEach((c, i) => {
		console.log(`  ${String(i + 1)}) ${c.label}`)
		if (c.hint) console.log(`       ${c.hint}`)
	})
	for (;;) {
		const input = (
			await rl.question(
				`Choose ${title.toLowerCase()} [${String(defaultIdx + 1)}]: `,
			)
		).trim()
		const idx = input === '' ? defaultIdx : parseInt(input, 10) - 1
		if (idx >= 0 && idx < choices.length) return choices[idx].value
		console.log('please enter a valid number')
	}
}

// Requirement hints rendered under each provider option BEFORE selection, so
// users know what each choice needs (verified against README + provider blocks).
const PROVIDER_HINTS: Record<Provider, string> = {
	'free-tier': 'nothing required — no external provider',
	openai: 'requires /connect OpenAI auth in OpenCode/Kilo Code',
	'github-copilot': 'requires /connect device login in OpenCode/Kilo Code',
	laberit: 'requires OPENAI_BASE_URL and OPENAI_API_KEY env vars',
	'opencode-go': 'requires /connect OpenCode Go auth in OpenCode/Kilo Code',
}
const providerHint = (value: string): string =>
	value
		.split(',')
		.map((p) => PROVIDER_HINTS[p as Provider])
		.join('; ')

export async function interactiveCommand(): Promise<void> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	try {
		const defaultRepo = process.cwd()
		let repoPath = ''
		for (;;) {
			const input = (
				await rl.question(`Target repository path [${defaultRepo}]: `)
			).trim()
			repoPath = input === '' ? defaultRepo : input
			if (
				fs.pathExistsSync(repoPath) &&
				fs.statSync(repoPath).isDirectory()
			)
				break
			console.log(
				`path does not exist or is not a directory: ${repoPath}`,
			)
		}

		const runtime = await promptMenu(
			rl,
			'Runtime',
			[
				{ label: 'opencode (default)', value: 'opencode' as const },
				{ label: 'kilocode', value: 'kilocode' as const },
			],
			0,
		)

		// Provider selection: opencode includes free-tier, kilocode does not
		const fullProviderChoices = [
			{
				label: 'free-tier (default, no external provider)',
				value: 'free-tier',
			},
			{ label: 'openai', value: 'openai' },
			{ label: 'github-copilot', value: 'github-copilot' },
			{ label: 'laberit', value: 'laberit' },
			{ label: 'opencode-go', value: 'opencode-go' },
			{ label: 'openai,github-copilot', value: 'openai,github-copilot' },
			{ label: 'openai,laberit', value: 'openai,laberit' },
			{
				label: 'github-copilot,laberit',
				value: 'github-copilot,laberit',
			},
			{
				label: 'openai,github-copilot,laberit',
				value: 'openai,github-copilot,laberit',
			},
		]
		const providerChoices =
			runtime === 'opencode'
				? fullProviderChoices
				: fullProviderChoices.filter((c) => c.value !== 'free-tier')
		const providers = await promptMenu(
			rl,
			'Provider set',
			// ponytail: hints derived from one map; combo sets join per-provider requirements
			providerChoices.map((c) => ({ ...c, hint: providerHint(c.value) })),
			0,
		)

		// ponytail: rung 2 — resolveFastModels lives in providers.ts; resolved up front so the
		// preset menu hint can show exactly which models the fast preset selects.
		const fast = resolveFastModels(parseProviders(providers))
		const fastHint =
			fast.model && fast.smallModel
				? `overrides models for speed — main: ${fast.model}, small: ${fast.smallModel}`
				: 'no faster models available for this provider set'

		const modelPreset = await promptMenu(
			rl,
			'Model preset',
			[
				{
					label: 'installer defaults (recommended)',
					value: 'default' as const,
					hint: 'keeps the models the installer assigns by default',
				},
				{
					label: 'faster responses',
					value: 'fast' as const,
					hint: fastHint,
				},
			],
			0,
		)

		let modelOverride: string | undefined
		let smallModelOverride: string | undefined
		if (modelPreset === 'fast') {
			modelOverride = fast.model
			smallModelOverride = fast.smallModel
		}

		const dryRun = await promptMenu(
			rl,
			'Dry run',
			[
				{ label: 'no (default)', value: false },
				{ label: 'yes', value: true },
			],
			0,
		)

		const force = await promptMenu(
			rl,
			'Force refresh managed files',
			[
				{ label: 'no (default)', value: false },
				{ label: 'yes', value: true },
			],
			0,
		)

		console.log('\nGitHub App for issue management (/issue command):')
		console.log(
			'  If you have a GitHub App with Issues and PR permissions, enter its Client ID below.',
		)
		console.log(
			'  Leave blank to skip — you can configure it later in .gh-config/app.yml',
		)
		const ghAppClientIdInput = (
			await rl.question('GitHub App Client ID (leave blank to skip): ')
		).trim()
		const ghAppClientId =
			ghAppClientIdInput === '' ? undefined : ghAppClientIdInput

		console.log('\nProvider connection instructions (not automated):')
		// ponytail: rung 2 — derived from PROVIDER_HINTS; single source of truth
		for (const p of parseProviders(providers)) {
			if (p === 'free-tier') continue
			console.log(`  - ${p}: ${PROVIDER_HINTS[p]}`)
		}

		console.log('\nSummary:')
		console.log(`  Repo: ${repoPath}`)
		console.log(`  Runtime: ${runtime}`)
		console.log(`  Providers: ${providers}`)
		if (modelPreset === 'fast') {
			console.log('  Model preset: faster responses')
			console.log(
				`    Main model override: ${modelOverride ?? '(none resolved for this provider set)'}`,
			)
			console.log(
				`    Small model override: ${smallModelOverride ?? '(none resolved for this provider set)'}`,
			)
		} else {
			console.log('  Model preset: installer defaults')
			console.log('    Model overrides: none (installer defaults)')
		}
		console.log(`  Dry run: ${String(dryRun)}`)
		console.log(`  Force: ${String(force)}`)
		console.log(
			`  GitHub App Client ID: ${ghAppClientId ?? '(not set — configure later in .gh-config/app.yml)'}`,
		)

		const proceedInput = (
			await rl.question('\nProceed with install? [Y/n]: ')
		).trim()
		const proceed = proceedInput === '' ? 'Y' : proceedInput
		const affirmatives = new Set(['Y', 'y', 'yes', 'YES'])
		if (!affirmatives.has(proceed)) {
			console.log('cancelled')
			process.exit(0)
		}

		const options: InstallOptions = {
			repo: repoPath,
			runtime,
			providers,
			model: modelOverride,
			smallModel: smallModelOverride,
			dryRun,
			force,
			ghAppClientId,
			noTrack: false,
		}

		rl.close()
		doInstall(options)
	} catch (error) {
		rl.close()
		throw error
	}
}
