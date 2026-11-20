export type Provider =
	'openai' | 'github-copilot' | 'laberit' | 'opencode-go' | 'free-tier'

export type Runtime = 'opencode' | 'kilocode' | 'claude'

export { ManifestContext, SyncTreeResult } from './lib/context.js'

export interface InstallOptions {
	repo: string
	providers: string
	model?: string
	smallModel?: string
	runtime: Runtime
	/** Resolved Claude model (`--model` value or `inherit`); Claude only. */
	claudeModel?: string
	ref?: string
	dryRun: boolean
	force: boolean
	skipNodeCheck?: boolean
	noTrack: boolean
}
