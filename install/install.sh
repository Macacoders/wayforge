#!/bin/sh
set -eu

# One-shot installer for ai-config.
# Fetches the prebuilt binary and share archive for this platform and places
# them under a dedicated prefix. Supports install, uninstall, and dry-run.

REPO="Macacoders/ai-config"
DEFAULT_PREFIX="${HOME}/.ai-config"

PREFIX="${AI_CONFIG_INSTALL_DIR:-$DEFAULT_PREFIX}"
VERSION=""
TAG=""
UNINSTALL=0
DRY_RUN=0
SKIP_NODE=0
URL_BASE=""

# Node.js provisioning: pinned LTS version, minimum major, and download base
# (override the base with AI_CONFIG_NODE_BASE_URL for tests).
NODE_MIN_MAJOR=18
NODE_VERSION="24.13.0"
NODE_BASE_URL="${AI_CONFIG_NODE_BASE_URL:-https://nodejs.org/dist}"
NODE_BIN_DIR=""

# ---------------------------------------------------------------------------
# Temporary-file cleanup
# ---------------------------------------------------------------------------
TMP_BINARY=""
TMP_SHARE=""
TMP_PATH_BLOCK=""
TMP_NODE=""

cleanup() {
	if [ -n "${TMP_BINARY:-}" ]; then rm -f "$TMP_BINARY"; fi
	if [ -n "${TMP_SHARE:-}" ]; then rm -f "$TMP_SHARE"; fi
	if [ -n "${TMP_PATH_BLOCK:-}" ]; then rm -f "$TMP_PATH_BLOCK"; fi
	if [ -n "${TMP_NODE:-}" ]; then rm -f "$TMP_NODE"; fi
}
trap cleanup EXIT INT TERM

usage() {
	cat <<EOF
Usage: install.sh [OPTIONS]

Options:
  --prefix <dir>    Installation directory (default: ~/.ai-config)
                    Override with AI_CONFIG_INSTALL_DIR.
  --version <v>     Version to install (default: latest release).
                    Accepts "1.2.3" or "v1.2.3".
  --uninstall       Remove ai-config from the prefix.
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

BINARY_NAME="ai-config-${OS}-${ARCH}"

# ---------------------------------------------------------------------------
# PATH marker block
# ---------------------------------------------------------------------------
MARKER_START="# >>> ai-config >>>"
MARKER_END="# <<< ai-config <<<"

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
		echo "# Added by ai-config installer"
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
		echo "error: curl or wget is required to download ai-config" >&2
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

	printf 'https://github.com/%s/releases/%s/download\n' "$REPO" "$TAG"
}

# ---------------------------------------------------------------------------
# Install path
# ---------------------------------------------------------------------------
run_install() {
	detect_downloader
	ensure_node

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

	local share_name="ai-config-share-${TAG#v}.tar.gz"
	local binary_url="${base_url}/${BINARY_NAME}"
	local share_url="${base_url}/${share_name}"

	local bin_dir="${PREFIX}/bin"
	local share_dir="${PREFIX}/share/ai-config"
	local binary_path="${bin_dir}/ai-config"

	if [ "$DRY_RUN" -eq 1 ]; then
		echo "[dry-run] OS: ${OS}, ARCH: ${ARCH}"
		echo "[dry-run] prefix: ${PREFIX}"
		echo "[dry-run] version: ${TAG#v}"
		echo "[dry-run] binary URL: ${binary_url}"
		echo "[dry-run] share URL: ${share_url}"
		echo "[dry-run] would create directory: ${bin_dir}"
		echo "[dry-run] would create directory: ${share_dir}"
		echo "[dry-run] would download: ${binary_url} -> ${binary_path}"
		echo "[dry-run] would chmod +x: ${binary_path}"
		echo "[dry-run] would download and extract: ${share_url} -> ${share_dir}"
		echo "[dry-run] would verify directory exists: ${share_dir}/base"
		echo "[dry-run] PATH export: export PATH=\"${bin_dir}:\$PATH\""
		echo "[dry-run] would append ai-config PATH block to: ${HOME}/.bashrc"
		echo "[dry-run] would append ai-config PATH block to: ${HOME}/.zshrc"
		return 0
	fi

	mkdir -p "$bin_dir"
	mkdir -p "$share_dir"

	TMP_BINARY="${binary_path}.tmp.$$"
	download "$binary_url" "$TMP_BINARY"
	chmod +x "$TMP_BINARY"
	mv "$TMP_BINARY" "$binary_path"
	TMP_BINARY=""

	TMP_SHARE="$(mktemp)"
	download "$share_url" "$TMP_SHARE"

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

	echo "ai-config ${TAG#v} installed to ${binary_path}"
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
	local share_dir="${PREFIX}/share/ai-config"
	local node_dir="${PREFIX}/node"
	local binary_path="${bin_dir}/ai-config"
	local tracking_file="${PREFIX}/installed-projects.json"
	local bashrc="${HOME}/.bashrc"
	local zshrc="${HOME}/.zshrc"

	if [ "$DRY_RUN" -eq 1 ]; then
		echo "[dry-run] prefix: ${PREFIX}"
		echo "[dry-run] would remove: ${binary_path}"
		echo "[dry-run] would remove: ${share_dir}"
		echo "[dry-run] would remove: ${node_dir}"
		echo "[dry-run] would remove: ${tracking_file}"
		echo "[dry-run] would remove ai-config PATH block from: ${bashrc}"
		echo "[dry-run] would remove ai-config PATH block from: ${zshrc}"
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

	echo "ai-config uninstalled from ${PREFIX}"
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
	run_uninstall
else
	run_install
fi
