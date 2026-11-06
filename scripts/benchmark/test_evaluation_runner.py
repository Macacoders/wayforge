"""Offline checks for fresh, pinned evaluation attempt workspaces."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

from budget_contract import Usage
from test_markdown_diagnostics import installed_agent_text
from evaluation_runner import (
	CredentialLeakError,
	EvaluationManifest,
	allowlisted_result,
	execute,
	redact,
	run_live,
	_benchflow_attempt,
	_pin_registry,
	_assert_run_config,
)


SHA = "a" * 40


def workspace(root: Path, name: str) -> Path:
	path = root / name
	(path / ".opencode" / "agents").mkdir(parents=True)
	for agent in ("delivery", "code", "reviewer"):
		(path / ".opencode" / "agents" / f"{agent}.md").write_text(installed_agent_text(agent))
	(path / "AGENTS.md").write_text("test\n")
	(path / "opencode.jsonc").write_text(json.dumps({
		"enabled_providers": ["opencode"], "model": "opencode/big-pickle",
		"small_model": "opencode/big-pickle", "default_agent": "delivery",
		"agent": {name: {"model": "opencode/big-pickle"} for name in ("delivery", "code", "reviewer")},
	}))
	return path


def manifest(root: Path, source: Path) -> dict[str, object]:
	return {
		"plan": {
			"benchmark_sha": SHA,
			"opencode_version": "1.18.35",
			"model": "opencode/big-pickle",
			"tasks": ["dialogue-parser"],
			"variants": [{"name": "baseline", "wayforge_sha": "b" * 40}],
			"repetitions": 1,
			"limits": {
				"attempt_seconds": 600,
				"attempt_input_tokens": 10000,
				"attempt_output_tokens": 5000,
				"attempt_usd": "0",
				"variant_usd": "0",
				"run_usd": "0",
				"provider_ceiling_usd": "0",
				"variant_attempts": 1,
				"run_attempts": 1,
			},
		},
		"skillsbench_dir": str(root / "skillsbench"),
		"variants": [{"name": "baseline", "workspace": str(source)}],
	}


class EvaluationRunnerTests(unittest.TestCase):
	def test_creates_a_fresh_workspace_and_writes_one_restricted_record(self):
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			(root / "skillsbench").mkdir()
			source = workspace(root, "baseline-source")
			with patch("evaluation_runner.EVAL_ROOT", root):
				config = manifest(root, source)
				config["variants"][0]["workspace_digest"] = EvaluationManifest.workspace_digest(source)
				parsed = EvaluationManifest.from_dict(config)
				seen = []

				def fake(attempt, fresh):
					seen.append(fresh)
					self.assertNotEqual(fresh, source)
					self.assertTrue((fresh / ".opencode/agents/reviewer.md").is_file())
					(fresh / "marker").write_text("only fresh copy")
					return "verifier_failed", Usage.from_values(1, 2, "0", True), {"result": {"task_name": attempt.task}}

				records = execute(parsed, fake)
				self.assertEqual(len(records), 1)
				self.assertEqual(records[0]["ledger_outcome"], "verifier_failed")
				self.assertEqual(records[0]["attempt"]["number"], 1)
				self.assertTrue((seen[0] / "attempt.json").is_file())
				self.assertFalse((source / "marker").exists())

	def test_rejects_tampered_source_before_runner_is_called(self):
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			(root / "skillsbench").mkdir()
			source = workspace(root, "baseline-source")
			with patch("evaluation_runner.EVAL_ROOT", root):
				config = manifest(root, source)
				config["variants"][0]["workspace_digest"] = "0" * 64
				parsed = EvaluationManifest.from_dict(config)
				with self.assertRaisesRegex(ValueError, "digest"):
					execute(parsed, lambda *_: self.fail("must not run"))

	def test_credential_leak_aborts_without_writing_an_attempt_record(self):
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			(root / "skillsbench").mkdir()
			source = workspace(root, "baseline-source")
			with patch("evaluation_runner.EVAL_ROOT", root):
				config = manifest(root, source)
				config["variants"][0]["workspace_digest"] = EvaluationManifest.workspace_digest(source)
				parsed = EvaluationManifest.from_dict(config)
				with self.assertRaisesRegex(CredentialLeakError, "key"):
					execute(parsed, lambda *_: (_ for _ in ()).throw(CredentialLeakError("raw key")))
				self.assertFalse(list(root.glob("attempt-*/attempt.json")))

	def test_allowlisted_result_reads_missing_timing_from_result_file(self):
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			(root / "job").mkdir()
			(root / "job" / "result.json").write_text(json.dumps({
				"task_name": "dialogue-parser",
				"rewards": {"reward": 0},
				"error_category": "timeout",
				"verifier_error": None,
				"n_tool_calls": 2,
				"timing": {"total": 901},
			}))
			result = type("Result", (), {
				"task_name": "dialogue-parser", "rewards": {"reward": 0},
				"error_category": "timeout", "verifier_error": None, "n_tool_calls": 2,
			})()
			self.assertEqual(allowlisted_result(result, root)["timing"], {"total": 901})

	def test_redact_removes_the_key_from_nested_result_fields(self):
		key = "sk-private-key"
		value = {"verifier_error": f"failed: {key}", "nested": [key, 1]}
		self.assertEqual(
			redact(value, key),
			{"verifier_error": "failed: [REDACTED]", "nested": ["[REDACTED]", 1]},
		)

	def test_missing_usage_stops_before_a_second_attempt(self):
		with tempfile.TemporaryDirectory() as temp:
			root = Path(temp)
			(root / "skillsbench").mkdir()
			source = workspace(root, "baseline-source")
			with patch("evaluation_runner.EVAL_ROOT", root):
				config = manifest(root, source)
				config["plan"]["repetitions"] = 2
				config["plan"]["limits"].update(variant_attempts=2, run_attempts=2)
				config["variants"][0]["workspace_digest"] = EvaluationManifest.workspace_digest(source)
				parsed = EvaluationManifest.from_dict(config)
				calls = []
				records = execute(parsed, lambda attempt, _: (calls.append(attempt) or ("timeout", None, {})))
				self.assertEqual(len(calls), 1)
				self.assertEqual(records[0]["ledger_outcome"], "timeout")


@dataclass
class RegistryEntry:
	name: str = "opencode"
	install_cmd: str = "npm install opencode-ai@latest"
	launch_cmd: str = "/opt/benchflow/bin/opencode acp"


class RunnerRepairTests(unittest.TestCase):
	def setUp(self):
		self.temp = tempfile.TemporaryDirectory()
		self.addCleanup(self.temp.cleanup)
		self.root = Path(self.temp.name)
		(self.root / "skillsbench/tasks/dialogue-parser").mkdir(parents=True)
		self.source = workspace(self.root, "source")
		self.config = manifest(self.root, self.source)
		self.refresh_digest()
		self.root_patch = patch("evaluation_runner.EVAL_ROOT", self.root)
		self.root_patch.start()
		self.addCleanup(self.root_patch.stop)

	def refresh_digest(self):
		self.config["variants"][0]["workspace_digest"] = EvaluationManifest.workspace_digest(self.source)

	def parsed(self):
		return EvaluationManifest.from_dict(self.config)

	def test_key_inside_root_rejected_and_outside_allowed_without_reading_a_key(self):
		with patch("evaluation_runner.validate_inputs"), patch("evaluation_runner.execute", return_value=[]) as execute_mock, patch("run_skillsbench_probe.private_key", return_value="dummy") as key, patch("run_skillsbench_probe.scrub_host_credentials"):
			with self.assertRaisesRegex(ValueError, "outside"):
				run_live(self.parsed(), self.root / "key")
			key.assert_not_called()
			self.assertEqual(run_live(self.parsed(), self.root.parent / "key"), [])
			key.assert_called_once()
			execute_mock.assert_called_once()

	def test_all_bad_inputs_fail_before_credential_access(self):
		for failure in ("revision", "dirty", "task", "digest", "required", "model"):
			with self.subTest(failure=failure):
				# Restore independent source/manifest fixtures for each rejection.
				import shutil
				shutil.rmtree(self.source)
				self.source = workspace(self.root, "source")
				self.refresh_digest()
				outputs = [SHA, ""]
				if failure == "revision":
					outputs[0] = "c" * 40
				elif failure == "dirty":
					outputs[1] = " M task.py"
				elif failure == "task":
					self.config["plan"]["tasks"] = ["missing"]
				elif failure == "digest":
					(self.source / "tampered").write_text("changed")
				elif failure == "required":
					(self.source / ".opencode/agents/code.md").unlink()
					self.refresh_digest()
				elif failure == "model":
					path = self.source / "opencode.jsonc"
					raw = json.loads(path.read_text())
					raw["agent"]["code"]["model"] = "openai/paid-model"
					path.write_text(json.dumps(raw))
					self.refresh_digest()
				with patch("evaluation_runner.subprocess.check_output", side_effect=outputs), patch("run_skillsbench_probe.private_key") as key:
					with self.assertRaises(ValueError):
						run_live(self.parsed(), self.root.parent / "key")
					key.assert_not_called()
				self.config["plan"]["tasks"] = ["dialogue-parser"]

	def test_child_model_overrides_in_json_and_markdown_are_rejected(self):
		for model in ("openai/paid", "opencode/mimo-v2.6-flash-free", None):
			with self.subTest(model=model):
				path = self.source / "opencode.jsonc"
				raw = json.loads(path.read_text())
				raw["agent"]["helper"] = {"model": model}
				path.write_text(json.dumps(raw))
				with self.assertRaisesRegex(ValueError, "manifest model"):
					_assert_run_config(self.source, "opencode/big-pickle")
		# Restore valid JSON, then exercise markdown's independent override.
		raw["agent"].pop("helper")
		path.write_text(json.dumps(raw))
		(self.source / ".opencode/agents/code.md").write_text("---\nmodel: openai/paid\n---\n")
		with self.assertRaisesRegex(ValueError, "markdown agent"):
			_assert_run_config(self.source, "opencode/big-pickle")

	def test_unsafe_paths_symlinks_and_source_root_are_rejected(self):
		for path in (self.root.parent, self.root):
			self.config["variants"][0]["workspace"] = str(path)
			with self.assertRaises(ValueError):
				self.parsed()
		self.config["variants"][0]["workspace"] = str(self.source)
		(self.source / "link").symlink_to(self.source / "AGENTS.md")
		with self.assertRaisesRegex(ValueError, "symlink"):
			execute(self.parsed(), lambda *_: self.fail("must not run"))

	def test_copied_digest_is_verified_before_runner(self):
		import shutil
		copy = shutil.copytree
		def corrupt(source, target, *args, **kwargs):
			copy(source, target, *args, **kwargs)
			if Path(source) == self.source:
				(Path(target) / "AGENTS.md").write_text("corrupt")
		with patch("evaluation_runner.shutil.copytree", side_effect=corrupt):
			with self.assertRaisesRegex(ValueError, "Copied workspace digest"):
				execute(self.parsed(), lambda *_: self.fail("must not run"))

	def test_reservation_precedes_call_and_budget_overrun_stops_schedule(self):
		from budget_contract import BudgetLedger
		self.config["plan"]["repetitions"] = 2
		self.config["plan"]["limits"].update(variant_attempts=2, run_attempts=2)
		ledger = BudgetLedger(self.parsed().plan.limits)
		def fake(attempt, fresh):
			self.assertEqual(ledger._pending, (1, "baseline"))
			return "verifier_failed", Usage.from_values(124076, 23747, "0", True), {}
		with patch("evaluation_runner.BudgetLedger", return_value=ledger):
			records = execute(self.parsed(), fake)
		self.assertEqual(len(records), 1)
		self.assertEqual(records[0]["ledger_outcome"], "budget_exhausted")
		self.assertEqual(records[0]["upstream_outcome"], "verifier_failed")
		self.assertEqual(records[0]["usage"]["input_tokens"], 124076)
		self.assertEqual(records[0]["pins"]["benchmark_sha"], SHA)
		self.assertEqual(records[0]["limits"]["attempt_usd"], "0")

	def test_runtime_and_outer_timeout_are_recorded_without_retry(self):
		for exc, outcome in ((RuntimeError(), "runtime_error"), (TimeoutError(), "timeout"), (asyncio.TimeoutError(), "timeout")):
			with self.subTest(outcome=outcome):
				fake = Mock(side_effect=exc)
				records = execute(self.parsed(), fake)
				self.assertEqual(records[0]["ledger_outcome"], outcome)
				self.assertIsNone(records[0]["usage"])
				fake.assert_called_once()

	def test_successful_attempts_always_get_independent_fresh_copies(self):
		self.config["plan"]["repetitions"] = 2
		self.config["plan"]["limits"].update(variant_attempts=2, run_attempts=2)
		seen = []
		def fake(attempt, fresh):
			self.assertFalse((fresh / "marker").exists())
			(fresh / "marker").write_text("attempt-local")
			seen.append(fresh)
			return "completed", Usage.from_values(1, 1, "0", True), {}
		records = execute(self.parsed(), fake)
		self.assertEqual(len(records), 2)
		self.assertNotEqual(seen[0], seen[1])
		self.assertFalse((self.source / "marker").exists())

	def test_live_wrapper_aborts_on_output_key_leak_without_serializing_record(self):
		async def fake(attempt, fresh, manifest, key):
			(fresh / "output").write_text(key)
			return "completed", Usage.from_values(1, 1, "0", True), {}
		with patch("evaluation_runner.validate_inputs"), patch("run_skillsbench_probe.scrub_host_credentials"), patch("run_skillsbench_probe.private_key", return_value="offline-dummy-key"), patch("evaluation_runner._benchflow_attempt", side_effect=fake):
			with self.assertRaises(CredentialLeakError):
				run_live(self.parsed(), self.root.parent / "key")
		self.assertFalse(list(self.root.glob("attempt-*/attempt.json")))

	def test_registry_patch_is_idempotent_and_rejects_changed_contract(self):
		entry = RegistryEntry()
		def register(name, install_cmd, launch_cmd, **kwargs):
			nonlocal entry
			entry = RegistryEntry(name, install_cmd, launch_cmd)
		get = lambda _: (entry, None)
		register_mock = Mock(side_effect=register)
		_pin_registry(get, register_mock)
		_pin_registry(get, register_mock)
		register_mock.assert_called_once()
		entry.launch_cmd = "unexpected"
		with self.assertRaisesRegex(RuntimeError, "contract changed"):
			_pin_registry(get, register_mock)

	def test_fake_benchflow_adapter_stages_preflights_captures_and_maps_outcomes(self):
		# Exercise the actual adapter without importing the installed SDK or Docker.
		entry = RegistryEntry()
		registry = ModuleType("benchflow.agents.registry")
		registry.get_agent = lambda _: (entry, None)
		def register(name, install_cmd, launch_cmd, **kwargs):
			entry.install_cmd, entry.launch_cmd = install_cmd, launch_cmd
		registry.register_agent = register
		rollout_module = ModuleType("benchflow.rollout")
		rollout_module.RolloutConfig = lambda **kwargs: SimpleNamespace(**kwargs)
		env = SimpleNamespace(upload_dir=AsyncMock(), upload_file=AsyncMock())
		cleanup = AsyncMock()
		created = []
		result = SimpleNamespace(task_name="dialogue-parser", rewards={"reward": 1}, error_category=None, error=None)
		async def create(config):
			created.append(config)
			rollout = SimpleNamespace(env=env, cleanup=cleanup)
			async def run():
				await config.pre_agent_hooks[0](env)
				await rollout.cleanup()
				return result
			rollout.run = run
			return rollout
		rollout_module.Rollout = SimpleNamespace(create=create)
		modules = {"benchflow": ModuleType("benchflow"), "benchflow.agents": ModuleType("benchflow.agents"), "benchflow.agents.registry": registry, "benchflow.rollout": rollout_module}
		from test_report import complete_sessions
		partial = complete_sessions()[:1]  # Dispatched child sessions are absent.
		cases = [
			(1, None, None, "completed", {"status": "captured", "sessions": complete_sessions()}, True),
			(0.667, None, None, "verifier_failed", {"status": "captured", "sessions": complete_sessions()}, True),
			(0, "failed", None, "runtime_error", {"status": "capture_failed"}, False),
			(0, "timed out", "timeout", "timeout", {"status": "capture_failed"}, False),
			(1, None, None, "completed", {"status": "captured", "sessions": partial}, False),
			(1, None, None, "completed", {"status": "truncated", "sessions": complete_sessions()}, False),
			(1, None, None, "completed", {"status": "raw_key_in_export"}, False),
		]
		for index, (reward, error, category, expected, capture, measured) in enumerate(cases):
			with self.subTest(expected=expected, capture=capture["status"]):
				result.rewards, result.error, result.error_category = {"reward": reward}, error, category
				fresh = workspace(self.root, f"adapter-{index}")
				with patch.dict(sys.modules, modules), patch("evaluation_runner.version", return_value="0.6.3"), patch("run_skillsbench_probe.main_container_id", new=AsyncMock(return_value="container")), patch("run_skillsbench_probe.inspect_container") as inspect, patch("run_skillsbench_probe.check_summary_helper", new=AsyncMock()), patch("run_skillsbench_probe.capture_sessions", new=AsyncMock(return_value=capture)), patch("run_skillsbench_probe.benchflow_usage", return_value={"status": "unavailable"}):
					if capture["status"] == "raw_key_in_export":
						with self.assertRaises(CredentialLeakError):
							asyncio.run(_benchflow_attempt(self.parsed().plan.attempts()[0], fresh, self.parsed(), "dummy-key"))
						continue
					outcome, usage, evidence = asyncio.run(_benchflow_attempt(self.parsed().plan.attempts()[0], fresh, self.parsed(), "dummy-key"))
				self.assertEqual(outcome, expected)
				if measured:
					self.assertEqual(usage.input_tokens, 300)
					self.assertTrue(usage.all_agents_included)
				else:
					self.assertIsNone(usage)
				self.assertEqual(evidence["capture_status"], capture["status"])
				inspect.assert_called_once()
				self.assertEqual(created[-1].timeout, 600)
				self.assertEqual(created[-1].model, "opencode/big-pickle")
				self.assertEqual(created[-1].task_path, self.root / "skillsbench/tasks/dialogue-parser")
		self.assertEqual(cleanup.await_count, len(cases))


if __name__ == "__main__":
	unittest.main()
