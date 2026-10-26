#!/usr/bin/env bats

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
	TEST_TMPDIR="$(mktemp -d)"
	STUB_ROOT="$TEST_TMPDIR/wayforge-home"
	STUB_CLI_DIR="$STUB_ROOT/cli/src"
	export CAPTURE_FILE="$TEST_TMPDIR/cli-args.txt"
	TARGET_REPO="$TEST_TMPDIR/target-repo"
	mkdir -p "$STUB_CLI_DIR" "$TARGET_REPO"
	cat >"$STUB_CLI_DIR/index.ts" <<'EOF'
import * as fs from 'node:fs';
const capture = process.env.CAPTURE_FILE;
if (capture) {
	fs.writeFileSync(capture, process.argv.slice(2).join('\n') + '\n');
}
EOF
	chmod +x "$STUB_CLI_DIR/index.ts"
}

teardown() {
	rm -rf "$TEST_TMPDIR"
}

@test "_wayforge_root prefers WAYFORGE_HOME" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; WAYFORGE_HOME="$2"; _wayforge_root' _ "$REPO_ROOT" "$STUB_ROOT"
	[ "$status" -eq 0 ]
	[ "$output" = "$STUB_ROOT" ]
}

@test "wayforge-setup-repo requires a path" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; wayforge-setup-repo' _ "$REPO_ROOT"
	[ "$status" -eq 1 ]
	[[ "$output" == *"usage: wayforge-setup-repo <path>"* ]]
}

@test "wayforge-setup-repo rejects missing directories" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; wayforge-setup-repo "$2"' _ "$REPO_ROOT" "$TEST_TMPDIR/does-not-exist"
	[ "$status" -eq 1 ]
	[[ "$output" == *"error: repo path does not exist: $TEST_TMPDIR/does-not-exist"* ]]
}

@test "wayforge-setup-repo-dry-run forwards install, repo path and dry-run flag" {
	run bash -c 'source "$1/install/bashrc_snippet.sh"; WAYFORGE_HOME="$2"; wayforge-setup-repo-dry-run "$3"' _ "$REPO_ROOT" "$STUB_ROOT" "$TARGET_REPO"
	[ "$status" -eq 0 ]
	run bash -c 'mapfile -t args <"$1"; printf "%s|%s|%s|%s\n" "${args[0]}" "${args[1]}" "${args[2]}" "${args[3]}"' _ "$CAPTURE_FILE"
	[ "$status" -eq 0 ]
	# Node normalizes the repo path to a Windows form (C:/...) on Git Bash/Windows;
	# normalize the expectation the same way when cygpath is available.
	if command -v cygpath >/dev/null 2>&1; then
		EXPECTED_REPO="$(cygpath -m "$TARGET_REPO")"
	else
		EXPECTED_REPO="$TARGET_REPO"
	fi
	[ "$output" = "install|--repo|$EXPECTED_REPO|--dry-run" ]
}
