import path from 'path'
import fs from 'fs-extra'
import { resolveSourceDir, shareDirFromPrefix } from './source-dir.js'

const INSTALLED_BINARY_NAMES = new Set(['wfg', 'wfg.exe'])

export function isInstalledBinary(): boolean {
	const binaryName = path.basename(process.execPath).toLowerCase()
	if (!INSTALLED_BINARY_NAMES.has(binaryName)) {
		return false
	}
	const sourceDir = resolveSourceDir()
	return (
		fs.pathExistsSync(path.join(sourceDir, 'base')) &&
		fs.pathExistsSync(path.join(sourceDir, 'VERSION'))
	)
}

export function resolveInstallPrefix(): string | null {
	const configured = process.env.WAYFORGE_INSTALL_DIR
	const prefix = configured
		? path.resolve(configured)
		: path.resolve(path.dirname(process.execPath), '..')
	if (fs.pathExistsSync(shareDirFromPrefix(prefix))) {
		return prefix
	}
	return null
}
