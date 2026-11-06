"""Offline orchestration for fresh, pinned benchmark attempt workspaces.

The callable supplied to ``execute`` is the only component permitted to start
BenchFlow. Keeping it injected lets this module validate scheduling, pinning,
workspace isolation, and budget stops without importing BenchFlow or handling
credentials.
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict, dataclass, fields
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import shutil
import re
import subprocess
import tempfile
from typing import Callable, Dict, Optional, Tuple

from budget_contract import BudgetLedger, Outcome, Usage
from evaluation_plan import AttemptSpec, EvaluationPlan


REPO = Path(__file__).resolve().parents[2]
EVAL_ROOT = REPO / "temp" / "benchmark-testing"


@dataclass(frozen=True)
class VariantWorkspace:
	name: str
	path: Path
	digest: str


@dataclass(frozen=True)
class EvaluationManifest:
	plan: EvaluationPlan
	skillsbench_dir: Path
	variants: dict[str, VariantWorkspace]

	@staticmethod
	def _within(path: Path, root: Path) -> bool:
		try:
			path.resolve().relative_to(root.resolve())
		except ValueError:
			return False
		return True

	@staticmethod
	def workspace_digest(root: Path) -> str:
		_assert_no_source_symlinks(root)
		files: dict[str, str] = {}
		for path in root.rglob("*"):
			if path.is_symlink():
				raise ValueError(f"Workspace symlink is not allowed: {path}")
			if path.is_file():
				files[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
		return hashlib.sha256(
			json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
		).hexdigest()

	def verify_skillsbench_revision(self) -> None:
		actual = subprocess.check_output(
			["git", "-C", str(self.skillsbench_dir), "rev-parse", "HEAD"], text=True,
		).strip()
		if actual != self.plan.benchmark_sha:
			raise ValueError("SkillsBench revision does not match the evaluation plan")
		if subprocess.check_output(
			["git", "-C", str(self.skillsbench_dir), "status", "--porcelain"], text=True,
		).strip():
			raise ValueError("SkillsBench checkout must be clean")

	@classmethod
	def from_dict(cls, raw: dict[str, object]) -> "EvaluationManifest":
		if set(raw) != {"plan", "skillsbench_dir", "variants"}:
			raise ValueError("Run manifest must contain only plan, skillsbench_dir, and variants")
		if not isinstance(raw["plan"], dict):
			raise ValueError("Run manifest plan must be an object")
		plan = EvaluationPlan.from_dict(raw["plan"])
		skillsbench = Path(raw["skillsbench_dir"]) if isinstance(raw["skillsbench_dir"], str) else None
		if skillsbench is None or not cls._within(skillsbench, EVAL_ROOT) or not skillsbench.is_dir():
			raise ValueError("skillsbench_dir must be an existing directory inside the evaluation root")
		items = raw["variants"]
		if not isinstance(items, list):
			raise ValueError("variants must be a list")
		variants: dict[str, VariantWorkspace] = {}
		for item in items:
			if not isinstance(item, dict) or set(item) != {"name", "workspace", "workspace_digest"}:
				raise ValueError("Each variant needs name, workspace, and workspace_digest")
			name, workspace, digest = item["name"], item["workspace"], item["workspace_digest"]
			if not isinstance(name, str) or not isinstance(workspace, str) or not isinstance(digest, str):
				raise ValueError("Variant fields must be strings")
			path = Path(workspace)
			if name in variants or not cls._within(path, EVAL_ROOT) or path.resolve() == EVAL_ROOT.resolve() or not path.is_dir():
				raise ValueError("Variant workspace must be a unique directory inside the evaluation root")
			if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
				raise ValueError("Variant workspace_digest must be a lowercase SHA-256 digest")
			variants[name] = VariantWorkspace(name, path, digest)
		if set(variants) != {variant.name for variant in plan.variants}:
			raise ValueError("Run manifest variants must exactly match the evaluation plan")
		return cls(plan, skillsbench, variants)


AttemptRunner = Callable[[AttemptSpec, Path], Tuple[Outcome, Optional[Usage], Dict[str, object]]]


class CredentialLeakError(RuntimeError):
	"""A secret reached an output path; this must abort rather than become an outcome."""


def redact(value: object, key: str) -> object:
	"""Remove the dedicated key from any allowlisted persisted result value."""
	if isinstance(value, str):
		return value.replace(key, "[REDACTED]")
	if isinstance(value, dict):
		return {name: redact(item, key) for name, item in value.items()}
	if isinstance(value, list):
		return [redact(item, key) for item in value]
	return value


def _assert_no_source_symlinks(path: Path) -> None:
	for part in (path, *path.parents):
		if part.is_symlink():
			raise ValueError("Source symlink is not allowed")
		if part == EVAL_ROOT:
			break


def _required_workspace_files(path: Path) -> None:
	for relative in (
		Path("opencode.jsonc"),
		Path("AGENTS.md"),
		Path(".opencode/agents/delivery.md"),
		Path(".opencode/agents/code.md"),
		Path(".opencode/agents/reviewer.md"),
	):
		if not (path / relative).is_file():
			raise ValueError(f"Variant workspace is missing {relative}")


def _fresh_workspace(variant: VariantWorkspace, attempt: AttemptSpec) -> Path:
	if EvaluationManifest.workspace_digest(variant.path) != variant.digest:
		raise ValueError("Variant workspace digest does not match manifest")
	_required_workspace_files(variant.path)
	prefix = f"attempt-{attempt.number}-{attempt.variant.name}-{attempt.task}-"
	target = Path(tempfile.mkdtemp(prefix=prefix, dir=EVAL_ROOT))
	shutil.rmtree(target)
	shutil.copytree(variant.path, target, symlinks=False)
	_required_workspace_files(target)
	if EvaluationManifest.workspace_digest(target) != variant.digest:
		raise ValueError("Copied workspace digest does not match manifest")
	return target


def execute(manifest: EvaluationManifest, runner: AttemptRunner) -> list[dict[str, object]]:
	"""Run injected attempts once each, recording only restricted metadata.

	The real BenchFlow adapter is intentionally not imported here. It will supply
	the injected runner after human preflight; this layer owns fresh workspaces,
	ledger reservation, and the no-following-attempt stop rule.
	"""
	ledger = BudgetLedger(manifest.plan.limits)
	records: list[dict[str, object]] = []
	for attempt in manifest.plan.attempts():
		ledger.reserve(attempt.variant.name)
		workspace = _fresh_workspace(manifest.variants[attempt.variant.name], attempt)
		try:
			outcome, usage, evidence = runner(attempt, workspace)
		except CredentialLeakError:
			raise
		except (TimeoutError, asyncio.TimeoutError):
			outcome, usage, evidence = "timeout", None, {"capture_status": "not_attempted", "index_available": False, "failure_reason": "timeout"}
		except Exception:
			outcome, usage, evidence = "runtime_error", None, {"capture_status": "not_attempted", "index_available": False, "failure_reason": "runtime_exception"}
		finished = ledger.finish(outcome, usage)
		record = {
			"attempt": {
				"number": attempt.number,
				"task": attempt.task,
				"variant": attempt.variant.name,
				"wayforge_sha": attempt.variant.wayforge_sha,
				"repetition": attempt.repetition,
			},
			"pins": {
				"benchmark_sha": manifest.plan.benchmark_sha,
				"opencode_version": manifest.plan.opencode_version,
				"model": manifest.plan.model,
				"workspace_digest": manifest.variants[attempt.variant.name].digest,
			},
			"limits": _json_dataclass(manifest.plan.limits),
			"upstream_outcome": outcome,
			"ledger_outcome": finished.outcome,
			"usage": _json_dataclass(usage) if usage is not None else None,
			"usage_source": "session_exports; cost is runtime estimate, not provider billing",
			"usage_complete": bool(usage and usage.all_agents_included),
			"evidence": evidence,
		}
		(workspace / "attempt.json").write_text(json.dumps(record, indent=2) + "\n")
		records.append(record)
		if usage is None or not usage.all_agents_included or finished.outcome == "budget_exhausted":
			break
	return records


def _json_dataclass(value: object) -> dict[str, object]:
	from decimal import Decimal

	return {name: str(item) if isinstance(item, Decimal) else item for name, item in asdict(value).items()}


def allowlisted_result(result: object, jobs_dir: Path) -> dict[str, object]:
	"""Read only report-safe fields, falling back to BenchFlow's result file.

	The pinned SDK result object does not expose every field that its persisted
	`result.json` contains (notably timing), so never serialize that object whole.
	"""
	persisted: dict[str, object] = {}
	for path in jobs_dir.rglob("result.json"):
		try:
			candidate = json.loads(path.read_text())
		except (OSError, json.JSONDecodeError):
			continue
		if isinstance(candidate, dict):
			persisted = candidate
			break

	def value(name: str) -> object:
		return getattr(result, name, persisted.get(name))

	return {
		"task_name": value("task_name"),
		"rewards": value("rewards"),
		"error_category": value("error_category"),
		"verifier_error": value("verifier_error"),
		"n_tool_calls": value("n_tool_calls"),
		"timing": value("timing"),
	}


def _assert_run_config(workspace: Path, model: str) -> None:
	"""Reject a non-free, mismatched installed config before credential use."""
	from run_skillsbench_probe import FREE_MODELS

	if model not in FREE_MODELS:
		raise ValueError("The human-supervised runner accepts only declared free models")
	raw = (workspace / "opencode.jsonc").read_text()
	if raw.startswith("//"):
		raw = raw.partition("\n")[2]
	config = json.loads(raw)
	if not isinstance(config, dict):
		raise ValueError("Evaluation config must be an object")
	if config.get("enabled_providers") != ["opencode"]:
		raise ValueError("Evaluation workspace must enable only OpenCode")
	if config.get("model") != model or config.get("small_model") != model:
		raise ValueError("Evaluation root and small model must match the manifest")
	if config.get("default_agent") != "delivery":
		raise ValueError("Evaluation entry agent must be delivery")
	agents = config.get("agent")
	if not isinstance(agents, dict):
		raise ValueError("Evaluation agent config is missing")
	for name, agent in agents.items():
		if not isinstance(agent, dict) or ("model" in agent and agent["model"] != model):
			raise ValueError(f"Evaluation agent {name} must use the manifest model")
	_assert_markdown_agents(workspace)


def _assert_markdown_agents(workspace: Path) -> None:
	"""Accept only the flat model-agnostic subset emitted by our templates.

	This is a grammar allowlist, not a YAML parser. Unknown syntax is rejected.
	"""
	def reject(path: Path, line: int, reason: str) -> None:
		# Never echo frontmatter values, unknown keys, or private directory paths.
		name = path.name if re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", path.name) else "<nonstandard-filename>"
		raise ValueError(f"Unsupported markdown agent frontmatter: {name}:{line} ({reason})")

	patterns = {
		"description": r"[A-Za-z0-9][A-Za-z0-9 .,;()/_'—–-]*",
		"mode": r"(?:primary|subagent|all)",
		"temperature": r"(?:0(?:\.[0-9]+)?|1(?:\.0+)?)",
	}
	for path in (workspace / ".opencode/agents").rglob("*.md"):
		text = path.read_text()
		lines = text.splitlines()
		if not lines or lines[0] != "---":
			# Do not allow BOM/whitespace to hide a YAML document start.
			if text.lstrip("\ufeff \t\r\n").startswith("---"):
				reject(path, 1, "noncanonical_document_start")
			continue
		seen: set[str] = set()
		in_permissions = False
		permission_fields: set[str] = set()
		rule_fields: set[str] = set()
		rule_parent: str | None = None
		for number, line in enumerate(lines[1:], start=2):
			if in_permissions and line.startswith(" "):
				# Exact indentation and scalar grammar emitted by permissions.ts.
				# Quoted patterns are inert keys within permission, never YAML tags,
				# aliases, merges, or agent-level model/config assignments.
				field = re.fullmatch(r"  (read|edit|question|bash|external_directory|task):(?: (allow|deny|ask))?", line)
				if field:
					if rule_parent is not None and not rule_fields:
						reject(path, number, "empty_permission_rule_map")
					name, action = field.groups()
					if name in permission_fields:
						reject(path, number, "duplicate_permission_field")
					if action is None and name not in {"bash", "external_directory", "task"}:
						reject(path, number, "unsupported_permission_syntax")
					permission_fields.add(name)
					rule_parent = name if action is None else None
					rule_fields = set()
					continue
				rule = re.fullmatch(r'    ([A-Za-z_][A-Za-z0-9_-]*|"[A-Za-z0-9_/* .-]+"): (allow|deny|ask)', line)
				if rule_parent is None or rule is None:
					reject(path, number, "unsupported_permission_syntax")
				key = rule.group(1).strip('"')
				if key in rule_fields:
					reject(path, number, "duplicate_permission_rule")
				rule_fields.add(key)
				continue
			if in_permissions:
				if not permission_fields or (rule_parent is not None and not rule_fields):
					reject(path, number, "empty_permission_map")
				in_permissions = False
			if line == "---":
				break
			if line == "permission:":
				if "permission" in seen:
					reject(path, number, "duplicate_field")
				seen.add("permission")
				in_permissions = True
				continue
			name, separator, value = line.partition(": ")
			if not separator:
				reject(path, number, "unsupported_field_syntax")
			if name == "model":
				reject(path, number, "explicit_model_override")
			if name not in patterns:
				reject(path, number, "unknown_field_or_key_encoding")
			if name in seen:
				reject(path, number, "duplicate_field")
			if not re.fullmatch(patterns[name], value):
				reject(path, number, "unsupported_value_syntax")
			seen.add(name)
		else:
			reject(path, len(lines) + 1, "missing_document_end")


def validate_inputs(manifest: EvaluationManifest, *, check_models: bool = True) -> None:
	"""Validate all declared inputs before reading any dedicated credential."""
	if not EvaluationManifest._within(manifest.skillsbench_dir, EVAL_ROOT):
		raise ValueError("SkillsBench checkout escaped the evaluation root")
	_assert_no_source_symlinks(manifest.skillsbench_dir)
	manifest.verify_skillsbench_revision()
	for task in manifest.plan.tasks:
		path = manifest.skillsbench_dir / "tasks" / task
		if not path.is_dir() or not EvaluationManifest._within(path, manifest.skillsbench_dir):
			raise ValueError("Pinned SkillsBench task is missing or unsafe")
	for variant in manifest.variants.values():
		if not EvaluationManifest._within(variant.path, EVAL_ROOT) or variant.path.resolve() == EVAL_ROOT.resolve():
			raise ValueError("Variant workspace escaped the evaluation root")
		if EvaluationManifest.workspace_digest(variant.path) != variant.digest:
			raise ValueError("Variant workspace digest does not match manifest")
		_required_workspace_files(variant.path)
		_assert_markdown_agents(variant.path)
		if check_models:
			_assert_run_config(variant.path, manifest.plan.model)


def _pin_registry(get_agent: Callable, register_agent: Callable) -> None:
	"""Accept only the original or our exact already-pinned SDK registry entry."""
	from run_skillsbench_probe import OPENCODE_VERSION

	builtin, _ = get_agent("opencode")
	old = "opencode-ai@latest"
	pinned = f"opencode-ai@{OPENCODE_VERSION}"
	launch = "/opt/benchflow/js-agents/bin/opencode acp"
	if builtin.install_cmd.count(pinned) == 1 and old not in builtin.install_cmd and builtin.launch_cmd == launch:
		return
	if builtin.install_cmd.count(old) != 1 or builtin.launch_cmd != "/opt/benchflow/bin/opencode acp":
		raise RuntimeError("Pinned BenchFlow OpenCode registry contract changed")
	options = {
		field.name: getattr(builtin, field.name)
		for field in fields(builtin)
		if field.name not in ("name", "install_cmd", "launch_cmd")
	}
	register_agent("opencode", builtin.install_cmd.replace(old, pinned), launch, **options)


async def _run_benchflow_attempt(
	attempt: AttemptSpec, workspace: Path, manifest: EvaluationManifest, key: str,
	capture: dict[str, object], lifecycle: dict[str, object],
) -> object:
	"""Run one pinned attempt after the caller has reserved it.

	This is deliberately called only from the explicit CLI below. BenchFlow is
	imported here, not during offline tests or manifest validation.
	"""
	from run_skillsbench_probe import (
		capture_sessions,
		check_summary_helper,
		inspect_container,
		main_container_id,
	)

	if version("benchflow") != "0.6.3":
		raise RuntimeError("BenchFlow 0.6.3 is required")
	_assert_run_config(workspace, manifest.plan.model)
	task = manifest.skillsbench_dir / "tasks" / attempt.task
	if not task.is_dir():
		raise ValueError("Pinned SkillsBench task is missing")
	from benchflow.agents.registry import get_agent, register_agent
	from benchflow.rollout import Rollout, RolloutConfig

	_pin_registry(get_agent, register_agent)
	jobs_dir = workspace / "benchflow-jobs"
	jobs_dir.mkdir()

	async def stage_and_check(env: object) -> None:
		lifecycle["environment_created"] = True
		await env.upload_dir(workspace / ".opencode", "/app/.opencode")
		await env.upload_file(workspace / "opencode.jsonc", "/app/opencode.jsonc")
		await env.upload_file(workspace / "AGENTS.md", "/app/AGENTS.md")
		inspect_container(await main_container_id(env), key, jobs_dir)
		await check_summary_helper(env)

	config = RolloutConfig(
		task_path=task, agent="opencode", model=manifest.plan.model,
		environment="docker", jobs_dir=jobs_dir,
		timeout=manifest.plan.limits.attempt_seconds,
		agent_env={"OPENCODE_API_KEY": key}, pre_agent_hooks=[stage_and_check],
	)
	rollout = await Rollout.create(config)
	lifecycle["environment_created"] = rollout.env is not None
	cleanup = rollout.cleanup

	async def capture_before_cleanup() -> None:
		lifecycle["cleanup_called"] = True
		try:
			if rollout.env is not None:
				lifecycle["environment_created"] = True
				capture.update(status="capture_started")
				capture.update(await capture_sessions(rollout.env, jobs_dir, key))
		except CredentialLeakError:
			capture.update(status="raw_key_in_export")
			raise
		except Exception:
			capture.update(status="capture_failed", failure_reason="capture_exception")
		finally:
			await cleanup()
			lifecycle["cleanup_completed"] = True

	# The pinned SDK owns cleanup (including cancellation); never clean twice.
	rollout.cleanup = capture_before_cleanup
	# Keep a finite outer watchdog without consuming the agent's allowance
	# during setup, verification, and cleanup/capture.
	return await asyncio.wait_for(
		rollout.run(), timeout=manifest.plan.limits.attempt_seconds + 600,
	)


async def _benchflow_attempt(
	attempt: AttemptSpec, workspace: Path, manifest: EvaluationManifest, key: str,
) -> tuple[Outcome, Optional[Usage], dict[str, object]]:
	from run_skillsbench_probe import benchflow_usage

	capture: dict[str, object] = {"status": "not_attempted"}
	lifecycle: dict[str, object] = {"environment_created": False, "cleanup_called": False, "cleanup_completed": False}
	jobs_dir = workspace / "benchflow-jobs"
	result = None
	failure = None
	try:
		result = await _run_benchflow_attempt(attempt, workspace, manifest, key, capture, lifecycle)
	except CredentialLeakError:
		raise
	except (TimeoutError, asyncio.TimeoutError):
		failure = "timeout"
	except Exception:
		failure = "runtime_exception"
	if capture.get("status") == "raw_key_in_export":
		raise CredentialLeakError("Raw key found in session export")
	sessions = capture.get("sessions") if isinstance(capture.get("sessions"), list) else []
	usage: Optional[Usage] = None
	if capture.get("status") == "captured":
		from report import complete_session_usage
		totals = complete_session_usage("captured", sessions)
		if totals is not None:
			usage = Usage.from_values(
				totals["input"], totals["output"], totals["runtime_estimated_cost_usd"], True,
			)
	result_fields = allowlisted_result(result, jobs_dir) if result is not None else None
	if failure == "timeout":
		outcome: Outcome = "timeout"
	elif failure:
		outcome = "runtime_error"
	elif result_fields["error_category"] == "timeout":
		outcome = "timeout"
	elif getattr(result, "error", None):
		outcome = "runtime_error"
	else:
		reward = result_fields["rewards"].get("reward") if isinstance(result_fields["rewards"], dict) else None
		outcome = "completed" if reward == 1 else "verifier_failed"
	evidence = {
		"capture_status": capture.get("status"), "sessions": sessions,
		"incomplete_reasons": capture.get("incomplete_reasons", []),
		"index_available": (jobs_dir / "session-export-index.json").is_file(),
		"lifecycle": lifecycle,
	}
	if result_fields is not None:
		evidence["result"] = redact(result_fields, key)
		evidence["benchflow_usage"] = benchflow_usage(result)
	if failure:
		evidence["failure_reason"] = failure
	if capture.get("failure_reason"):
		evidence["capture_failure_reason"] = capture["failure_reason"]
	if evidence["index_available"]:
		evidence["session_export_index"] = "benchflow-jobs/session-export-index.json"
	return outcome, usage, evidence


def run_live(manifest: EvaluationManifest, key_path: Path) -> list[dict[str, object]]:
	"""Human-triggered entry point; never call this from automated validation."""
	from run_skillsbench_probe import assert_key_absent, private_key, scrub_host_credentials

	if EvaluationManifest._within(key_path, EVAL_ROOT):
		raise ValueError("Key file must be outside the evaluation root")
	validate_inputs(manifest)
	scrub_host_credentials()
	key = private_key(key_path)

	def runner(attempt: AttemptSpec, workspace: Path):
		try:
			if private_key(key_path) != key:
				raise ValueError("Dedicated key changed during the evaluation")
			return asyncio.run(_benchflow_attempt(attempt, workspace, manifest, key))
		finally:
			try:
				assert_key_absent(workspace, key)
			except RuntimeError as exc:
				raise CredentialLeakError("Raw key found in evaluation output") from exc

	return execute(manifest, runner)


def main() -> None:
	parser = argparse.ArgumentParser(description="Human-supervised bounded SkillsBench evaluation runner")
	parser.add_argument("manifest", type=Path, help="Private evaluation run manifest")
	parser.add_argument("--key-file", required=True, type=Path)
	args = parser.parse_args()
	if not EvaluationManifest._within(args.manifest, EVAL_ROOT):
		raise ValueError("Run manifest must be inside the ignored evaluation root")
	manifest = EvaluationManifest.from_dict(json.loads(args.manifest.read_text()))
	print(json.dumps(run_live(manifest, args.key_file), indent=2))


if __name__ == "__main__":
	main()
