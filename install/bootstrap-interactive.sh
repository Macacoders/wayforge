#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_SH="$SCRIPT_DIR/bootstrap.sh"

log() {
	printf '[ai-config] %s\n' "$*"
}

usage() {
	cat <<'EOF'
Usage:
  ./install/bootstrap-interactive.sh

Guided interactive installer that collects safe preset choices and invokes
install/bootstrap.sh.
EOF
}

contains_provider() {
	local list="$1"
	local needle="$2"
	local item
	IFS=',' read -r -a items <<<"$list"
	for item in "${items[@]}"; do
		if [[ "$item" == "$needle" ]]; then
			return 0
		fi
	done
	return 1
}

prompt_menu_choice() {
	local prompt="$1"
	local default="$2"
	local value
	while true; do
		read -r -p "$prompt [$default]: " value
		value="${value:-$default}"
		case "$value" in
		[0-9]*)
			printf '%s' "$value"
			return
			;;
		*)
			log "please enter a number"
			;;
		esac
	done
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

if [[ ! -f "$BOOTSTRAP_SH" ]]; then
	log "error: missing installer script: $BOOTSTRAP_SH"
	exit 1
fi

DEFAULT_REPO="$(pwd)"
while true; do
	read -r -p "Target repository path [$DEFAULT_REPO]: " REPO_PATH
	REPO_PATH="${REPO_PATH:-$DEFAULT_REPO}"
	if [[ -d "$REPO_PATH" ]]; then
		break
	fi
	log "path does not exist or is not a directory: $REPO_PATH"
done

printf '\nRuntime:\n'
printf '  1) opencode (default)\n'
printf '  2) kilocode\n'
RUNTIME_CHOICE="$(prompt_menu_choice "Choose runtime" "1")"
case "$RUNTIME_CHOICE" in
1) RUNTIME="opencode" ;;
2) RUNTIME="kilocode" ;;
*)
	log "invalid runtime selection: $RUNTIME_CHOICE"
	exit 1
	;;
esac

if [[ "$RUNTIME" == "opencode" ]]; then
	printf '\nProvider set:\n'
	printf '  1) free-tier (default, no external provider)\n'
	printf '  2) openai\n'
	printf '  3) github-copilot\n'
	printf '  4) laberit\n'
	printf '  5) opencode-go\n'
	printf '  6) openai,github-copilot\n'
	printf '  7) openai,laberit\n'
	printf '  8) github-copilot,laberit\n'
	printf '  9) openai,github-copilot,laberit\n'
	PROVIDER_CHOICE="$(prompt_menu_choice "Choose provider set" "1")"
	case "$PROVIDER_CHOICE" in
	1) PROVIDERS="free-tier" ;;
	2) PROVIDERS="openai" ;;
	3) PROVIDERS="github-copilot" ;;
	4) PROVIDERS="laberit" ;;
	5) PROVIDERS="opencode-go" ;;
	6) PROVIDERS="openai,github-copilot" ;;
	7) PROVIDERS="openai,laberit" ;;
	8) PROVIDERS="github-copilot,laberit" ;;
	9) PROVIDERS="openai,github-copilot,laberit" ;;
	*)
		log "invalid provider selection: $PROVIDER_CHOICE"
		exit 1
		;;
	esac
else
	printf '\nProvider set:\n'
	printf '  1) openai (default)\n'
	printf '  2) github-copilot\n'
	printf '  3) laberit\n'
	printf '  4) opencode-go\n'
	printf '  5) openai,github-copilot\n'
	printf '  6) openai,laberit\n'
	printf '  7) github-copilot,laberit\n'
	printf '  8) openai,github-copilot,laberit\n'
	PROVIDER_CHOICE="$(prompt_menu_choice "Choose provider set" "1")"
	case "$PROVIDER_CHOICE" in
	1) PROVIDERS="openai" ;;
	2) PROVIDERS="github-copilot" ;;
	3) PROVIDERS="laberit" ;;
	4) PROVIDERS="opencode-go" ;;
	5) PROVIDERS="openai,github-copilot" ;;
	6) PROVIDERS="openai,laberit" ;;
	7) PROVIDERS="github-copilot,laberit" ;;
	8) PROVIDERS="openai,github-copilot,laberit" ;;
	*)
		log "invalid provider selection: $PROVIDER_CHOICE"
		exit 1
		;;
	esac
fi

printf '\nModel preset:\n'
printf '  1) installer defaults (recommended)\n'
printf '  2) faster responses\n'
MODEL_PRESET_CHOICE="$(prompt_menu_choice "Choose model preset" "1")"
MODEL_OVERRIDE=""
SMALL_MODEL_OVERRIDE=""
case "$MODEL_PRESET_CHOICE" in
1) ;;

2)
	if contains_provider "$PROVIDERS" "openai"; then
		MODEL_OVERRIDE="openai/gpt-5.4-mini"
	elif contains_provider "$PROVIDERS" "github-copilot"; then
		MODEL_OVERRIDE="github-copilot/gpt-5.3-codex"
	elif contains_provider "$PROVIDERS" "opencode-go"; then
		MODEL_OVERRIDE="opencode-go/deepseek-v4-flash"
	elif contains_provider "$PROVIDERS" "laberit"; then
		MODEL_OVERRIDE="laberit/laberit-ai"
	fi

	if contains_provider "$PROVIDERS" "github-copilot"; then
		SMALL_MODEL_OVERRIDE="github-copilot/gemini-3.5-flash"
	elif contains_provider "$PROVIDERS" "openai"; then
		SMALL_MODEL_OVERRIDE="openai/gpt-5.4-mini"
	elif contains_provider "$PROVIDERS" "opencode-go"; then
		SMALL_MODEL_OVERRIDE="opencode-go/deepseek-v4-flash"
	elif contains_provider "$PROVIDERS" "laberit"; then
		SMALL_MODEL_OVERRIDE="laberit/laberit-ai"
	fi
	;;
*)
	log "invalid model preset selection: $MODEL_PRESET_CHOICE"
	exit 1
	;;
esac

printf '\nAgent preset:\n'
printf '  1) balanced (default)\n'
printf '  2) fast\n'
printf '  3) thorough\n'
AGENT_PRESET_CHOICE="$(prompt_menu_choice "Choose agent preset" "1")"
case "$AGENT_PRESET_CHOICE" in
1) AGENT_PRESET="balanced" ;;
2) AGENT_PRESET="fast" ;;
3) AGENT_PRESET="thorough" ;;
*)
	log "invalid agent preset selection: $AGENT_PRESET_CHOICE"
	exit 1
	;;
esac

printf '\nDry run:\n'
printf '  1) no (default)\n'
printf '  2) yes\n'
DRY_RUN_CHOICE="$(prompt_menu_choice "Enable dry run" "1")"
case "$DRY_RUN_CHOICE" in
1) DRY_RUN=0 ;;
2) DRY_RUN=1 ;;
*)
	log "invalid dry-run selection: $DRY_RUN_CHOICE"
	exit 1
	;;
esac

printf '\nForce refresh managed files:\n'
printf '  1) no (default)\n'
printf '  2) yes\n'
FORCE_CHOICE="$(prompt_menu_choice "Enable force" "1")"
case "$FORCE_CHOICE" in
1) FORCE=0 ;;
2) FORCE=1 ;;
*)
	log "invalid force selection: $FORCE_CHOICE"
	exit 1
	;;
esac

printf '\nProvider connection instructions (not automated):\n'
if contains_provider "$PROVIDERS" "openai"; then
	printf '  - OpenAI: in OpenCode/Kilo Code, run /connect and complete OpenAI auth.\n'
fi
if contains_provider "$PROVIDERS" "github-copilot"; then
	printf '  - GitHub Copilot: in OpenCode/Kilo Code, run /connect and complete device login.\n'
fi
if contains_provider "$PROVIDERS" "laberit"; then
	printf '  - laberit: set OPENAI_BASE_URL and OPENAI_API_KEY in your local environment before use.\n'
fi

cmd=("$BOOTSTRAP_SH" --repo "$REPO_PATH" --runtime "$RUNTIME" --providers "$PROVIDERS")
if [[ -n "$MODEL_OVERRIDE" ]]; then
	cmd+=(--model "$MODEL_OVERRIDE")
fi
if [[ -n "$SMALL_MODEL_OVERRIDE" ]]; then
	cmd+=(--small-model "$SMALL_MODEL_OVERRIDE")
fi
if [[ "$AGENT_PRESET" != "balanced" ]]; then
	cmd+=(--agent-preset "$AGENT_PRESET")
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
	cmd+=(--dry-run)
fi
if [[ "$FORCE" -eq 1 ]]; then
	cmd+=(--force)
fi

printf '\nSummary:\n'
printf '  Repo: %s\n' "$REPO_PATH"
printf '  Runtime: %s\n' "$RUNTIME"
printf '  Providers: %s\n' "$PROVIDERS"
if [[ -n "$MODEL_OVERRIDE" ]]; then
	printf '  Model override: %s\n' "$MODEL_OVERRIDE"
else
	printf '  Model override: none (installer default)\n'
fi
if [[ -n "$SMALL_MODEL_OVERRIDE" ]]; then
	printf '  Small model override: %s\n' "$SMALL_MODEL_OVERRIDE"
else
	printf '  Small model override: none (installer default)\n'
fi
printf '  Agent preset: %s\n' "$AGENT_PRESET"
printf '  Dry run: %s\n' "$DRY_RUN"
printf '  Force: %s\n' "$FORCE"

printf '\nProceed with install? [Y/n]: '
read -r proceed
proceed="${proceed:-Y}"
case "$proceed" in
y | Y | yes | YES) ;;

*)
	log "cancelled"
	exit 0
	;;
esac

"${cmd[@]}"
