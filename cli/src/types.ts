export type Provider =
	'openai' | 'github-copilot' | 'laberit' | 'opencode-go' | 'free-tier'

export type Runtime = 'opencode' | 'kilocode'

export { ManifestContext, SyncTreeResult } from './lib/context.js'

export interface InstallOptions {
	repo: string
	providers: string
	model?: string
	smallModel?: string
	runtime: Runtime
	ref?: string
	dryRun: boolean
	force: boolean
	skipNodeCheck?: boolean
	noTrack: boolean
}
