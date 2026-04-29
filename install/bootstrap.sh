#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=0
FORCE=0
REPO_PATH=""

log() {
  printf '[ai-config] %s\n' "$*"
}

run_mkdir() {
  local dir="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  mkdir -p "$dir"
}

run_rm() {
  local path="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: rm -f $path"
    return
  fi
  rm -f "$path"
}

run_ln() {
  local src="$1"
  local dst="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: ln -s $src $dst"
    return
  fi
  ln -s "$src" "$dst"
}

ensure_dir() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    return
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: mkdir -p $dir"
    return
  fi
  run_mkdir "$dir"
  log "created directory: $dir"
}

safe_link() {
  local src="$1"
  local dst="$2"

  if [[ ! -e "$src" ]]; then
    log "error: source does not exist: $src"
    exit 1
  fi

  if [[ -L "$dst" ]]; then
    local current
    current="$(readlink "$dst")"
    if [[ "$current" == "$src" && "$FORCE" -eq 0 ]]; then
      log "kept existing symlink: $dst -> $src"
      return
    fi

    if [[ "$FORCE" -eq 1 ]]; then
      run_rm "$dst"
      run_ln "$src" "$dst"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        log "DRY-RUN: would replace symlink: $dst -> $src"
      else
        log "linked (replaced symlink): $dst -> $src"
      fi
      return
    fi

    log "skip existing symlink (use --force to replace): $dst -> $current"
    return
  fi

  if [[ -e "$dst" ]]; then
    log "skip existing non-symlink: $dst"
    return
  fi

  local parent
  parent="$(dirname "$dst")"
  ensure_dir "$parent"
  run_ln "$src" "$dst"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would link: $dst -> $src"
  else
    log "linked: $dst -> $src"
  fi
}

install_repo() {
  local repo="$1"

  if [[ ! -d "$repo" ]]; then
    log "error: repo path does not exist: $repo"
    exit 1
  fi

  ensure_dir "$repo/.opencode"

  safe_link "$ROOT_DIR/opencode.jsonc" "$repo/opencode.jsonc"
  safe_link "$ROOT_DIR/templates/AGENTS.md" "$repo/AGENTS.md"
  safe_link "$ROOT_DIR/.opencode/agents" "$repo/.opencode/agents"
  safe_link "$ROOT_DIR/.opencode/commands" "$repo/.opencode/commands"
  safe_link "$ROOT_DIR/.opencode/skills" "$repo/.opencode/skills"

  log "repo bootstrap complete for: $repo"
}

usage() {
  cat <<'EOF'
Usage:
  ./install/bootstrap.sh --repo <path> [--dry-run] [--force]

Options:
  --repo <path>  Link OpenCode config into a target project.
  --dry-run      Print planned operations without modifying files.
  --force        Replace existing symlinks. Never overwrites non-symlink files.
  -h, --help     Show this help.
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_PATH="${2:-}"
      if [[ -z "$REPO_PATH" ]]; then
        log "error: --repo requires a path"
        exit 1
      fi
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "error: unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$REPO_PATH" ]]; then
  log "error: --repo <path> is required"
  exit 1
fi

install_repo "$REPO_PATH"
log "done"
