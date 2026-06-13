#!/usr/bin/env bats

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
	TEST_TMPDIR="$(mktemp -d)"
	TEST_REPO="$TEST_TMPDIR/target-repo"
	mkdir -p "$TEST_REPO"
}

teardown() {
	rm -rf "$TEST_TMPDIR"
}

@test "bootstrap-interactive.sh shows help" {
	run "$REPO_ROOT/install/bootstrap-interactive.sh" --help
	[ "$status" -eq 0 ]
	[[ "$output" == *"Guided interactive installer"* ]]
}

@test "bootstrap-interactive.sh can cancel before invoking install" {
	input="${TEST_REPO}
1
1
1
1
1
1
n
"
	run bash -c 'printf "%s" "$1" | "$2/install/bootstrap-interactive.sh"' _ "$input" "$REPO_ROOT"
	[ "$status" -eq 0 ]
	[[ "$output" == *"Summary:"* ]]
	[[ "$output" == *"[ai-config] cancelled"* ]]
	[ ! -e "$TEST_REPO/.opencode" ]
	[ ! -e "$TEST_REPO/opencode.jsonc" ]
}

@test "bootstrap-interactive.sh runs a dry-run install with selected presets" {
	input="${TEST_REPO}
2
4
2
2
2
1
Y
"
	run bash -c 'printf "%s" "$1" | "$2/install/bootstrap-interactive.sh"' _ "$input" "$REPO_ROOT"
	[ "$status" -eq 0 ]
	[[ "$output" == *"Model override: opencode-go/deepseek-v4-flash"* ]]
	[[ "$output" == *"Small model override: opencode-go/deepseek-v4-flash"* ]]
	[[ "$output" == *"Agent preset: fast"* ]]
	[[ "$output" == *"DRY-RUN: would generate local config: $TEST_REPO/kilo.jsonc"* ]]
	[ ! -e "$TEST_REPO/.opencode" ]
	[ ! -e "$TEST_REPO/kilo.jsonc" ]
}

@test "bootstrap-interactive.sh rejects invalid runtime selections" {
	input="${TEST_REPO}
9
"
	run bash -c 'printf "%s" "$1" | "$2/install/bootstrap-interactive.sh"' _ "$input" "$REPO_ROOT"
	[ "$status" -eq 1 ]
	[[ "$output" == *"invalid runtime selection: 9"* ]]
}
