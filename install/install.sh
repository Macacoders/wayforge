#!/bin/sh
set -eu

# One-shot installer for wayforge.
# Fetches the prebuilt binary and share archive for this platform and places
# them under a dedicated prefix. Supports install, uninstall, and dry-run.

REPO="Macacoders/wayforge"
DEFAULT_PREFIX="${HOME}/.wayforge"

PREFIX="${WAYFORGE_INSTALL_DIR:-$DEFAULT_PREFIX}"
VERSION=""
TAG=""
UNINSTALL=0
DRY_RUN=0
SKIP_NODE=0
URL_BASE=""

# Node.js provisioning: pinned LTS version, minimum major, and download base
# (override the base with WAYFORGE_NODE_BASE_URL for tests).
NODE_MIN_MAJOR=18
NODE_VERSION="24.13.0"
NODE_BASE_URL="${WAYFORGE_NODE_BASE_URL:-https://nodejs.org/dist}"
NODE_BIN_DIR=""

# ---------------------------------------------------------------------------
# Temporary-file cleanup
# ---------------------------------------------------------------------------
TMP_BINARY=""
TMP_SHARE=""
TMP_CHECKSUMS=""
TMP_PATH_BLOCK=""
TMP_NODE=""

cleanup() {
	if [ -n "${TMP_BINARY:-}" ]; then rm -f "$TMP_BINARY"; fi
	if [ -n "${TMP_SHARE:-}" ]; then rm -f "$TMP_SHARE"; fi
	if [ -n "${TMP_CHECKSUMS:-}" ]; then rm -f "$TMP_CHECKSUMS"; fi
	if [ -n "${TMP_PATH_BLOCK:-}" ]; then rm -f "$TMP_PATH_BLOCK"; fi
	if [ -n "${TMP_NODE:-}" ]; then rm -f "$TMP_NODE"; fi
}
trap cleanup EXIT INT TERM

usage() {
	cat <<EOF
Usage: install.sh [OPTIONS]

Options:
  --prefix <dir>    Installation directory (default: ~/.wayforge)
                    Override with WAYFORGE_INSTALL_DIR.
  --version <v>     Version to install (default: latest release).
                    Accepts "1.2.3" or "v1.2.3".
  --uninstall       Remove wayforge from the prefix.
  --dry-run         Print actions without performing them.
  --skip-node-check Skip Node.js detection and provisioning.
  --url-base <base> Test override for the download base URL.
  -h, --help        Show this help message.
EOF
}

# ---------------------------------------------------------------------------
# Option parsing
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
	case "$1" in
	--prefix)
		if [ $# -lt 2 ]; then
			echo "error: --prefix requires an argument" >&2
			exit 1
		fi
		PREFIX="$2"
		shift 2
		;;
	--version)
		if [ $# -lt 2 ]; then
			echo "error: --version requires an argument" >&2
			exit 1
		fi
		VERSION="$2"
		shift 2
		;;
	--uninstall)
		UNINSTALL=1
		shift
		;;
	--dry-run)
		DRY_RUN=1
		shift
		;;
	--skip-node-check)
		SKIP_NODE=1
		shift
		;;
	--url-base)
		if [ $# -lt 2 ]; then
			echo "error: --url-base requires an argument" >&2
			exit 1
		fi
		URL_BASE="$2"
		shift 2
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "error: unknown option: $1" >&2
		usage >&2
		exit 1
		;;
	esac
done

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
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
	echo "error: unsupported OS: $OS (only linux and darwin are supported)" >&2
	exit 1
	;;
esac

BINARY_NAME="wayforge-${OS}-${ARCH}"

# ---------------------------------------------------------------------------
# PATH marker block
# ---------------------------------------------------------------------------
MARKER_START="# >>> wayforge >>>"
MARKER_END="# <<< wayforge <<<"

append_path_block() {
	local file="$1"
	local bin_dir="$2"
	if [ ! -f "$file" ]; then
		return 0
	fi
	if grep -qF "$MARKER_START" "$file"; then
		return 0
	fi
	{
		echo ""
		echo "$MARKER_START"
		echo "# Added by wayforge installer"
		echo "export PATH=\"${bin_dir}:\$PATH\""
		echo "$MARKER_END"
	} >>"$file"
}

remove_path_block() {
	local file="$1"
	if [ ! -f "$file" ]; then
		return 0
	fi
	if ! grep -qF "$MARKER_START" "$file"; then
		return 0
	fi
	TMP_PATH_BLOCK="${file}.tmp.$$"
	awk -v start="$MARKER_START" -v end="$MARKER_END" \
		'$0 == start {inside=1; next} $0 == end {inside=0; next} !inside' \
		"$file" >"$TMP_PATH_BLOCK"
	mv "$TMP_PATH_BLOCK" "$file"
	TMP_PATH_BLOCK=""
}

# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------
DOWNLOADER=""

detect_downloader() {
	if [ -n "$DOWNLOADER" ]; then
		return 0
	fi
	if command -v curl >/dev/null 2>&1; then
		DOWNLOADER="curl"
	elif command -v wget >/dev/null 2>&1; then
		DOWNLOADER="wget"
	else
		echo "error: curl or wget is required to download wayforge" >&2
		exit 1
	fi
}

download() {
	local url="$1"
	local dest="$2"
	detect_downloader
	case "$DOWNLOADER" in
	curl)
		curl -fsSL --connect-timeout 30 --max-time 300 -o "$dest" "$url"
		;;
	wget)
		wget -q --timeout=300 -O "$dest" "$url"
		;;
	esac
}

# ---------------------------------------------------------------------------
# Checksum verification
# ---------------------------------------------------------------------------
# Set by fetch_checksums() when the HTTP status is known, so run_install can
# include it in the abort message. Empty for transport failures.
CHECKSUM_HTTP_STATUS=""

# fetch_checksums <url> <dest>
# Returns 0 when the checksum file was downloaded, 1 when the asset is
# confirmed absent (HTTP 404), and 2 for every other failure (403/5xx,
# DNS/TLS/timeout, unknown status). Only the 404 case may fall back to an
# unverified install; a download failure aborts before any prefix mutation.
fetch_checksums() {
	local url="$1"
	local dest="$2"
	CHECKSUM_HTTP_STATUS=""
	detect_downloader
	case "$DOWNLOADER" in
	curl)
		local status
		# No -f here: its exit code cannot distinguish 404 from other HTTP
		# errors, and the unverified fallback is only safe for a 404.
		status=$(curl -sS -L --connect-timeout 30 --max-time 300 -o "$dest" -w '%{http_code}' "$url" 2>/dev/null) || return 2
		CHECKSUM_HTTP_STATUS="$status"
		case "$status" in
		200) return 0 ;;
		404) return 1 ;;
		*) return 2 ;;
		esac
		;;
	wget)
		local headers status
		headers="$(mktemp)"
		if wget --server-response -O "$dest" --timeout=300 "$url" 2>"$headers"; then
			rm -f "$headers"
			return 0
		fi
		# wget exits 8 for every HTTP error; read the last status line to
		# tell a missing asset (404) from an outage (403/5xx).
		status=$(awk '/^[[:space:]]*HTTP\// { code=$2 } END { print code }' "$headers")
		rm -f "$headers"
		CHECKSUM_HTTP_STATUS="$status"
		if [ "$status" = "404" ]; then
			return 1
		fi
		return 2
		;;
	esac
}

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{print $1}'
	else
		echo "error: cannot verify checksums: sha256sum or shasum is required" >&2
		return 1
	fi
}

# checksum_for <asset-name>
# Looks up the digest for an asset in $TMP_CHECKSUMS. Release checksums are
# generated with paths ("dist/wayforge-*"), so entries are matched by
# basename; mirrors parseChecksums in cli/src/lib/upgrade.ts (intentional
# duplication: the installer is a standalone POSIX sh file).
checksum_for() {
	awk -v name="$1" \
		'{ f=$2; sub(/^\*/, "", f); sub(/^.*\//, "", f); if (f == name) { print tolower($1); exit } }' \
		"$TMP_CHECKSUMS"
}

# verify_asset <file> <asset-name>
# Aborts before any install mutation on a missing entry or digest mismatch.
verify_asset() {
	local file="$1"
	local name="$2"
	local expected
	expected="$(checksum_for "$name")"
	if [ -z "$expected" ]; then
		echo "error: checksum file has no entry for ${name}; aborting without changes" >&2
		exit 1
	fi
	local actual
	actual="$(sha256_file "$file")" || exit 1
	if [ "$actual" != "$expected" ]; then
		echo "error: checksum mismatch for ${name}: expected ${expected}, got ${actual}" >&2
		exit 1
	fi
	echo "verified ${name} checksum"
}

# ---------------------------------------------------------------------------
# Node.js provisioning
# ---------------------------------------------------------------------------
node_major() {
	command -v node >/dev/null 2>&1 || return 1
	local version
	version="$(node --version 2>/dev/null)" || return 1
	version="${version#v}"
	case "$version" in
	[0-9]*) ;;
	*) return 1 ;;
	esac
	local major="${version%%.*}"
	case "$major" in
	'' | *[!0-9]*) return 1 ;;
	esac
	printf '%s\n' "$major"
}

install_local_node() {
	local node_dir="${PREFIX}/node"
	local node_bin="${node_dir}/bin"
	local archive="node-v${NODE_VERSION}-${OS}-${ARCH}.tar.gz"
	local url="${NODE_BASE_URL}/v${NODE_VERSION}/${archive}"

	echo "Installing Node.js v${NODE_VERSION} (${OS}-${ARCH}) to ${node_dir}"
	mkdir -p "$node_dir"
	TMP_NODE="$(mktemp)"
	download "$url" "$TMP_NODE"
	tar -xzf "$TMP_NODE" -C "$node_dir" --strip-components=1
	rm -f "$TMP_NODE"
	TMP_NODE=""

	if [ ! -x "${node_bin}/node" ]; then
		echo "error: Node.js archive did not contain ${node_bin}/node" >&2
		return 1
	fi

	NODE_BIN_DIR="$node_bin"
	PATH="${node_bin}:${PATH}"
	export PATH
}

ensure_node() {
	if [ "$SKIP_NODE" -eq 1 ]; then
		return 0
	fi

	local major
	if major="$(node_major)"; then
		if [ "$major" -ge "$NODE_MIN_MAJOR" ]; then
			echo "Node.js $(node --version) detected"
			return 0
		fi
		echo "Node.js $(node --version) is older than the required v${NODE_MIN_MAJOR}; provisioning Node.js v${NODE_VERSION}"
	else
		echo "Node.js >= ${NODE_MIN_MAJOR} not found on PATH; provisioning Node.js v${NODE_VERSION}"
	fi

	if [ "$DRY_RUN" -eq 1 ]; then
		echo "[dry-run] would install Node.js v${NODE_VERSION} (${OS}-${ARCH})"
		echo "[dry-run] would download: ${NODE_BASE_URL}/v${NODE_VERSION}/node-v${NODE_VERSION}-${OS}-${ARCH}.tar.gz"
		echo "[dry-run] would extract to: ${PREFIX}/node"
		echo "[dry-run] would add to PATH: ${PREFIX}/node/bin"
		return 0
	fi

	if ! install_local_node; then
		echo "error: failed to provision Node.js v${NODE_VERSION}; install Node.js >= ${NODE_MIN_MAJOR} manually from https://nodejs.org and re-run" >&2
		exit 1
	fi

	major="$(node_major)" || major=""
	if [ -z "$major" ] || [ "$major" -lt "$NODE_MIN_MAJOR" ]; then
		echo "error: provisioned Node.js did not report version >= ${NODE_MIN_MAJOR}; install Node.js manually from https://nodejs.org and re-run" >&2
		exit 1
	fi
	echo "Node.js $(node --version) provisioned at ${PREFIX}/node"
}

# ---------------------------------------------------------------------------
# Version resolution
# ---------------------------------------------------------------------------
resolve_latest_version() {
	detect_downloader
	local location=""
	case "$DOWNLOADER" in
	curl)
		location=$(curl -fsSL --connect-timeout 30 --max-time 60 -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest") || true
		;;
	wget)
		location=$(
			wget --max-redirect=0 -q -S -O - --timeout=60 "https://github.com/${REPO}/releases/latest" 2>&1 || true
		)
		location=$(printf '%s\n' "$location" | awk -F': ' '/^[[:space:]]*[Ll]ocation:/ { gsub(/\r$/, "", $2); print $2; exit }')
		;;
	esac
	if [ -z "$location" ]; then
		echo "error: unable to resolve latest release" >&2
		exit 1
	fi
	case "$location" in
	*/tag/*) ;;
	*)
		echo "error: unable to resolve latest release (got ${location})" >&2
		exit 1
		;;
	esac
	local tag
	tag="${location##*/}"
	if [ -z "$tag" ]; then
		echo "error: unable to parse latest release tag from ${location}" >&2
		exit 1
	fi
	printf '%s\n' "$tag"
}

# ---------------------------------------------------------------------------
# URL construction
# ---------------------------------------------------------------------------
build_url_base() {
	if [ -n "$URL_BASE" ]; then
		printf '%s\n' "$URL_BASE"
		return
	fi

	printf 'https://github.com/%s/releases/download/%s\n' "$REPO" "$TAG"
}

# ---------------------------------------------------------------------------
# Install path
# ---------------------------------------------------------------------------
run_install() {
	detect_downloader

	if [ -n "$VERSION" ]; then
		case "$VERSION" in
		v*) TAG="$VERSION" ;;
		*) TAG="v${VERSION}" ;;
		esac
	else
		TAG="$(resolve_latest_version)"
	fi
	if [ -z "$TAG" ]; then
		echo "error: version could not be determined" >&2
		exit 1
	fi

	local base_url
	base_url="$(build_url_base)"

	local share_name="wayforge-share-${TAG#v}.tar.gz"
	local binary_url="${base_url}/${BINARY_NAME}"
	local share_url="${base_url}/${share_name}"
	local checksum_url="${base_url}/wayforge-checksums.txt"

	local bin_dir="${PREFIX}/bin"
	local share_dir="${PREFIX}/share/wayforge"
	local binary_path="${bin_dir}/wfg"

	if [ "$DRY_RUN" -eq 1 ]; then
		ensure_node
		echo "[dry-run] OS: ${OS}, ARCH: ${ARCH}"
		echo "[dry-run] prefix: ${PREFIX}"
		echo "[dry-run] version: ${TAG#v}"
		echo "[dry-run] binary URL: ${binary_url}"
		echo "[dry-run] share URL: ${share_url}"
		echo "[dry-run] checksum URL: ${checksum_url}"
		echo "[dry-run] would verify: ${BINARY_NAME}, ${share_name}"
		echo "[dry-run] would create directory: ${bin_dir}"
		echo "[dry-run] would create directory: ${share_dir}"
		echo "[dry-run] would download: ${binary_url} -> ${binary_path}"
		echo "[dry-run] would chmod +x: ${binary_path}"
		echo "[dry-run] would download and extract: ${share_url} -> ${share_dir}"
		echo "[dry-run] would verify directory exists: ${share_dir}/base"
		echo "[dry-run] PATH export: export PATH=\"${bin_dir}:\$PATH\""
		echo "[dry-run] would append wayforge PATH block to: ${HOME}/.bashrc"
		echo "[dry-run] would append wayforge PATH block to: ${HOME}/.zshrc"
		return 0
	fi

	TMP_BINARY="$(mktemp)"
	TMP_SHARE="$(mktemp)"
	TMP_CHECKSUMS="$(mktemp)"
	download "$binary_url" "$TMP_BINARY"
	download "$share_url" "$TMP_SHARE"

	local checksum_rc
	checksum_rc=0
	fetch_checksums "$checksum_url" "$TMP_CHECKSUMS" || checksum_rc=$?
	case "$checksum_rc" in
	0)
		verify_asset "$TMP_BINARY" "$BINARY_NAME"
		verify_asset "$TMP_SHARE" "$share_name"
		;;
	1)
		rm -f "$TMP_CHECKSUMS"
		TMP_CHECKSUMS=""
		echo "warning: wayforge-checksums.txt is unavailable for ${TAG}; skipping checksum verification" >&2
		;;
	*)
		rm -f "$TMP_CHECKSUMS"
		TMP_CHECKSUMS=""
		if [ -n "$CHECKSUM_HTTP_STATUS" ]; then
			echo "error: failed to download wayforge-checksums.txt for ${TAG} (HTTP ${CHECKSUM_HTTP_STATUS}); aborting without changes" >&2
		else
			echo "error: failed to download wayforge-checksums.txt for ${TAG}; aborting without changes" >&2
		fi
		exit 1
		;;
	esac

	ensure_node

	mkdir -p "$bin_dir"
	mkdir -p "$share_dir"

	chmod +x "$TMP_BINARY"
	mv "$TMP_BINARY" "$binary_path"
	TMP_BINARY=""

	rm -rf "$share_dir"
	mkdir -p "$share_dir"
	tar -xzf "$TMP_SHARE" -C "$share_dir"
	rm -f "$TMP_SHARE"
	TMP_SHARE=""

	if [ ! -d "${share_dir}/base" ]; then
		echo "error: share archive did not create ${share_dir}/base" >&2
		exit 1
	fi

	local path_prefix="$bin_dir"
	if [ -n "${NODE_BIN_DIR:-}" ]; then
		path_prefix="${NODE_BIN_DIR}:${bin_dir}"
		remove_path_block "${HOME}/.bashrc"
		remove_path_block "${HOME}/.zshrc"
	fi

	echo "wayforge ${TAG#v} installed to ${binary_path}"
	echo "Add to your PATH:"
	echo "  export PATH=\"${path_prefix}:\$PATH\""

	append_path_block "${HOME}/.bashrc" "$path_prefix"
	append_path_block "${HOME}/.zshrc" "$path_prefix"
}

# ---------------------------------------------------------------------------
# Uninstall path
# ---------------------------------------------------------------------------
run_uninstall() {
	local bin_dir="${PREFIX}/bin"
	local share_dir="${PREFIX}/share/wayforge"
	local node_dir="${PREFIX}/node"
	local binary_path="${bin_dir}/wfg"
	local tracking_file="${PREFIX}/installed-projects.json"
	local bashrc="${HOME}/.bashrc"
	local zshrc="${HOME}/.zshrc"

	if [ "$DRY_RUN" -eq 1 ]; then
		echo "[dry-run] prefix: ${PREFIX}"
		echo "[dry-run] would remove: ${binary_path}"
		echo "[dry-run] would remove: ${share_dir}"
		echo "[dry-run] would remove: ${node_dir}"
		echo "[dry-run] would remove: ${tracking_file}"
		echo "[dry-run] would remove wayforge PATH block from: ${bashrc}"
		echo "[dry-run] would remove wayforge PATH block from: ${zshrc}"
		return 0
	fi

	rm -f "$binary_path"
	rm -rf "$share_dir"
	rm -rf "$node_dir"
	rm -f "$tracking_file"

	remove_path_block "$bashrc"
	remove_path_block "$zshrc"

	if [ -d "$PREFIX" ] && [ -z "$(ls -A "$PREFIX" 2>/dev/null)" ]; then
		rmdir "$PREFIX"
	fi

	echo "wayforge uninstalled from ${PREFIX}"
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
	run_uninstall
else
	run_install
fi
