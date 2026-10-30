#!/usr/bin/env bats

# Network-free tests for install/install.sh.
# A controlled PATH with stubs (curl, uname, tr, sha256sum, optional node)
# keeps the installer from touching the network or the real system.
# Uses only Bats 1.2.1-compatible features; stderr is captured explicitly to
# a file rather than relying on version-specific run flags.

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
	COSIGN_ARGS_LOG="$TEST_TMPDIR/cosign-args.log"
	mkdir -p "$TEST_FIXTURES/share/base"
	printf 'binary' >"$TEST_FIXTURES/wayforge-linux-x64"
	printf '1.0.0' >"$TEST_FIXTURES/share/VERSION"
	printf 'fixture-bundle' >"$TEST_FIXTURES/wayforge-checksums.txt.sigstore.json"
	tar -czf "$TEST_FIXTURES/wayforge-share-9.9.9.tar.gz" -C "$TEST_FIXTURES/share" base VERSION
	# Fixture-aware curl stub: serves local files, never touches the network.
	cat >"$STUB_DIR/curl" <<'EOF'
#!/bin/sh
dest=""
url=""
write_out=""
prev=""
for arg in "$@"; do
	case "$prev" in
	-o)
		dest="$arg"
		prev=""
		continue
		;;
	-w)
		write_out="$arg"
		prev=""
		continue
		;;
	esac
	case "$arg" in
	-o | -w) prev="$arg"; continue ;;
	esac
	url="$arg"
done
case "$url" in
*/wayforge-linux-x64) cp "$TEST_FIXTURES/wayforge-linux-x64" "$dest" ;;
*/wayforge-share-9.9.9.tar.gz) cp "$TEST_FIXTURES/wayforge-share-9.9.9.tar.gz" "$dest" ;;
*wayforge-checksums.txt.sigstore.json)
	if [ "${FAKE_BUNDLE_TIMEOUT:-0}" = "1" ]; then
		# Transport failure: no status line, curl-like exit 28.
		exit 28
	fi
	status="${FAKE_BUNDLE_STATUS:-200}"
	if [ -n "$write_out" ]; then
		printf '%s' "$status"
	fi
	if [ "$status" = "200" ]; then
		cp "$TEST_FIXTURES/wayforge-checksums.txt.sigstore.json" "$dest"
	fi
	;;
*wayforge-checksums.txt)
	if [ "${FAKE_CHECKSUM_TIMEOUT:-0}" = "1" ]; then
		# Transport failure: no status line, curl-like exit 28.
		exit 28
	fi
	status="${FAKE_CHECKSUM_STATUS:-200}"
	if [ -n "$write_out" ]; then
		printf '%s' "$status"
	fi
	if [ "$status" = "200" ]; then
		cp "$TEST_FIXTURES/wayforge-checksums.txt" "$dest"
	fi
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

# write_checksums <binary-digest> <share-digest>
# Always writes both lines: the binary entry (with dist/ prefix) and the
# share entry.
write_checksums() {
	{
		printf '%s  dist/wayforge-linux-x64\n' "$1"
		printf '%s  wayforge-share-9.9.9.tar.gz\n' "$2"
	} >"$TEST_FIXTURES/wayforge-checksums.txt"
}

# Runs a real install with stderr captured to a file. Bats 1.2.1's plain
# `run` merges stderr into $output, so capture it explicitly here; this keeps
# the stderr assertions working on 1.2.1 and on current Bats.
run_full_install() {
	if output="$(env PATH="$STUB_DIR:/usr/bin:/bin" HOME="$TEST_HOME" \
		TEST_FIXTURES="$TEST_FIXTURES" FAKE_DIGEST="$1" \
		COSIGN_ARGS_LOG="$COSIGN_ARGS_LOG" "${@:2}" \
		/bin/sh "$REPO_ROOT/install/install.sh" \
		--version 9.9.9 --url-base https://fixture.invalid \
		--skip-node-check --prefix "$TEST_PREFIX" 2>"$TEST_TMPDIR/stderr.log")"; then
		status=0
	else
		status=$?
	fi
}

run_stderr() {
	cat "$TEST_TMPDIR/stderr.log"
}

stub_node() {
	local version="$1"
	cat >"$STUB_DIR/node" <<EOF
#!/bin/sh
echo "$version"
EOF
	chmod +x "$STUB_DIR/node"
}

# Cosign stub: records its arguments and exits $FAKE_COSIGN_EXIT (default 0).
# Only tests that want cosign present call this; otherwise `command -v cosign`
# fails inside the installer and the absent-cosign path is exercised.
stub_cosign() {
	cat >"$STUB_DIR/cosign" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"${COSIGN_ARGS_LOG:?}"
exit "${FAKE_COSIGN_EXIT:-0}"
EOF
	chmod +x "$STUB_DIR/cosign"
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
	[[ "$(run_stderr)" == *"checksum mismatch for wayforge-linux-x64"* ]]
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
	run_full_install "$DIGEST_OK" FAKE_CHECKSUM_STATUS=404
	[ "$status" -eq 0 ]
	[[ "$(run_stderr)" == *"warning: wayforge-checksums.txt is unavailable for v9.9.9; skipping checksum verification"* ]]
	[ -f "$TEST_PREFIX/bin/wfg" ]
	[ "$(cat "$TEST_PREFIX/bin/wfg")" = "binary" ]
	[ -d "$TEST_PREFIX/share/wayforge/base" ]
}

@test "install.sh aborts on a non-404 checksum download failure without touching prefix" {
	install_env
	run_full_install "$DIGEST_OK" FAKE_CHECKSUM_STATUS=500
	[ "$status" -eq 1 ]
	[[ "$(run_stderr)" == *"failed to download wayforge-checksums.txt"* ]]
	[[ "$(run_stderr)" != *"skipping checksum verification"* ]]
	[ ! -e "$TEST_PREFIX/bin" ]
	[ ! -e "$TEST_PREFIX/share" ]
}

@test "install.sh aborts on a checksum download timeout without touching prefix" {
	install_env
	run_full_install "$DIGEST_OK" FAKE_CHECKSUM_TIMEOUT=1
	[ "$status" -eq 1 ]
	[[ "$(run_stderr)" == *"failed to download wayforge-checksums.txt"* ]]
	[[ "$(run_stderr)" != *"skipping checksum verification"* ]]
	[ ! -e "$TEST_PREFIX/bin" ]
	[ ! -e "$TEST_PREFIX/share" ]
}

@test "install.sh aborts when checksum file has no entry for the binary" {
	install_env
	printf '%s  wayforge-share-9.9.9.tar.gz\n' "$DIGEST_OK" >"$TEST_FIXTURES/wayforge-checksums.txt"
	run_full_install "$DIGEST_OK"
	[ "$status" -eq 1 ]
	[[ "$(run_stderr)" == *"no entry for wayforge-linux-x64"* ]]
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

@test "install.sh verifies cosign bundle and installs" {
	install_env
	stub_cosign
	write_checksums "$DIGEST_OK" "$DIGEST_OK"
	run_full_install "$DIGEST_OK"
	[ "$status" -eq 0 ]
	[[ "$output" == *"verified wayforge-checksums.txt signature"* ]]
	[ -f "$TEST_PREFIX/bin/wfg" ]
	[ "$(cat "$TEST_PREFIX/bin/wfg")" = "binary" ]
	[ -d "$TEST_PREFIX/share/wayforge/base" ]
	local cosign_args
	cosign_args="$(cat "$COSIGN_ARGS_LOG")"
	[[ "$cosign_args" == *"verify-blob"* ]]
	[[ "$cosign_args" == *"--bundle"* ]]
}

@test "install.sh aborts on failed cosign verification without touching prefix" {
	install_env
	stub_cosign
	write_checksums "$DIGEST_OK" "$DIGEST_OK"
	run_full_install "$DIGEST_OK" FAKE_COSIGN_EXIT=1
	[ "$status" -eq 1 ]
	[[ "$(run_stderr)" == *"cosign signature verification failed"* ]]
	[ ! -e "$TEST_PREFIX/bin" ]
	[ ! -e "$TEST_PREFIX/share" ]
}

@test "install.sh warns and continues when cosign bundle is unavailable" {
	install_env
	stub_cosign
	write_checksums "$DIGEST_OK" "$DIGEST_OK"
	run_full_install "$DIGEST_OK" FAKE_BUNDLE_STATUS=404
	[ "$status" -eq 0 ]
	[[ "$(run_stderr)" == *"cosign signature bundle is unavailable for v9.9.9; skipping signature verification"* ]]
	[ -f "$TEST_PREFIX/bin/wfg" ]
	[ -d "$TEST_PREFIX/share/wayforge/base" ]
}

@test "install.sh aborts on a non-404 bundle download failure without touching prefix" {
	install_env
	stub_cosign
	write_checksums "$DIGEST_OK" "$DIGEST_OK"
	run_full_install "$DIGEST_OK" FAKE_BUNDLE_STATUS=500
	[ "$status" -eq 1 ]
	[[ "$(run_stderr)" == *"failed to download cosign signature bundle for v9.9.9 (HTTP 500)"* ]]
	[ ! -e "$TEST_PREFIX/bin" ]
	[ ! -e "$TEST_PREFIX/share" ]
}

@test "install.sh warns and continues when cosign is absent" {
	install_env
	write_checksums "$DIGEST_OK" "$DIGEST_OK"
	run_full_install "$DIGEST_OK"
	[ "$status" -eq 0 ]
	[[ "$(run_stderr)" == *"cosign not found; skipping checksum signature verification"* ]]
	[ -f "$TEST_PREFIX/bin/wfg" ]
	[ -d "$TEST_PREFIX/share/wayforge/base" ]
}

@test "install.sh dry-run prints bundle URL and would-verify plan with cosign" {
	install_env
	stub_cosign
	run env PATH="$STUB_DIR" HOME="$TEST_HOME" /bin/sh "$REPO_ROOT/install/install.sh" --dry-run --version 9.9.9 --url-base https://fixture.invalid --skip-node-check --prefix "$TEST_PREFIX"
	[ "$status" -eq 0 ]
	[[ "$output" == *"https://fixture.invalid/wayforge-checksums.txt.sigstore.json"* ]]
	[[ "$output" == *"[dry-run] would verify checksum signature with cosign"* ]]
}

@test "install.sh contains cosign verify-blob with pinned identity constants" {
	grep -q 'cosign verify-blob' "$REPO_ROOT/install/install.sh"
	grep -q -- '--bundle' "$REPO_ROOT/install/install.sh"
	grep -q 'COSIGN_IDENTITY_REGEXP' "$REPO_ROOT/install/install.sh"
	grep -q 'COSIGN_OIDC_ISSUER' "$REPO_ROOT/install/install.sh"
}
