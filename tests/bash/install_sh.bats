#!/usr/bin/env bats

# Network-free tests for install/install.sh.
# A controlled PATH with stubs (curl, uname, tr, sha256sum, optional node)
# keeps the installer from touching the network or the real system.

bats_require_minimum_version 1.5.0

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

install_env() {
	TEST_FIXTURES="$TEST_TMPDIR/fixtures"
	mkdir -p "$TEST_FIXTURES/share/base"
	printf 'binary' >"$TEST_FIXTURES/wayforge-linux-x64"
	printf '1.0.0' >"$TEST_FIXTURES/share/VERSION"
	tar -czf "$TEST_FIXTURES/wayforge-share-9.9.9.tar.gz" -C "$TEST_FIXTURES/share" base VERSION
	# Fixture-aware curl stub: serves local files, never touches the network.
	cat >"$STUB_DIR/curl" <<'EOF'
#!/bin/sh
dest=""
url=""
prev=""
for arg in "$@"; do
	if [ "$prev" = "-o" ]; then
		dest="$arg"
		prev=""
		continue
	fi
	case "$arg" in
	-o) prev="-o"; continue ;;
	esac
	url="$arg"
done
case "$url" in
*/wayforge-linux-x64) cp "$TEST_FIXTURES/wayforge-linux-x64" "$dest" ;;
*/wayforge-share-9.9.9.tar.gz) cp "$TEST_FIXTURES/wayforge-share-9.9.9.tar.gz" "$dest" ;;
*wayforge-checksums.txt)
	if [ "${FAKE_MISSING_CHECKSUMS:-0}" = "1" ]; then exit 22; fi
	cp "$TEST_FIXTURES/wayforge-checksums.txt" "$dest"
	;;
*)
	echo "error: unexpected curl URL: $url" >&2
	exit 22
	;;
esac
EOF
	chmod +x "$STUB_DIR/curl"
	# Deterministic digest stub: prints $FAKE_DIGEST for any file.
	cat >"$STUB_DIR/sha256sum" <<'EOF'
#!/bin/sh
printf '%s  %s\n' "${FAKE_DIGEST:-}" "$1"
EOF
	chmod +x "$STUB_DIR/sha256sum"
}

# write_checksums <binary-digest> <share-digest> [include-binary-entry]
write_checksums() {
	{
		if [ "${3:-1}" = "1" ]; then
			printf '%s  dist/wayforge-linux-x64\n' "$1"
		fi
		printf '%s  wayforge-share-9.9.9.tar.gz\n' "$2"
	} >"$TEST_FIXTURES/wayforge-checksums.txt"
}

run_full_install() {
	run --separate-stderr env PATH="$STUB_DIR:/usr/bin:/bin" HOME="$TEST_HOME" \
		TEST_FIXTURES="$TEST_FIXTURES" FAKE_DIGEST="$1" "${@:2}" \
		/bin/sh "$REPO_ROOT/install/install.sh" \
		--version 9.9.9 --url-base https://fixture.invalid \
		--skip-node-check --prefix "$TEST_PREFIX"
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

DIGEST_OK="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
DIGEST_BAD="ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

@test "install.sh verifies matching checksums and installs" {
	install_env
	write_checksums "$DIGEST_OK" "$DIGEST_OK"
	run_full_install "$DIGEST_OK"
	[ "$status" -eq 0 ]
	[[ "$output" == *"verified wayforge-linux-x64 checksum"* ]]
	# -x is unreliable on Windows/MSYS (chmod is a no-op there); assert
	# existence and content instead.
	[ -f "$TEST_PREFIX/bin/wfg" ]
	[ "$(cat "$TEST_PREFIX/bin/wfg")" = "binary" ]
	[ -d "$TEST_PREFIX/share/wayforge/base" ]
}

@test "install.sh aborts on binary checksum mismatch without touching prefix" {
	install_env
	write_checksums "$DIGEST_BAD" "$DIGEST_OK"
	run_full_install "$DIGEST_OK"
	[ "$status" -eq 1 ]
	[[ "$stderr" == *"checksum mismatch for wayforge-linux-x64"* ]]
	[ ! -e "$TEST_PREFIX/bin" ]
	[ ! -e "$TEST_PREFIX/share" ]
}

@test "install.sh leaves a pre-existing install untouched on mismatch" {
	install_env
	write_checksums "$DIGEST_BAD" "$DIGEST_OK"
	mkdir -p "$TEST_PREFIX/bin"
	printf 'OLDBIN' >"$TEST_PREFIX/bin/wfg"
	run_full_install "$DIGEST_OK"
	[ "$status" -eq 1 ]
	[ "$(cat "$TEST_PREFIX/bin/wfg")" = "OLDBIN" ]
}

@test "install.sh warns and continues when checksums file is unavailable" {
	install_env
	run_full_install "$DIGEST_OK" FAKE_MISSING_CHECKSUMS=1
	[ "$status" -eq 0 ]
	[[ "$stderr" == *"warning: wayforge-checksums.txt is unavailable for v9.9.9; skipping checksum verification"* ]]
	[ -f "$TEST_PREFIX/bin/wfg" ]
	[ "$(cat "$TEST_PREFIX/bin/wfg")" = "binary" ]
	[ -d "$TEST_PREFIX/share/wayforge/base" ]
}

@test "install.sh aborts when checksum file has no entry for the binary" {
	install_env
	write_checksums "" "$DIGEST_OK" 0
	run_full_install "$DIGEST_OK"
	[ "$status" -eq 1 ]
	[[ "$stderr" == *"no entry for wayforge-linux-x64"* ]]
}

@test "install.sh dry-run prints checksum URL and would-verify plan" {
	run env PATH="$STUB_DIR" HOME="$TEST_HOME" /bin/sh "$REPO_ROOT/install/install.sh" --dry-run --version 9.9.9 --url-base https://fixture.invalid --skip-node-check --prefix "$TEST_PREFIX"
	[ "$status" -eq 0 ]
	[[ "$output" == *"https://fixture.invalid/wayforge-checksums.txt"* ]]
	[[ "$output" == *"[dry-run] would verify"* ]]
}

@test "install.sh contains both sha256sum and shasum fallback" {
	grep -q 'sha256sum' "$REPO_ROOT/install/install.sh"
	grep -q 'shasum -a 256' "$REPO_ROOT/install/install.sh"
}
