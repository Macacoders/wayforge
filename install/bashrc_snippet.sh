#!/usr/bin/env bash

# Source this file from your ~/.bashrc to expose ai-config helper functions.

_ai_config_root() {
	if [[ -n "${AI_CONFIG_HOME:-}" && -d "${AI_CONFIG_HOME}" ]]; then
		printf '%s\n' "$AI_CONFIG_HOME"
		return
	fi

	local script_dir
	script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	printf '%s\n' "$(cd "$script_dir/.." && pwd)"
}

ai-setup-repo() {
	local repo_path="${1:-}"

	if [[ -z "$repo_path" ]]; then
		printf '%s\n' "usage: ai-setup-repo <path>"
		return 1
	fi

	if [[ ! -d "$repo_path" ]]; then
		printf '%s\n' "error: repo path does not exist: $repo_path"
		return 1
	fi

	local root
	root="$(_ai_config_root)"
	"$root/install/bootstrap.sh" --repo "$repo_path"
}

ai-setup-repo-dry-run() {
	local repo_path="${1:-}"

	if [[ -z "$repo_path" ]]; then
		printf '%s\n' "usage: ai-setup-repo-dry-run <path>"
		return 1
	fi

	local root
	root="$(_ai_config_root)"
	"$root/install/bootstrap.sh" --repo "$repo_path" --dry-run
}
