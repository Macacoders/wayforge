# qa/_helpers.sh -- shared helper functions for qa/ scripts
# Source this file from other scripts using:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${SCRIPT_DIR}/_helpers.sh"
# NOTE: This file is sourced, not executed. It inherits set flags from the caller.

# ponytail: top-level helper; extracted from duplicated definitions in consumers
run_pwsh_heredoc() {
	local tmp_ps
	local status
	tmp_ps="$(mktemp)"
	cat >"$tmp_ps"
	if pwsh -NoProfile -NonInteractive -File "$tmp_ps"; then
		status=0
	else
		status=$?
	fi
	rm -f "$tmp_ps"
	return "$status"
}

# ponytail: top-level helper; extracted from duplicated definitions in check-bash and fix-bash
is_bash_shebang() {
	local file="$1"
	local first_line
	IFS= read -r first_line <"$file" || true
	[[ "$first_line" =~ ^\#\!.*(env[[:space:]]+)?(ba)?sh([[:space:]]|$) ]]
}

find_bash_files() {
	{
		find . \
			-type f \
			-name "*.sh" \
			-not -path "./.git/*" \
			-print0

		find ./qa \
			-type f \
			-perm -u+x \
			-not -name "*.*" \
			-print0 2>/dev/null
	} | while IFS= read -r -d '' file; do
		if [[ "$file" == *.sh ]] || is_bash_shebang "$file"; then
			printf '%s\0' "$file"
		fi
	done
}
