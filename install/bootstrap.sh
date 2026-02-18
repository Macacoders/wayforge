#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ADAPTER_DIR="${ROOT_DIR}/agents/adapters/vscode-copilot"
TEMPLATES_DIR="${ROOT_DIR}/templates"

DRY_RUN=0
FORCE=0
DO_GLOBAL=0
DO_SKILLS_GLOBAL=0
REPO_PATH=""
SKILLS_GLOBAL_PATH=""
PROFILE="default"

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
    if [[ "$FORCE" -eq 1 ]]; then
      run_cmd "cp \"$src\" \"$dst\""
      log "copied (overwrote file): $dst"
    else
      log "skip existing file: $dst"
    fi
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

  local agents_template
  case "$PROFILE" in
    default)
      agents_template="AGENTS.md"
      ;;
    paper|research|software)
      agents_template="AGENTS.${PROFILE}.md"
      ;;
    *)
      log "error: unsupported --profile value: $PROFILE (expected: default|paper|research|software)"
      exit 1
      ;;
  esac

  local agents_md_src="$TEMPLATES_DIR/$agents_template"
  local agents_md_dst="$repo/AGENTS.md"

  if [[ ! -f "$agents_md_src" ]]; then
    log "error: template not found for profile '$PROFILE': $agents_md_src"
    exit 1
  fi

  safe_copy_template "$agents_md_src" "$agents_md_dst"

  local gh_dir="$repo/.github"
  local gh_agents_dir="$gh_dir/agents"
  local gh_skills_link="$gh_dir/skills"

  ensure_dir "$gh_dir"

  if [[ -L "$gh_agents_dir" ]]; then
    if [[ "$FORCE" -eq 1 ]]; then
      run_cmd "rm -f \"$gh_agents_dir\""
      ensure_dir "$gh_agents_dir"
      log "replaced symlink directory: $gh_agents_dir"
    else
      log "skip existing symlink directory (use --force to replace): $gh_agents_dir"
    fi
  else
    ensure_dir "$gh_agents_dir"
  fi

  if [[ -d "$gh_agents_dir" || "$DRY_RUN" -eq 1 ]]; then
    for src in "$ADAPTER_DIR"/*.agent.md; do
      local name
      name="$(basename "$src")"
      safe_link "$src" "$gh_agents_dir/$name"
    done
  fi

  safe_link "$ROOT_DIR/skills" "$gh_skills_link"

  log "repo bootstrap complete for: $repo"
}

install_skills_global() {
  local target_path="$1"
  local parent_dir
  parent_dir="$(dirname "$target_path")"

  ensure_dir "$parent_dir"
  safe_link "$ROOT_DIR/skills" "$target_path"
  log "skills bootstrap complete: $target_path"
}

usage() {
  cat <<'EOF'
Usage:
  ./install/bootstrap.sh --global [--dry-run] [--force]
  ./install/bootstrap.sh --skills-global [<path>] [--dry-run] [--force]
  ./install/bootstrap.sh --repo <path> [--profile <default|paper|research|software>] [--dry-run] [--force]

Options:
  --global         Link VS Code custom agents into user profile directory.
  --skills-global [path]
                   Link shared skills into a global path (default: ~/.skills/ai-config).
  --repo <path>    Seed AGENTS.md, link adapter files into .github/agents/, and link .github/skills.
  --profile <name> Template profile for AGENTS.md when using --repo.
                   Values: default (AGENTS.md), paper, research, software.
                   Default: default.
  --dry-run        Print planned operations without modifying files.
  --force          Refresh symlinks and overwrite seeded template files (e.g., AGENTS.md).
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
    --skills-global)
      DO_SKILLS_GLOBAL=1
      if [[ $# -gt 1 && "${2}" != -* ]]; then
        SKILLS_GLOBAL_PATH="$2"
        shift 2
      else
        shift
      fi
      ;;
    --repo)
      REPO_PATH="${2:-}"
      if [[ -z "$REPO_PATH" ]]; then
        log "error: --repo requires a path"
        exit 1
      fi
      shift 2
      ;;
    --profile)
      PROFILE="${2:-}"
      if [[ -z "$PROFILE" ]]; then
        log "error: --profile requires a value"
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

if [[ -z "$SKILLS_GLOBAL_PATH" ]]; then
  SKILLS_GLOBAL_PATH="$HOME/.skills/ai-config"
fi

if [[ "$DO_GLOBAL" -eq 0 && "$DO_SKILLS_GLOBAL" -eq 0 && -z "$REPO_PATH" ]]; then
  log "error: choose --global, --skills-global [path], and/or --repo <path>"
  exit 1
fi

if [[ "$DO_GLOBAL" -eq 1 ]]; then
  install_global
fi

if [[ -n "$REPO_PATH" ]]; then
  install_repo "$REPO_PATH"
fi

if [[ "$DO_SKILLS_GLOBAL" -eq 1 ]]; then
  install_skills_global "$SKILLS_GLOBAL_PATH"
fi

log "done"
