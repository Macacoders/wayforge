#!/usr/bin/env bats

setup() {
	REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
	TEST_TMPDIR="$(mktemp -d)"
	TEST_REPO="$TEST_TMPDIR/repo"
	TEST_AI_CONFIG="$TEST_TMPDIR/ai-config"
	mkdir -p "$TEST_REPO" "$TEST_AI_CONFIG"
	cp -a "$REPO_ROOT/install" "$TEST_AI_CONFIG/install"
	cp -a "$REPO_ROOT/base" "$TEST_AI_CONFIG/base"
	cp "$REPO_ROOT/VERSION" "$TEST_AI_CONFIG/VERSION"
}

teardown() {
	rm -rf "$TEST_TMPDIR"
}

remove_manifest_path() {
	local manifest="$1"
	local managed_path="$2"
	grep -Fvx "  - $managed_path" "$manifest" >"$manifest.tmp"
	mv "$manifest.tmp" "$manifest"
}

@test "bootstrap-thin.sh shows help" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --help
	[ "$status" -eq 0 ]
	[[ "$output" == *"Usage:"* ]]
	[[ "$output" == *"--repo <path>"* ]]
}

@test "bootstrap-thin.sh fails without arguments" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh"
	[ "$status" -eq 1 ]
	[[ "$output" == *"Usage:"* ]]
}

@test "bootstrap-thin.sh rejects invalid provider lists" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --providers invalid-provider
	[ "$status" -eq 1 ]
	[[ "$output" == *"error: invalid provider 'invalid-provider'"* ]]
}

@test "bootstrap-thin.sh rejects model overrides for disabled providers" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --providers openai --model github-copilot/gpt-5.4
	[ "$status" -eq 1 ]
	[[ "$output" == *"error: --model provider 'github-copilot' is not enabled by --providers"* ]]
}

@test "bootstrap-thin.sh dry-run for kilocode leaves repo untouched" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --runtime kilocode --providers openai,github-copilot --dry-run
	[ "$status" -eq 0 ]
	[[ "$output" == *"DRY-RUN: would generate local config: $TEST_REPO/kilo.jsonc"* ]]
	[[ "$output" == *"repo bootstrap complete for: $TEST_REPO"* ]]
	[ ! -e "$TEST_REPO/.opencode" ]
	[ ! -e "$TEST_REPO/kilo.jsonc" ]
	[ ! -e "$TEST_AI_CONFIG/installed-projects.json.tmp" ]
}

@test "bootstrap-thin.sh rejects invalid runtime values" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --runtime invalid-runtime
	[ "$status" -eq 1 ]
	[[ "$output" == *"error: invalid --runtime 'invalid-runtime'"* ]]
}

@test "bootstrap-thin.sh preserves unmanaged conflicts during fresh install" {
	mkdir -p "$TEST_REPO/.opencode/agents"
	printf 'local planner override\n' >"$TEST_REPO/.opencode/agents/planner.md"

	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	[[ "$output" == *"skip conflict with unmanaged path (preserving local content): $TEST_REPO/.opencode/agents/planner.md"* ]]
	[[ "$(<"$TEST_REPO/.opencode/agents/planner.md")" == 'local planner override' ]]
	[ -f "$TEST_REPO/.opencode/agents/code.md" ]
	[ -f "$TEST_REPO/.ai-config-managed" ]
}

@test "bootstrap-thin.sh refreshes manifest-managed files on reinstall" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	printf 'user edited planner\n' >"$TEST_REPO/.opencode/agents/planner.md"

	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	[[ "$output" == *"existing install detected, refreshing managed paths from manifest"* ]]
	# Planner.md should have permission frontmatter injected and original agent content
	[[ "$(<"$TEST_REPO/.opencode/agents/planner.md")" == *"permission:"* ]]
	[[ "$(<"$TEST_REPO/.opencode/agents/planner.md")" == *"edit: ask"* ]]
	[[ "$(<"$TEST_REPO/.opencode/agents/planner.md")" == *"planner"* ]]
}

@test "bootstrap-thin.sh keeps AGENTS.md on reinstall without force" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	printf 'custom repo instructions\n' >"$TEST_REPO/AGENTS.md"

	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	[[ "$output" == *"kept existing AGENTS.md (use --force to refresh): $TEST_REPO/AGENTS.md"* ]]
	[[ "$(<"$TEST_REPO/AGENTS.md")" == 'custom repo instructions' ]]
}

@test "bootstrap-thin.sh --force refreshes AGENTS.md and opencode.jsonc on reinstall" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	printf 'custom repo instructions\n' >"$TEST_REPO/AGENTS.md"
	printf '// local override\n' >"$TEST_REPO/opencode.jsonc"

	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force
	[ "$status" -eq 0 ]
	[[ "$output" == *"generated local config: $TEST_REPO/opencode.jsonc"* ]]
	[[ "$output" == *"copied managed file: $TEST_REPO/AGENTS.md"* ]]
	cmp -s "$TEST_AI_CONFIG/base/AGENTS.md" "$TEST_REPO/AGENTS.md"
	[[ "$(<"$TEST_REPO/opencode.jsonc")" != *'// local override'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"$schema": "https://opencode.ai/config.json"'* ]]
}

@test "bootstrap-thin.sh refreshes manifest-managed command and skill files on reinstall" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	printf 'user edited command\n' >"$TEST_REPO/.opencode/commands/plan.md"
	printf 'user edited skill\n' >"$TEST_REPO/.opencode/skills/shared-task/scripts/gh-issue.ts"

	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	cmp -s "$TEST_AI_CONFIG/base/opencode/commands/plan.md" "$TEST_REPO/.opencode/commands/plan.md"
	cmp -s "$TEST_AI_CONFIG/base/opencode/skills/shared-task/scripts/gh-issue.ts" "$TEST_REPO/.opencode/skills/shared-task/scripts/gh-issue.ts"
}

@test "bootstrap-thin.sh discovers manifest paths added since prior install" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	rm -f "$TEST_REPO/AGENTS.md" "$TEST_REPO/.opencode/commands/issue.md" "$TEST_REPO/.opencode/skills/shared-task/scripts/gh-issue.ts"
	remove_manifest_path "$TEST_REPO/.ai-config-managed" "AGENTS.md"
	remove_manifest_path "$TEST_REPO/.ai-config-managed" ".opencode/commands/issue.md"
	remove_manifest_path "$TEST_REPO/.ai-config-managed" ".opencode/skills/shared-task/scripts/gh-issue.ts"

	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	[[ "$output" == *"new managed path discovered: AGENTS.md"* ]]
	[[ "$output" == *"new managed path discovered: .opencode/commands/issue.md"* ]]
	[[ "$output" == *"new managed path discovered: .opencode/skills/shared-task/scripts/gh-issue.ts"* ]]
	cmp -s "$TEST_AI_CONFIG/base/AGENTS.md" "$TEST_REPO/AGENTS.md"
	cmp -s "$TEST_AI_CONFIG/base/opencode/commands/issue.md" "$TEST_REPO/.opencode/commands/issue.md"
	cmp -s "$TEST_AI_CONFIG/base/opencode/skills/shared-task/scripts/gh-issue.ts" "$TEST_REPO/.opencode/skills/shared-task/scripts/gh-issue.ts"
}

@test "root bootstrap-thin.sh --force performs a tracked-free fresh install" {
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force
	[ "$status" -eq 0 ]
	[ -f "$TEST_REPO/.ai-config-managed" ]
	[ -f "$TEST_REPO/opencode.jsonc" ]
	[ -f "$TEST_REPO/AGENTS.md" ]
	[ -f "$TEST_REPO/.opencode/commands/issue.md" ]
	[ -f "$TEST_REPO/.opencode/skills/shared-task/scripts/gh-issue.ts" ]
}

@test "root bootstrap-thin.sh --force refreshes managed files from manifest" {
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force
	[ "$status" -eq 0 ]
	printf 'custom repo instructions\n' >"$TEST_REPO/AGENTS.md"
	printf '// local override\n' >"$TEST_REPO/opencode.jsonc"
	printf 'user edited command\n' >"$TEST_REPO/.opencode/commands/plan.md"
	printf 'user edited skill\n' >"$TEST_REPO/.opencode/skills/shared-task/scripts/gh-issue.ts"
	rm -f "$TEST_REPO/.opencode/commands/issue.md"
	remove_manifest_path "$TEST_REPO/.ai-config-managed" ".opencode/commands/issue.md"

	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force
	[ "$status" -eq 0 ]
	[[ "$output" == *"existing install detected, refreshing managed paths from manifest"* ]]
	[[ "$output" == *"new managed path discovered: .opencode/commands/issue.md"* ]]
	cmp -s "$REPO_ROOT/base/AGENTS.md" "$TEST_REPO/AGENTS.md"
	cmp -s "$REPO_ROOT/base/opencode/commands/plan.md" "$TEST_REPO/.opencode/commands/plan.md"
	cmp -s "$REPO_ROOT/base/opencode/commands/issue.md" "$TEST_REPO/.opencode/commands/issue.md"
	cmp -s "$REPO_ROOT/base/opencode/skills/shared-task/scripts/gh-issue.ts" "$TEST_REPO/.opencode/skills/shared-task/scripts/gh-issue.ts"
	[[ "$(<"$TEST_REPO/opencode.jsonc")" != *'// local override'* ]]
}

@test "root bootstrap-thin.sh renders github-copilot balanced defaults" {
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force --providers github-copilot
	[ "$status" -eq 0 ]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"enabled_providers": ["opencode", "github-copilot"]'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"model": "github-copilot/gpt-5.4"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"small_model": "github-copilot/gpt-5.3-codex"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"steps": 16'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"reasoningEffort": "medium"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"github-copilot"'* ]]
}

@test "root bootstrap-thin.sh renders balanced openai plus github-copilot defaults" {
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force --providers openai,github-copilot
	[ "$status" -eq 0 ]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"enabled_providers": ["opencode", "openai", "github-copilot"]'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"model": "openai/gpt-5.5"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"small_model": "github-copilot/gemini-3.5-flash"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"model": "github-copilot/gemini-3.5-flash"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"steps": 30'* ]]
}

@test "root bootstrap-thin.sh honors openai-only overrides" {
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force --providers openai --model openai/gpt-5.4-mini --small-model openai/gpt-5.4-nano
	[ "$status" -eq 0 ]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"enabled_providers": ["opencode", "openai"]'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"model": "openai/gpt-5.4-mini"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"small_model": "openai/gpt-5.4-nano"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"steps": 20'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"reasoningEffort": "low"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"textVerbosity": "low"'* ]]
}

@test "root bootstrap-thin.sh renders kilocode config without opencode provider" {
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force --runtime kilocode --providers openai,github-copilot
	[ "$status" -eq 0 ]
	[ -f "$TEST_REPO/kilo.jsonc" ]
	[[ "$(<"$TEST_REPO/kilo.jsonc")" == *'"$schema": "https://app.kilo.ai/config.json"'* ]]
	[[ "$(<"$TEST_REPO/kilo.jsonc")" == *'"enabled_providers": ["openai", "github-copilot"]'* ]]
	[[ "$(<"$TEST_REPO/kilo.jsonc")" != *'"opencode"'* ]]
}

@test "root bootstrap-thin.sh preserves unmanaged managed-sync conflicts and refreshes managed symlinked files" {
	mkdir -p "$TEST_REPO/.opencode" "$TEST_TMPDIR/external"
	printf 'custom repo instructions\n' >"$TEST_REPO/AGENTS.md"
	mkdir -p "$TEST_TMPDIR/external/commands"
	ln -s "$TEST_TMPDIR/external/commands" "$TEST_REPO/.opencode/commands"
	printf 'local file blocks skills tree\n' >"$TEST_REPO/.opencode/skills"

	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force
	[ "$status" -eq 0 ]
	[[ "$output" == *"skip conflict with unmanaged file (preserving local content): $TEST_REPO/AGENTS.md"* ]]
	[[ "$output" == *"skip conflict with existing symlink (preserving local content): $TEST_REPO/.opencode/commands -> $TEST_TMPDIR/external/commands"* ]]
	[[ "$output" == *"skip conflict with non-directory path (preserving local content): $TEST_REPO/.opencode/skills"* ]]
	[[ "$(<"$TEST_REPO/AGENTS.md")" == 'custom repo instructions' ]]
	[ -L "$TEST_REPO/.opencode/commands" ]
	[ -f "$TEST_REPO/.opencode/skills" ]

	rm -f "$TEST_REPO/.opencode/commands" "$TEST_REPO/.opencode/skills"
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]

	printf 'external plan target\n' >"$TEST_TMPDIR/external/plan.md"
	rm -f "$TEST_REPO/.opencode/commands/plan.md"
	ln -s "$TEST_TMPDIR/external/plan.md" "$TEST_REPO/.opencode/commands/plan.md"
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	[[ "$output" == *"copied managed file: $TEST_REPO/.opencode/commands/plan.md"* ]]
	cmp -s "$REPO_ROOT/base/opencode/commands/plan.md" "$TEST_REPO/.opencode/commands/plan.md"
}

@test "root bootstrap-thin.sh renders laberit-only balanced defaults" {
	run "$REPO_ROOT/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --force --providers laberit
	[ "$status" -eq 0 ]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"model": "laberit/laberit-ai-preview"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"small_model": "laberit/laberit-ai"'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"enabled_providers": ["opencode", "laberit"]'* ]]
	[[ "$(<"$TEST_REPO/opencode.jsonc")" == *'"laberit"'* ]]
}

@test "bootstrap-thin.sh --help includes --no-track" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --help
	[ "$status" -eq 0 ]
	[[ "$output" == *"--no-track"* ]]
}

@test "bootstrap-thin.sh auto-detects temp paths and skips tracking" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO"
	[ "$status" -eq 0 ]
	[[ "$output" == *"skip tracking temporary/debug path"* ]]
	# Verify no entry was created in installed-projects.json
	if [[ -f "$TEST_AI_CONFIG/installed-projects.json" ]]; then
		[[ "$(<"$TEST_AI_CONFIG/installed-projects.json")" != *"$TEST_REPO"* ]]
	fi
}

@test "bootstrap-thin.sh --no-track prevents tracking entry" {
	run "$TEST_AI_CONFIG/install/legacy/bootstrap-thin.sh" --repo "$TEST_REPO" --no-track
	[ "$status" -eq 0 ]
	# NO_TRACK guard fires silently before canonicalization
	[[ "$output" != *"skip tracking temporary/debug path"* ]]
	[[ "$output" != *"tracked installed project"* ]]
	# Verify no entry in tracking file
	if [[ -f "$TEST_AI_CONFIG/installed-projects.json" ]]; then
		[[ "$(<"$TEST_AI_CONFIG/installed-projects.json")" != *"$TEST_REPO"* ]]
	fi
}
