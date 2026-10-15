#!/usr/bin/env bats

# Network-free tests for install/install.sh Node.js provisioning.
# A controlled PATH with stubs (curl, uname, tr, optional node) keeps the
# installer from touching the network or the real system.

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
	TEST_TMPDIR="$(mktemp -d)"
	STUB_DIR="$TEST_TMPDIR/stub"
	TEST_HOME="$TEST_TMPDIR/home"
	TEST_PREFIX="$TEST_TMPDIR/prefix"
	mkdir -p "$STUB_DIR" "$TEST_HOME"
	cat >"$STUB_DIR/curl" <<'EOF'
#!/bin/sh
echo "error: unexpected curl invocation" >&2
exit 1
EOF
	chmod +x "$STUB_DIR/curl"
	# Platform-detection stubs (installer output is already lowercase).
	cat >"$STUB_DIR/uname" <<'EOF'
#!/bin/sh
case "$1" in
-s) echo "linux" ;;
-m) echo "x86_64" ;;
*) echo "linux" ;;
esac
EOF
	chmod +x "$STUB_DIR/uname"
	cat >"$STUB_DIR/tr" <<'EOF'
#!/bin/sh
while IFS= read -r line; do
	printf '%s\n' "$line"
done
EOF
	chmod +x "$STUB_DIR/tr"
}

teardown() {
	rm -rf "$TEST_TMPDIR"
}

stub_node() {
	local version="$1"
	cat >"$STUB_DIR/node" <<EOF
#!/bin/sh
echo "$version"
EOF
	chmod +x "$STUB_DIR/node"
}

run_installer() {
	run env PATH="$STUB_DIR" HOME="$TEST_HOME" /bin/sh "$REPO_ROOT/install/install.sh" --dry-run --version 9.9.9 --prefix "$TEST_PREFIX" "$@"
}

@test "install.sh detects Node.js >= 18 and skips provisioning" {
	stub_node "v18.20.0"
	run_installer
	[ "$status" -eq 0 ]
	[[ "$output" == *"Node.js v18.20.0 detected"* ]]
	[[ "$output" != *"would install Node.js"* ]]
}

@test "install.sh dry-run plans Node.js provisioning when node is missing" {
	run_installer
	[ "$status" -eq 0 ]
	[[ "$output" == *"[dry-run] would install Node.js"* ]]
}

@test "install.sh --skip-node-check prints no Node lines" {
	run_installer --skip-node-check
	[ "$status" -eq 0 ]
	[[ "$output" != *"Node"* ]]
}

@test "install.sh builds releases/download/<tag> URLs" {
	stub_node "v18.20.0"
	run_installer
	[ "$status" -eq 0 ]
	[[ "$output" == *"https://github.com/Macacoders/wayforge/releases/download/v9.9.9/wayforge-linux-x64"* ]]
	[[ "$output" != *"releases/v9.9.9/download"* ]]
}

@test "install.sh --uninstall dry-run plans removal of the provisioned Node" {
	run env PATH="$STUB_DIR" HOME="$TEST_HOME" /bin/sh "$REPO_ROOT/install/install.sh" --uninstall --dry-run --prefix "$TEST_PREFIX"
	[ "$status" -eq 0 ]
	[[ "$output" == *"would remove: ${TEST_PREFIX}/node"* ]]
}
