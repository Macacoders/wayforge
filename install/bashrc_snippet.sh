#!/usr/bin/env bash

# Source this file from your ~/.bashrc to expose wayforge helper functions.
# Note: install aliases delegate to the TypeScript CLI directly (npx tsx).
# Uninstall already uses the TS CLI directly.

_wayforge_root() {
	if [[ -n "${WAYFORGE_HOME:-}" && -d "${WAYFORGE_HOME}" ]]; then
		printf '%s\n' "$WAYFORGE_HOME"
		return
	fi

	local script_dir
	script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	printf '%s\n' "$(cd "$script_dir/.." && pwd)"
}

wayforge-setup-repo() {
	local repo_path="${1:-}"

	if [[ -z "$repo_path" ]]; then
		printf '%s\n' "usage: wayforge-setup-repo <path>"
		return 1
	fi

	if [[ ! -d "$repo_path" ]]; then
		printf '%s\n' "error: repo path does not exist: $repo_path"
		return 1
	fi

	local root
	root="$(_wayforge_root)"
	npx tsx "$root/cli/src/index.ts" install --repo "$repo_path"
}

wayforge-setup-repo-dry-run() {
	local repo_path="${1:-}"

	if [[ -z "$repo_path" ]]; then
		printf '%s\n' "usage: wayforge-setup-repo-dry-run <path>"
		return 1
	fi

	local root
	root="$(_wayforge_root)"
	npx tsx "$root/cli/src/index.ts" install --repo "$repo_path" --dry-run
}

wayforge-uninstall-repo() {
	local repo_path="${1:-}"

	if [[ -z "$repo_path" ]]; then
		printf '%s\n' "usage: wayforge-uninstall-repo <path>"
		return 1
	fi

	if [[ ! -d "$repo_path" ]]; then
		printf '%s\n' "error: repo path does not exist: $repo_path"
		return 1
	fi

	local root
	root="$(_wayforge_root)"
	npx tsx "$root/cli/src/index.ts" uninstall --repo "$repo_path"
}

wayforge-uninstall-repo-dry-run() {
	local repo_path="${1:-}"

	if [[ -z "$repo_path" ]]; then
		printf '%s\n' "usage: wayforge-uninstall-repo-dry-run <path>"
		return 1
	fi

	local root
	root="$(_wayforge_root)"
	npx tsx "$root/cli/src/index.ts" uninstall --repo "$repo_path" --dry-run
}
