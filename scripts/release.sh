#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=0
NEW_VERSION=""

usage() {
	cat <<EOF
Usage: scripts/release.sh --version <semver> [--dry-run]

Prepare a new ai-config release.

Options:
  --version <semver>  New version (e.g., 0.2.0)
  --dry-run           Preview operations without making changes
  -h, --help          Show this help
EOF
	exit 0
}

[[ $# -eq 0 ]] && usage

while [[ $# -gt 0 ]]; do
	case "$1" in
	--version)
		NEW_VERSION="${2:-}"
		shift 2
		;;
	--dry-run)
		DRY_RUN=1
		shift
		;;
	-h | --help) usage ;;
	*)
		echo "error: unknown option: $1"
		usage
		;;
	esac
done

if [[ -z "$NEW_VERSION" ]]; then
	echo "error: --version is required"
	usage
fi

# Validate SemVer format
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
	echo "error: invalid version format '$NEW_VERSION'. Expected SemVer (e.g., 0.2.0)"
	exit 1
fi

CURRENT_VERSION="$(cat "$ROOT_DIR/VERSION" 2>/dev/null || echo "0.0.0")"
echo "[release] Current version: $CURRENT_VERSION"
echo "[release] New version:     $NEW_VERSION"
echo ""

# 1. Verify clean working tree
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null)" ]]; then
	echo "error: working tree is not clean. Commit or stash changes first."
	exit 1
fi

# 2. Verify we're on develop
CURRENT_BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
	echo "error: must be on 'develop' branch (currently on '$CURRENT_BRANCH')"
	exit 1
fi

# 3. Update VERSION file
echo "[release] update VERSION: $CURRENT_VERSION -> $NEW_VERSION"
if [[ "$DRY_RUN" -eq 0 ]]; then
	echo "$NEW_VERSION" >"$ROOT_DIR/VERSION"
	echo "  written: VERSION"
else
	echo "  [dry-run] would write VERSION"
fi

# 4. Update CHANGELOG.md
TODAY="$(date +%Y-%m-%d)"
CHANGELOG="$ROOT_DIR/CHANGELOG.md"
NEW_ENTRY="## [$NEW_VERSION] - $TODAY

### Added

- Placeholder: describe changes for this release.
"

# Insert after the header but before the first existing entry
if [[ "$DRY_RUN" -eq 0 ]]; then
	# Find the first existing entry line to insert before
	if grep -q '^## \[' "$CHANGELOG"; then
		FIRST_ENTRY_LINE="$(grep -n '^## \[' "$CHANGELOG" | head -1 | cut -d: -f1)"
		{
			head -n "$((FIRST_ENTRY_LINE - 1))" "$CHANGELOG"
			echo "$NEW_ENTRY"
			tail -n "+$FIRST_ENTRY_LINE" "$CHANGELOG"
		} >"$CHANGELOG.tmp" && mv "$CHANGELOG.tmp" "$CHANGELOG"
	else
		echo "$NEW_ENTRY" >>"$CHANGELOG"
	fi
	# Update the version link at the bottom
	LINK_PATTERN="\[$CURRENT_VERSION\]:"
	if grep -q "$LINK_PATTERN" "$CHANGELOG"; then
		sed -i "s|$LINK_PATTERN|[$NEW_VERSION]: https://github.com/Macacoders/ai-config/releases/tag/v$NEW_VERSION\n&|" "$CHANGELOG"
	fi
	echo "  updated: CHANGELOG.md"
else
	echo "  [dry-run] would add entry to CHANGELOG.md:"
	while IFS= read -r line; do
		echo "    $line"
	done <<<"$NEW_ENTRY"
fi

# 5. Create tag
echo ""
echo "[release] git tag -a v$NEW_VERSION -m \"Release v$NEW_VERSION\""
if [[ "$DRY_RUN" -eq 0 ]]; then
	git -C "$ROOT_DIR" tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
	echo "  created tag: v$NEW_VERSION"
else
	echo "  [dry-run] would create tag"
fi

# 6. Summary
echo ""
echo "=== Release v$NEW_VERSION prepared ==="
echo ""
echo "Next steps:"
echo "  1. Review CHANGELOG.md and update the placeholder entry"
echo "  2. Push the tag:       git push origin v$NEW_VERSION"
echo "  3. Merge to main:      git checkout main && git merge develop && git push origin main"
echo "  4. Or push both:       git push origin main v$NEW_VERSION"
echo ""
echo "The GitHub Actions workflow will auto-create the release when main is pushed."
