#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ADAPTER_DIR="${ROOT_DIR}/agents/adapters/vscode-copilot"
TEMPLATES_DIR="${ROOT_DIR}/templates"

DRY_RUN=0
FORCE=0
DO_GLOBAL=0
REPO_PATH=""

log() {
  printf '[ai-config] %s\n' "$*"
}

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: $*"
  else
    eval "$@"
  fi
}

safe_link() {
  local src="$1"
  local dst="$2"

  if [[ -L "$dst" ]]; then
    if [[ "$FORCE" -eq 1 ]]; then
      run_cmd "rm -f \"$dst\""
      run_cmd "ln -s \"$src\" \"$dst\""
      log "linked (replaced symlink): $dst -> $src"
    else
      log "skip existing symlink (use --force to replace): $dst"
    fi
    return
  fi

  if [[ -e "$dst" ]]; then
    log "skip existing non-symlink: $dst"
    return
  fi

  run_cmd "ln -s \"$src\" \"$dst\""
  log "linked: $dst -> $src"
}

safe_copy_template() {
  local src="$1"
  local dst="$2"

  if [[ -L "$dst" ]]; then
    if [[ "$FORCE" -eq 1 ]]; then
      run_cmd "rm -f \"$dst\""
      run_cmd "cp \"$src\" \"$dst\""
      log "copied (replaced symlink): $dst"
    else
      log "skip existing symlink file (use --force to replace): $dst"
    fi
    return
  fi

  if [[ -e "$dst" ]]; then
    log "skip existing file: $dst"
    return
  fi

  run_cmd "cp \"$src\" \"$dst\""
  log "copied: $dst"
}

ensure_dir() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    run_cmd "mkdir -p \"$dir\""
    log "created directory: $dir"
  fi
}

vscode_agent_candidates() {
  local os
  os="$(uname -s)"

  case "$os" in
    Linux)
      printf '%s\n' \
        "$HOME/.config/Code/User/agents" \
        "$HOME/.config/Code - Insiders/User/agents"
      ;;
    Darwin)
      printf '%s\n' \
        "$HOME/Library/Application Support/Code/User/agents" \
        "$HOME/Library/Application Support/Code - Insiders/User/agents"
      ;;
    CYGWIN*|MINGW*|MSYS*)
      local appdata="${APPDATA:-}"
      if [[ -n "$appdata" ]]; then
        printf '%s\n' \
          "$appdata/Code/User/agents" \
          "$appdata/Code - Insiders/User/agents"
      fi
      ;;
    *)
      ;;
  esac
}

install_global() {
  local found=0
  while IFS= read -r target_dir; do
    [[ -z "$target_dir" ]] && continue

    local parent_dir
    parent_dir="$(dirname "$target_dir")"

    if [[ -d "$parent_dir" || "$FORCE" -eq 1 || "$DRY_RUN" -eq 1 ]]; then
      ensure_dir "$target_dir"
      for src in "$ADAPTER_DIR"/*.agent.md; do
        local name
        name="$(basename "$src")"
        safe_link "$src" "$target_dir/$name"
      done
      found=1
    fi
  done < <(vscode_agent_candidates)

  if [[ "$found" -eq 0 ]]; then
    log "Could not detect a VS Code user profile directory automatically."
    log "Manual setup: create your VS Code custom agents folder and symlink files from:"
    log "  $ADAPTER_DIR"
  fi
}

install_repo() {
  local repo="$1"

  if [[ ! -d "$repo" ]]; then
    log "error: repo path does not exist: $repo"
    exit 1
  fi

  local agents_md_src="$TEMPLATES_DIR/AGENTS.md"
  local agents_md_dst="$repo/AGENTS.md"

  safe_copy_template "$agents_md_src" "$agents_md_dst"

  local gh_agents_dir="$repo/.github"
  local gh_agents_link="$gh_agents_dir/agents"

  ensure_dir "$gh_agents_dir"
  safe_link "$ROOT_DIR/agents" "$gh_agents_link"

  log "repo bootstrap complete for: $repo"
}

usage() {
  cat <<'EOF'
Usage:
  ./install/bootstrap.sh --global [--dry-run] [--force]
  ./install/bootstrap.sh --repo <path> [--dry-run] [--force]

Options:
  --global         Link VS Code custom agents into user profile directory.
  --repo <path>    Seed AGENTS.md and link .github/agents into target repo.
  --dry-run        Print planned operations without modifying files.
  --force          Replace existing symlinks only (never remove normal files).
  -h, --help       Show this help.
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global)
      DO_GLOBAL=1
      shift
      ;;
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

if [[ "$DO_GLOBAL" -eq 0 && -z "$REPO_PATH" ]]; then
  log "error: choose --global and/or --repo <path>"
  exit 1
fi

if [[ "$DO_GLOBAL" -eq 1 ]]; then
  install_global
fi

if [[ -n "$REPO_PATH" ]]; then
  install_repo "$REPO_PATH"
fi

log "done"
