"""Preparation-to-ledger integration through actual adapter, no SDK/runtime/key."""

import asyncio
from contextlib import ExitStack
from dataclasses import replace
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import evaluation_runner as runner
from prepare_evaluation import prepare
from test_evaluation_runner import SHA, RegistryEntry, manifest, workspace
from test_run_skillsbench_probe import capture_fixture, ExecResult


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "skillsbench/tasks/dialogue-parser").mkdir(parents=True)
        self.source = workspace(self.root, "source")
        path = self.source / "opencode.jsonc"
        config = json.loads(path.read_text())
        config["agent"]["research"] = {"model": "opencode/mimo-v2.6-flash-free"}
        path.write_text(json.dumps(config))
        raw = manifest(self.root, self.source)
        raw["plan"]["repetitions"] = 2
        raw["plan"]["limits"].update(variant_attempts=2, run_attempts=2)
        raw["variants"][0]["workspace_digest"] = runner.EvaluationManifest.workspace_digest(self.source)
        self.path = self.root / "evaluation-run.json"
        self.path.write_text(json.dumps(raw))
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch("evaluation_runner.EVAL_ROOT", self.root))
        self.stack.enter_context(patch("evaluation_runner.subprocess.check_output", side_effect=lambda args, **kw: SHA if args[-1] == "HEAD" else ""))
        self.prepared = runner.EvaluationManifest.from_dict(json.loads(prepare(self.path).read_text()))
        runner.validate_inputs(self.prepared)
        self.stack.enter_context(patch("evaluation_runner.version", return_value="0.6.3"))
        self.stack.enter_context(patch("run_skillsbench_probe.main_container_id", new=AsyncMock(return_value="container")))
        self.stack.enter_context(patch("run_skillsbench_probe.inspect_container"))
        self.stack.enter_context(patch("run_skillsbench_probe.check_summary_helper", new=AsyncMock()))

    def execute(self, mode="complete", count=1):
        entry = RegistryEntry()
        registry = ModuleType("benchflow.agents.registry")
        registry.get_agent = lambda _: (entry, None)
        def register(name, install_cmd, launch_cmd, **kwargs):
            entry.install_cmd, entry.launch_cmd = install_cmd, launch_cmd
        registry.register_agent = register
        sdk = ModuleType("benchflow.rollout")
        sdk.RolloutConfig = lambda **kw: SimpleNamespace(**kw)
        self.cleanups = []
        self.calls = []
        async def create(config):
            self.calls.append(config)
            if mode == "creation_failure":
                raise RuntimeError("private arbitrary exception must not be persisted")
            env = capture_fixture(count)
            env.upload_dir, env.upload_file = AsyncMock(), AsyncMock()
            if mode in ("secret", "secret_cleanup_error"):
                env.responses[2] = ExecResult(stdout="offline-dedicated-key")
            if mode == "partial_capture_failure":
                original_exec = env.exec
                counter = 0
                async def partial_exec(*args, **kw):
                    nonlocal counter
                    counter += 1
                    if counter == 5:
                        raise RuntimeError("private failure after index exists")
                    return await original_exec(*args, **kw)
                env.exec = partial_exec
            if mode == "capture_failure":
                async def broken(*args, **kw):
                    raise RuntimeError("private capture failure")
                env.exec = broken
            cleanup = AsyncMock(side_effect=RuntimeError("private cleanup exception") if mode in ("cleanup_error", "secret_cleanup_error") else None)
            self.cleanups.append(cleanup)
            rollout = SimpleNamespace(env=env, cleanup=cleanup)
            async def run():
                # Fake the pinned SDK's cleanup ownership, including cancellation.
                try:
                    if mode == "before_environment":
                        rollout.env = None
                        raise RuntimeError("private before environment")
                    await config.pre_agent_hooks[0](env)
                    if mode == "timeout":
                        await asyncio.sleep(10)
                    if mode in ("runtime_failure", "secret", "secret_cleanup_error"):
                        raise RuntimeError("private runtime failure")
                finally:
                    await rollout.cleanup()
                if mode == "after_capture":
                    raise RuntimeError("private exception after cleanup")
                return SimpleNamespace(task_name="dialogue-parser", rewards={"reward": 1}, error=None, error_category=None)
            rollout.run = run
            return rollout
        sdk.Rollout = SimpleNamespace(create=create)
        modules = {"benchflow": ModuleType("benchflow"), "benchflow.agents": ModuleType("benchflow.agents"), "benchflow.agents.registry": registry, "benchflow.rollout": sdk}
        with patch.dict(sys.modules, modules):
            def attempt(spec, fresh):
                return asyncio.run(runner._benchflow_attempt(spec, fresh, self.prepared, "offline-dedicated-key"))
            if mode == "timeout":
                original = asyncio.wait_for
                async def short(awaitable, timeout):
                    return await original(awaitable, timeout=0.01)
                with patch("evaluation_runner.asyncio.wait_for", new=short):
                    return runner.execute(self.prepared, attempt)
            return runner.execute(self.prepared, attempt)

    def test_complete_prepared_lifecycle_has_pinned_records_and_usage(self):
        records = self.execute()
        self.assertEqual(len(records), 2)
        for record in records:
            self.assertEqual(record["upstream_outcome"], "completed")
            self.assertTrue(record["usage_complete"])
            self.assertEqual(record["pins"]["benchmark_sha"], SHA)
            self.assertEqual(record["evidence"]["capture_status"], "captured")
            self.assertTrue(record["evidence"]["index_available"])
        self.assertEqual([cleanup.await_count for cleanup in self.cleanups], [1, 1])
        self.assertFalse(list(self.source.glob("attempt.json")))

    def test_one_hour_agent_budget_has_separate_bounded_lifecycle_grace(self):
        self.prepared = replace(self.prepared, plan=replace(
            self.prepared.plan,
            limits=replace(self.prepared.plan.limits, attempt_seconds=3600),
        ))
        timeouts = []
        original = asyncio.wait_for
        async def observe(awaitable, timeout):
            timeouts.append(timeout)
            return await original(awaitable, timeout=timeout)
        with patch("evaluation_runner.asyncio.wait_for", new=observe):
            records = self.execute()
        self.assertEqual(timeouts, [4200, 4200])
        self.assertTrue(all(config.timeout == 3600 for config in self.calls))
        self.assertTrue(all(record["limits"]["attempt_seconds"] == 3600 for record in records))
        self.assertTrue(all(record["upstream_outcome"] == "completed" for record in records))

    def test_capped_actual_capture_stops_second_scheduled_adapter_call(self):
        records = self.execute(count=51)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertIsNone(record["usage"])
        self.assertFalse(record["usage_complete"])
        self.assertEqual(record["evidence"]["capture_status"], "incomplete")
        self.assertIn("listing_at_cap", record["evidence"]["incomplete_reasons"])
        self.assertEqual(len(record["evidence"]["sessions"]), 50)

    def test_failures_keep_capture_and_cleanup_evidence_without_exception_text(self):
        for mode in ("creation_failure", "before_environment", "runtime_failure", "after_capture", "capture_failure", "timeout"):
            with self.subTest(mode=mode):
                records = self.execute(mode)
                for record in records:
                    evidence = record["evidence"]
                    self.assertEqual(record["upstream_outcome"], "timeout" if mode == "timeout" else ("completed" if mode == "capture_failure" else "runtime_error"))
                    self.assertNotIn("private", json.dumps(record))
                    if mode in ("creation_failure", "before_environment", "capture_failure"):
                        self.assertEqual(len(records), 1)
                        self.assertIsNone(record["usage"])
                        self.assertFalse(evidence["index_available"])
                        self.assertNotIn("session_export_index", evidence)
                    else:
                        self.assertTrue(record["usage_complete"])
                        self.assertTrue(evidence["index_available"])
                        self.assertIn("session_export_index", evidence)
                    lifecycle = evidence["lifecycle"]
                    self.assertEqual(lifecycle["cleanup_completed"], mode != "creation_failure")
                self.assertTrue(all(cleanup.await_count == 1 for cleanup in self.cleanups))

    def test_partial_capture_exception_keeps_existing_index_and_stops(self):
        records = self.execute("partial_capture_failure", count=2)
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertIsNone(record["usage"])
        self.assertEqual(record["evidence"]["capture_status"], "capture_failed")
        self.assertTrue(record["evidence"]["index_available"])
        self.assertIn("session_export_index", record["evidence"])
        self.assertEqual(self.cleanups[0].await_count, 1)

    def test_cleanup_exception_retains_capture_and_reports_incomplete_cleanup(self):
        records = self.execute("cleanup_error")
        record = records[0]
        self.assertEqual(record["upstream_outcome"], "runtime_error")
        self.assertTrue(record["usage_complete"])
        self.assertTrue(record["evidence"]["index_available"])
        self.assertFalse(record["evidence"]["lifecycle"]["cleanup_completed"])
        self.assertTrue(all(cleanup.await_count == 1 for cleanup in self.cleanups))

    def test_secret_during_failure_cleanup_is_fatal_and_never_recorded(self):
        for mode in ("secret", "secret_cleanup_error"):
            with self.subTest(mode=mode):
                with self.assertRaises(runner.CredentialLeakError):
                    self.execute(mode)
                self.assertEqual(self.cleanups[0].await_count, 1)
                self.assertFalse(list(self.root.glob("attempt-*/attempt.json")))


if __name__ == "__main__":
    unittest.main()
