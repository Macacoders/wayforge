# Source this file from your ~/.bashrc to expose ai-config helper functions.

_ai_config_root() {
  if [[ -n "${AI_CONFIG_HOME:-}" && -d "${AI_CONFIG_HOME}" ]]; then
    printf '%s\n' "$AI_CONFIG_HOME"
    return
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  printf '%s\n' "$(cd "$script_dir/.." && pwd)"
}

ai-setup-repo() {
  local repo_path="${1:-}"
  local profile="${2:-research}"

  if [[ -z "$repo_path" ]]; then
    echo "usage: ai-setup-repo <path> <profile>"
    echo "profiles: research | software | paper"
    return 1
  fi

  if [[ ! -d "$repo_path" ]]; then
    echo "error: repo path does not exist: $repo_path"
    return 1
  fi

  local root
  root="$(_ai_config_root)"

  local template_file="$root/templates/AGENTS.${profile}.md"
  local target_file="$repo_path/AGENTS.md"

  if [[ "$profile" != "research" && "$profile" != "software" && "$profile" != "paper" ]]; then
    echo "error: unsupported profile '$profile'"
    echo "profiles: research | software | paper"
    return 1
  fi

  if [[ ! -e "$target_file" ]]; then
    cp "$template_file" "$target_file"
    echo "created: $target_file from profile '$profile'"
  else
    echo "kept existing: $target_file"
  fi

  "$root/install/bootstrap.sh" --repo "$repo_path"
}

ai-open-agents-dir() {
  local dirs=(
    "$HOME/.config/Code/User/agents"
    "$HOME/.config/Code - Insiders/User/agents"
    "$HOME/Library/Application Support/Code/User/agents"
    "$HOME/Library/Application Support/Code - Insiders/User/agents"
  )

  local any=0
  for d in "${dirs[@]}"; do
    if [[ -d "$d" ]]; then
      echo "$d"
      any=1
    fi
  done

  if [[ "$any" -eq 0 ]]; then
    echo "No known VS Code agents directory found."
    echo "Run: ./install/bootstrap.sh --global"
    return 1
  fi
}
