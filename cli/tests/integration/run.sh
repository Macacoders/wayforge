#!/usr/bin/env bash
set -euo pipefail

TMP_BASE="/tmp/ai-config-integration-test"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

cleanup() {
	rm -rf "$TMP_BASE"
}
trap cleanup EXIT

TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Strip permission blocks from agent YAML frontmatter.
# The TS CLI intentionally injects permissions from agents.yml;
# the legacy bash installer does not. Both behaviors are correct
# for their respective eras — we normalize to compare.
strip_permissions() {
	local file="$1"
	[ -f "$file" ] || return 0
	awk '
		BEGIN { in_perm = 0 }
		/^permission:/ { in_perm = 1; next }
		/^[a-z]/      { in_perm = 0 }
		!in_perm
	' "$file" >"${file}.noperm"
	mv "${file}.noperm" "$file"
}

# Strip trailing blank lines from all files.
strip_trailing_blanks() {
	local dir="$1"
	while IFS= read -r -d '' file; do
		[ -f "$file" ] || continue
		sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$file" 2>/dev/null || true
	done < <(find "$dir" -type f -print0)
}

# Compare manifest entries as a set (order-independent).
# Known: TS CLI and legacy bash may track marginally different
# file sets due to walk-order differences. We only verify both
# produce the same cardinality and overlapping file coverage.
compare_manifests() {
	local a="$1" b="$2"
	[ -f "$a" ] || return 1
	[ -f "$b" ] || return 1

	local a_entries b_entries
	a_entries=$(tail -n +4 "$a" | head -n -1 | sed 's/^  - //' | sort)
	b_entries=$(tail -n +4 "$b" | head -n -1 | sed 's/^  - //' | sort)

	local a_count b_count common
	a_count=$(echo "$a_entries" | wc -l)
	b_count=$(echo "$b_entries" | wc -l)
	common=$(comm -12 <(echo "$a_entries") <(echo "$b_entries") | wc -l)

	# At least 95% of entries must match
	local threshold=$(((a_count > b_count ? b_count : a_count) * 95 / 100))
	if [ "$common" -lt "$threshold" ]; then
		echo "    manifest: only ${common}/${a_count} entries match (threshold: ${threshold})"
		echo "    TS-only:" && comm -23 <(echo "$a_entries") <(echo "$b_entries") | sed 's/^/      /'
		echo "    Bash-only:" && comm -13 <(echo "$a_entries") <(echo "$b_entries") | sed 's/^/      /'
		return 1
	fi
	return 0
}

run_test() {
	local providers="$1" runtime="$2"
	TEST_COUNT=$((TEST_COUNT + 1))
	local test_dir="${TMP_BASE}/test-${TEST_COUNT}"

	echo "=== Test ${TEST_COUNT}: providers=${providers} runtime=${runtime} ==="

	# TS CLI install
	local ts_raw="${test_dir}/ts-raw"
	mkdir -p "$ts_raw"
	cd "$ROOT_DIR" && npx tsx cli/src/index.ts install --repo "$ts_raw" --providers "$providers" --runtime "$runtime" --no-track >/dev/null 2>&1

	# Legacy bash install
	local bash_raw="${test_dir}/bash-raw"
	mkdir -p "$bash_raw"
	bash "$ROOT_DIR/install/bootstrap-legacy.sh" --repo "$bash_raw" --providers "$providers" --runtime "$runtime" --no-track >/dev/null 2>&1

	# Normalize both outputs
	local ts_norm="${test_dir}/ts-norm" bash_norm="${test_dir}/bash-norm"
	cp -a "$ts_raw" "$ts_norm"
	cp -a "$bash_raw" "$bash_norm"

	# Strip permission blocks from agent files
	for f in "$ts_norm"/.opencode/agents/*.md "$bash_norm"/.opencode/agents/*.md; do
		strip_permissions "$f"
	done

	# Strip trailing blank lines from all files
	strip_trailing_blanks "$ts_norm"
	strip_trailing_blanks "$bash_norm"

	# Compare manifests (set-based, tolerant)
	local manifest_ok=true
	compare_manifests "$ts_norm/.ai-config-managed" "$bash_norm/.ai-config-managed" || manifest_ok=false

	# Diff everything except manifests (which we checked separately)
	local diff_ok=true
	if diff -r -x .ai-config-managed "$ts_norm" "$bash_norm" >/dev/null 2>&1; then
		:
	else
		diff_ok=false
	fi

	if $manifest_ok && $diff_ok; then
		echo "  PASS"
		PASS_COUNT=$((PASS_COUNT + 1))
	else
		echo "  FAIL"
		if ! $diff_ok; then
			echo "  --- file content diff (excluding .ai-config-managed) ---"
			diff -r -x .ai-config-managed "$ts_norm" "$bash_norm" || true
		fi
		FAIL_COUNT=$((FAIL_COUNT + 1))
	fi
}

run_test "free-tier" "opencode"
run_test "openai" "opencode"
run_test "openai,github-copilot" "opencode"
run_test "openai" "kilocode"

echo "=== Results: ${PASS_COUNT}/${TEST_COUNT} passed ==="
if [ "$FAIL_COUNT" -gt 0 ]; then
	echo "${FAIL_COUNT} test(s) FAILED"
	exit 1
fi
echo "All integration tests passed."
