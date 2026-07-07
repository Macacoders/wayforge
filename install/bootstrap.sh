#!/usr/bin/env bash
set -euo pipefail

# Thin entrypoint for ai-config: prefers a local/compiled binary, then a cached
# release binary, then downloads the matching release from GitHub, and finally
# falls back to npx tsx. Exits with a clear error if no runtime is available.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="$(cat "$ROOT_DIR/VERSION" 2>/dev/null || echo "0.0.0")"
REPO="Macacoders/ai-config"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
x86_64 | amd64) ARCH="x64" ;;
aarch64 | arm64) ARCH="arm64" ;;
*)
	echo "error: unsupported architecture: $ARCH" >&2
	exit 1
	;;
esac
case "$OS" in
linux) ;;
darwin) ;;
*)
	echo "error: unsupported OS: $OS (only linux and macOS are supported)" >&2
	exit 1
	;;
esac

BINARY_NAME="ai-config-${OS}-${ARCH}"
CACHE_DIR="${HOME}/.ai-config/bin"
CACHED_BINARY="${CACHE_DIR}/ai-config-${VERSION}-${OS}-${ARCH}"
RELEASE_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${BINARY_NAME}"
LOCAL_BINARY="$ROOT_DIR/dist/$BINARY_NAME"

# 0. Local development binary
if [[ -x "$LOCAL_BINARY" ]]; then
	exec "$LOCAL_BINARY" "$@"
fi

# 1. Cached release binary
if [[ -x "$CACHED_BINARY" ]]; then
	exec "$CACHED_BINARY" "$@"
fi

# 2. Download from GitHub release
if command -v curl &>/dev/null; then
	DOWNLOAD_CMD="curl -fsSL --connect-timeout 30 --max-time 300 -o"
elif command -v wget &>/dev/null; then
	DOWNLOAD_CMD="wget -q --timeout=300 -O"
else
	DOWNLOAD_CMD=""
fi

if [[ -n "$DOWNLOAD_CMD" ]]; then
	mkdir -p "$CACHE_DIR"
	TMPFILE="${CACHED_BINARY}.tmp.$$"
	if $DOWNLOAD_CMD "$TMPFILE" "$RELEASE_URL"; then
		chmod +x "$TMPFILE"
		mv "$TMPFILE" "$CACHED_BINARY"
		exec "$CACHED_BINARY" "$@"
	else
		rc=$?
		rm -f "$TMPFILE"
		echo "[ai-config] binary download failed (exit $rc)" >&2
	fi
fi

# 3. Fallback to npx tsx
if command -v node &>/dev/null; then
	echo "[ai-config] falling back to npx tsx" >&2
	exec npx tsx "$ROOT_DIR/cli/src/index.ts" "$@"
fi

# 4. No supported runtime
echo "[ai-config] error: no supported runtime found" >&2
echo "  Install Node.js (https://nodejs.org) or curl/wget for binary download." >&2
exit 1
