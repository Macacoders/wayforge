#!/usr/bin/env bats

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
	TEST_TMPDIR="$(mktemp -d)"
	STUB_ROOT="$TEST_TMPDIR/ai-config-home"
	STUB_INSTALL_DIR="$STUB_ROOT/install"
	CAPTURE_FILE="$TEST_TMPDIR/bootstrap-args.txt"
	TARGET_REPO="$TEST_TMPDIR/target-repo"
	mkdir -p "$STUB_INSTALL_DIR" "$TARGET_REPO"
	cat >"$STUB_INSTALL_DIR/bootstrap.sh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$@" >"$CAPTURE_FILE"
EOF
	chmod +x "$STUB_INSTALL_DIR/bootstrap.sh"
}

teardown() {
	rm -rf "$TEST_TMPDIR"
}

@test "_ai_config_root prefers AI_CONFIG_HOME" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; AI_CONFIG_HOME="$2"; _ai_config_root' _ "$REPO_ROOT" "$STUB_ROOT"
	[ "$status" -eq 0 ]
	[ "$output" = "$STUB_ROOT" ]
}

@test "ai-setup-repo requires a path" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; ai-setup-repo' _ "$REPO_ROOT"
	[ "$status" -eq 1 ]
	[[ "$output" == *"usage: ai-setup-repo <path>"* ]]
}

@test "ai-setup-repo rejects missing directories" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; ai-setup-repo "$2"' _ "$REPO_ROOT" "$TEST_TMPDIR/does-not-exist"
	[ "$status" -eq 1 ]
	[[ "$output" == *"error: repo path does not exist: $TEST_TMPDIR/does-not-exist"* ]]
}

@test "ai-setup-repo-dry-run forwards repo path and dry-run flag" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; AI_CONFIG_HOME="$2"; ai-setup-repo-dry-run "$3"' _ "$REPO_ROOT" "$STUB_ROOT" "$TARGET_REPO"
	[ "$status" -eq 0 ]
	run bash -c 'mapfile -t args <"$1"; printf "%s|%s|%s\n" "${args[0]}" "${args[1]}" "${args[2]}"' _ "$CAPTURE_FILE"
	[ "$status" -eq 0 ]
	[ "$output" = "--repo|$TARGET_REPO|--dry-run" ]
}
