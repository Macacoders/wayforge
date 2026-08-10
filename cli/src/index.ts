#!/usr/bin/env node

import { Command } from 'commander'
import { installCommand } from './commands/install.js'
import { uninstallCommand } from './commands/uninstall.js'
import { interactiveCommand } from './commands/interactive.js'
import type { InstallOptions, Runtime } from './types.js'

const program = new Command('ai-config')

program
	.name('ai-config')
	.description('Cross-platform CLI installer for ai-config')
	.version(process.env.AI_CONFIG_VERSION || '0.1.0', '-v, --version')

program
	.command('install')
	.description('Install ai-config managed files into a target repository')
	.requiredOption(
		'--repo <path>',
		'Link OpenCode config into a target project.',
	)
	.option(
		'--providers <list>',
		'Provider set to enable: openai | github-copilot | laberit | opencode-go | free-tier | comma-separated combinations',
		'free-tier',
	)
	.option(
		'--model <provider/model>',
		'Override default model (must belong to an enabled provider)',
	)
	.option(
		'--small-model <provider/model>',
		'Override default small model (must belong to an enabled provider)',
	)
	.addOption(
		new Command()
			.createOption(
				'--runtime <name>',
				'Runtime to configure: opencode (default) or kilocode.',
			)
			.choices(['opencode', 'kilocode'])
			.default('opencode'),
	)
	.option(
		'--ref <ref>',
		'Fetch source from a specific Git ref (tag, branch, commit) on GitHub. Without --ref, installs from the local ai-config source tree.',
	)
	.option(
		'--gh-app-client-id <id>',
		'GitHub App Client ID for issue management (Iv1...). Creates .gh-config/app.yml.',
	)
	.option(
		'--dry-run',
		'Print planned operations without modifying files.',
		false,
	)
	.option(
		'--force',
		'Refresh managed targets and generated runtime trees; preserve unmanaged local files.',
		false,
	)
	.option(
		'--no-track',
		'Skip recording this project in installed-projects.json.',
	)
	.action((options: Record<string, unknown>) => {
		const installOptions: InstallOptions = {
			repo: options.repo as string,
			providers: options.providers as string,
			model: options.model as string | undefined,
			smallModel: options.smallModel as string | undefined,
			runtime: options.runtime as Runtime,
			ref: options.ref as string | undefined,
			ghAppClientId: options.ghAppClientId as string | undefined,
			dryRun: Boolean(options.dryRun),
			force: Boolean(options.force),
			noTrack: options.track === false,
		}
		installCommand(installOptions)
	})

program
	.command('uninstall')
	.description('Uninstall ai-config managed files from a target repository')
	.requiredOption(
		'--repo <path>',
		'Uninstall ai-config managed files from the target project.',
	)
	.option(
		'--dry-run',
		'Print planned operations without modifying files.',
		false,
	)
	.action((options: Record<string, unknown>) => {
		uninstallCommand({
			repo: options.repo as string,
			dryRun: Boolean(options.dryRun),
		})
	})

program
	.command('interactive')
	.description(
		'Guided interactive installer that collects safe preset choices',
	)
	.action(async () => {
		await interactiveCommand()
	})

program.parseAsync(process.argv).catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
})
