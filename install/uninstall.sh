#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=install/lib/managed_sync.sh
source "$SCRIPT_DIR/lib/managed_sync.sh"

DRY_RUN=0
REPO_PATH=""

log() {
	printf '[ai-config] %s\n' "$*"
}

usage() {
	cat <<'EOF'
Usage:
  ./install/uninstall.sh --repo <path> [--dry-run]

Options:
  --repo <path>  Uninstall ai-config managed files from the target project.
  --dry-run      Print planned operations without modifying files.
  -h, --help     Show this help.
EOF
}

if [[ $# -eq 0 ]]; then
	usage
	exit 1
fi

while [[ $# -gt 0 ]]; do
	case "$1" in
	--repo)
		REPO_PATH="${2:-}"
		if [[ -z "$REPO_PATH" ]]; then
			log "error: --repo requires a path"
			exit 1
		fi
		shift 2
		;;
	--dry-run)
		DRY_RUN=1
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		log "error: unknown option: $1"
		usage
		exit 1
		;;
	esac
done

if [[ -z "$REPO_PATH" ]]; then
	log "error: --repo <path> is required"
	exit 1
fi

if [[ ! -d "$REPO_PATH" ]]; then
	log "error: repo path does not exist: $REPO_PATH"
	exit 1
fi

# Read the managed manifest to discover all tracked paths
if ! read_managed_manifest "$REPO_PATH"; then
	log "error: no .ai-config-managed found in $REPO_PATH"
	exit 1
fi

# Remove each managed file
removed_files=0
for rel_path in "${_MANAGED_MANIFEST_PATHS[@]}"; do
	abs_path="$REPO_PATH/$rel_path"
	if [[ -f "$abs_path" || -L "$abs_path" ]]; then
		removed_files=$((removed_files + 1))
	fi
	run_rm "$abs_path"
done

# Remove the manifest file itself (last, since we read from it)
manifest_path="$REPO_PATH/.ai-config-managed"
if [[ -f "$manifest_path" ]]; then
	run_rm "$manifest_path"
fi

# Clean up empty parent directories
cleaned_dirs=0
for rel_path in "${_MANAGED_MANIFEST_PATHS[@]}"; do
	abs_path="$REPO_PATH/$rel_path"
	dir="$(dirname "$abs_path")"
	while [[ "$dir" != "$REPO_PATH" ]]; do
		if [[ "$DRY_RUN" -eq 1 ]]; then
			if [[ -d "$dir" && -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
				cleaned_dirs=$((cleaned_dirs + 1))
				log "DRY-RUN: would remove empty directory: $dir"
			fi
		else
			if rmdir "$dir" 2>/dev/null; then
				cleaned_dirs=$((cleaned_dirs + 1))
				log "removed empty directory: $dir"
			fi
		fi
		# Safety: ensure we make progress toward repo root
		parent="$(dirname "$dir")"
		if [[ "$parent" == "$dir" ]]; then
			break
		fi
		dir="$parent"
	done
done

# Remove tracking entry from installed-projects.json
# Canonicalize the repo path for JSON matching
canonical_repo_path=""
if command -v realpath &>/dev/null; then
	canonical_repo_path="$(realpath "$REPO_PATH")"
else
	canonical_repo_path="$(cd "$REPO_PATH" && pwd -P)"
fi
# Convert to Windows-native format for cross-platform compatibility
if command -v wslpath &>/dev/null; then
	canonical_repo_path="$(wslpath -w "$canonical_repo_path" 2>/dev/null || printf '%s' "$canonical_repo_path")"
fi

tracking_file="$ROOT_DIR/installed-projects.json"
if [[ -f "$tracking_file" ]]; then
	if command -v jq &>/dev/null; then
		# Use jq for JSON manipulation
		_matches="$(jq --arg p "$canonical_repo_path" '[.projects[] | select(.path == $p)] | length' "$tracking_file" 2>/dev/null || echo 0)"
		if [[ "$_matches" -gt 0 ]]; then
			_total_projects="$(jq '.projects | length' "$tracking_file")"
			if [[ "$DRY_RUN" -eq 1 ]]; then
				if [[ "$_total_projects" -eq 1 ]]; then
					log "DRY-RUN: would remove tracking file (last project uninstalled): $tracking_file"
				else
					log "DRY-RUN: would remove tracking entry: $canonical_repo_path"
				fi
			else
				if [[ "$_total_projects" -eq 1 ]]; then
					rm -f "$tracking_file"
					log "removed tracking file (last project uninstalled): $tracking_file"
				else
					jq --arg p "$canonical_repo_path" 'del(.projects[] | select(.path == $p))' "$tracking_file" >"${tracking_file}.tmp" && mv "${tracking_file}.tmp" "$tracking_file"
					log "removed tracking entry: $canonical_repo_path"
				fi
			fi
		fi
	else
		# Fallback: grep-based approach without jq
		_escaped_path="$(printf '%s' "$canonical_repo_path" | sed 's/\\/\\\\/g')"
		# Match on the escaped path string directly (unique across entries)
		if grep -Fq "$_escaped_path" "$tracking_file" 2>/dev/null; then
			_total_projects="$(grep -c '"path":' "$tracking_file" 2>/dev/null || echo 0)"
			if [[ "$DRY_RUN" -eq 1 ]]; then
				if [[ "$_total_projects" -le 1 ]]; then
					log "DRY-RUN: would remove tracking file (last project uninstalled): $tracking_file"
				else
					log "DRY-RUN: would remove tracking entry: $canonical_repo_path"
				fi
			else
				if [[ "$_total_projects" -le 1 ]]; then
					rm -f "$tracking_file"
					log "removed tracking file (last project uninstalled): $tracking_file"
				else
					# Read all lines, find matching entry, remove it, fix trailing comma
					_tmpfile="${tracking_file}.tmp"
					_lines=()
					while IFS= read -r _line; do
						_lines+=("$_line")
					done <"$tracking_file"
					_total="${#_lines[@]}"

					# Find the line containing the matching path
					_match_idx=-1
					for ((_i = 0; _i < _total; _i++)); do
						if [[ "${_lines[$_i]}" == *"$_escaped_path"* ]]; then
							_match_idx=$_i
							break
						fi
					done

					if [[ "$_match_idx" -ge 0 ]]; then
						# Find entry start: walk backward to find opening '{'
						_entry_start=$_match_idx
						while [[ "$_entry_start" -gt 0 ]]; do
							if [[ "${_lines[$_entry_start]}" =~ ^[[:space:]]*\{ ]]; then
								break
							fi
							_entry_start=$((_entry_start - 1))
						done

						# Find entry end: walk forward to find closing '}' or '},'
						_entry_end=$_match_idx
						while [[ "$_entry_end" -lt "$_total" ]]; do
							if [[ "${_lines[$_entry_end]}" =~ ^[[:space:]]*\}[,]*[[:space:]]*$ ]]; then
								break
							fi
							_entry_end=$((_entry_end + 1))
						done

						# Fix trailing comma on the entry before the removed one
						_prev_idx=$((_entry_start - 1))
						if [[ "$_prev_idx" -ge 0 && "${_lines[$_prev_idx]}" =~ ,$ ]]; then
							_lines[$_prev_idx]="${_lines[$_prev_idx]%,}"
						fi

						# Write all lines except the entry range
						: >"$_tmpfile"
						for ((_i = 0; _i < _total; _i++)); do
							if [[ "$_i" -ge "$_entry_start" && "$_i" -le "$_entry_end" ]]; then
								continue
							fi
							printf '%s\n' "${_lines[$_i]}" >>"$_tmpfile"
						done

						mv "$_tmpfile" "$tracking_file"
						log "removed tracking entry: $canonical_repo_path"
					fi
				fi
			fi
		fi
	fi
fi

# Summary
if [[ "$DRY_RUN" -eq 1 ]]; then
	log "DRY-RUN: summary: would remove $removed_files managed file(s), would clean $cleaned_dirs empty directory(ies)"
else
	log "summary: removed $removed_files managed file(s), cleaned $cleaned_dirs empty directory(ies)"
fi
