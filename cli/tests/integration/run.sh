#!/usr/bin/env bash
set -euo pipefail

TMP_BASE="/tmp/wayforge-integration-test"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

cleanup() {
	rm -rf "$TMP_BASE"
}
trap cleanup EXIT

TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Smoke test: a fresh TS CLI install must exit 0 and produce the
# expected managed artifacts in a clean repo.
run_test() {
	local providers="$1" runtime="$2"
	TEST_COUNT=$((TEST_COUNT + 1))
	local test_dir="${TMP_BASE}/test-${TEST_COUNT}"
	local repo="${test_dir}/repo"
	mkdir -p "$repo"

	echo "=== Test ${TEST_COUNT}: providers=${providers} runtime=${runtime} ==="

	local install_ok=true
	if ! (cd "$ROOT_DIR" && npx tsx cli/src/index.ts install --repo "$repo" --providers "$providers" --runtime "$runtime" --no-track >/dev/null 2>&1); then
		install_ok=false
	fi

	local config_file="opencode.jsonc"
	[ "$runtime" = "kilocode" ] && config_file="kilo.jsonc"

	local missing=""
	[ -f "$repo/.wayforge-managed" ] || missing="${missing} .wayforge-managed"
	[ -f "$repo/$config_file" ] || missing="${missing} $config_file"
	[ -f "$repo/AGENTS.md" ] || missing="${missing} AGENTS.md"
	[ -d "$repo/.opencode/agents" ] || missing="${missing} .opencode/agents/"

	if $install_ok && [ -z "$missing" ]; then
		echo "  PASS"
		PASS_COUNT=$((PASS_COUNT + 1))
	else
		echo "  FAIL"
		$install_ok || echo "  install command exited non-zero"
		[ -z "$missing" ] || echo "  missing expected outputs:${missing}"
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
