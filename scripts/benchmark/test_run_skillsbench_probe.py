"""Offline checks for the probe's usage records and export index shape."""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
import json
import tempfile
import unittest

import run_skillsbench_probe as probe


class ExecResult:
    def __init__(self, return_code: int = 0, stdout: str = "", stderr: str = ""):
        self.return_code = return_code
        self.stdout = stdout
        self.stderr = stderr


class FakeEnv:
    """Replays canned exec results so capture can run without Docker."""

    def __init__(self, responses: list[ExecResult]):
        self.responses = list(responses)

    async def exec(self, command, user=None, env=None, timeout_sec=None):
        return self.responses.pop(0)


def evidence(**overrides):
    value = {
        "session_id": "ses_root",
        "agent": "delivery",
        "version": "1.18.35",
        "cost": 0,
        "tokens": {"input": 120, "output": 30, "reasoning": 5},
        "cache_tokens": {"read": 40, "write": 0},
        "tools": [],
    }
    value.update(overrides)
    return value


class UsageRecordTests(unittest.TestCase):
    def test_reported_values_are_kept_as_measured(self):
        record = probe.usage_record(evidence())
        self.assertEqual(record["status"], "measured")
        self.assertEqual(record["source"], "session_export")
        self.assertEqual(record["tokens"]["input"], 120)
        self.assertEqual(record["cache_tokens"]["read"], 40)
        self.assertEqual(record["cost_usd"], "0")

    def test_missing_usage_is_unavailable_not_zero(self):
        record = probe.usage_record(evidence(cost=None, tokens={}, cache_tokens={}))
        self.assertEqual(record["status"], "unavailable")
        self.assertIsNone(record["tokens"]["input"])
        self.assertIsNone(record["cache_tokens"]["read"])
        self.assertIsNone(record["cost_usd"])

    def test_tokens_without_cost_are_partial(self):
        record = probe.usage_record(evidence(cost=None))
        self.assertEqual(record["status"], "partial")
        self.assertEqual(record["tokens"]["input"], 120)

    def test_missing_component_keeps_the_record_partial(self):
        record = probe.usage_record(evidence(tokens={"input": 1, "output": 1}))
        self.assertEqual(record["status"], "partial")

    def test_measured_requires_every_component_and_a_cost(self):
        full = probe.usage_record(evidence())
        self.assertEqual(full["status"], "measured")
        for field in ("input", "output", "reasoning"):
            tokens = {"input": 1, "output": 1, "reasoning": 1}
            tokens.pop(field)
            self.assertEqual(probe.usage_record(evidence(tokens=tokens))["status"], "partial")

    def test_unusable_cost_does_not_crash_or_become_zero(self):
        record = probe.usage_record(evidence(cost="unknown"))
        self.assertEqual(record["status"], "partial")
        self.assertIsNone(record["cost_usd"])

    def test_negative_values_are_not_reported_as_usage(self):
        record = probe.usage_record(evidence(cost=-1, tokens={"input": -5}))
        self.assertIsNone(record["cost_usd"])
        self.assertIsNone(record["tokens"]["input"])


class BenchflowUsageTests(unittest.TestCase):
    def test_unavailable_tracking_is_recorded_without_inventing_values(self):
        result = SimpleNamespace(
            usage_tracking={"status": "unavailable"},
            n_input_tokens=0,
            n_output_tokens=0,
            cost_usd=None,
        )
        record = probe.benchflow_usage(result)
        self.assertEqual(record["source"], "benchflow_acp")
        self.assertEqual(record["status"], "unavailable")
        self.assertEqual(record["reported_status"], "unavailable")
        self.assertEqual(record["input_tokens"], 0)
        self.assertEqual(record["output_tokens"], 0)
        self.assertIsNone(record["cost_usd"])

    def test_missing_tracking_entirely_is_unavailable(self):
        record = probe.benchflow_usage(SimpleNamespace())
        self.assertEqual(record["status"], "unavailable")
        self.assertIsNone(record["input_tokens"])
        self.assertIsNone(record["cost_usd"])

    def test_tracking_fields_are_preferred_over_flat_counters(self):
        result = {
            "usage_tracking": {
                "status": "available",
                "source": "agent_native_acp",
                "input_tokens": 563,
                "output_tokens": 583,
                "cache_read_tokens": 45184,
            },
            "n_input_tokens": 0,
            "cost_usd": None,
        }
        record = probe.benchflow_usage(result)
        self.assertEqual(record["status"], "partial")
        self.assertEqual(record["reported_source"], "agent_native_acp")
        self.assertEqual(record["input_tokens"], 563)
        self.assertEqual(record["cache_read_tokens"], 45184)
        self.assertIsNone(record["cost_usd"])


class CaptureIndexTests(unittest.TestCase):
    def test_capture_writes_usage_into_each_index_record(self):
        summary = evidence(tools=[
            {"agent": "delivery", "tool": "skill", "status": "completed", "skill_name": "delivery-policy"},
        ])
        env = FakeEnv([
            ExecResult(stdout="1.18.35\n"),
            ExecResult(stdout=json.dumps([{"id": "ses_root"}])),
            ExecResult(stdout=json.dumps({"info": {"id": "ses_root"}, "messages": []})),
            ExecResult(stdout=json.dumps(summary)),
        ])
        with tempfile.TemporaryDirectory() as temp:
            capture = asyncio.run(probe.capture_sessions(env, Path(temp), "sk-private-key"))
            index = json.loads((Path(temp) / "session-export-index.json").read_text())
        self.assertEqual(capture["status"], "captured")
        self.assertEqual(index[0]["usage"]["status"], "measured")
        self.assertEqual(index[0]["usage"]["tokens"]["input"], 120)
        self.assertEqual(index[0]["usage"]["cost_usd"], "0")
        self.assertEqual(index[0]["agent"], "delivery")

    def test_failed_summary_keeps_the_session_without_usage(self):
        env = FakeEnv([
            ExecResult(stdout="1.18.35\n"),
            ExecResult(stdout=json.dumps([{"id": "ses_root"}])),
            ExecResult(stdout=json.dumps({"info": {"id": "ses_root"}, "messages": []})),
            ExecResult(return_code=1, stdout="", stderr="boom"),
        ])
        with tempfile.TemporaryDirectory() as temp:
            capture = asyncio.run(probe.capture_sessions(env, Path(temp), "sk-private-key"))
            index = json.loads((Path(temp) / "session-export-index.json").read_text())
        self.assertEqual(capture["status"], "metadata_unavailable")
        self.assertEqual(index[0]["evidence_status"], "summary_failed")
        self.assertNotIn("usage", index[0])

    def test_child_session_listed_by_a_task_tool_is_exported_and_measured(self):
        root_summary = evidence(tools=[
            {
                "agent": "delivery", "tool": "task", "status": "completed",
                "skill_name": None, "target_agent": "code", "child_session_id": "ses_code",
            },
        ])
        child_summary = evidence(session_id="ses_code", agent="code", tools=[])
        env = FakeEnv([
            ExecResult(stdout="1.18.35\n"),
            ExecResult(stdout=json.dumps([{"id": "ses_root"}])),
            ExecResult(stdout=json.dumps({"info": {"id": "ses_root"}, "messages": []})),
            ExecResult(stdout=json.dumps(root_summary)),
            ExecResult(stdout=json.dumps({"info": {"id": "ses_code"}, "messages": []})),
            ExecResult(stdout=json.dumps(child_summary)),
        ])
        with tempfile.TemporaryDirectory() as temp:
            capture = asyncio.run(probe.capture_sessions(env, Path(temp), "sk-private-key"))
            index = json.loads((Path(temp) / "session-export-index.json").read_text())
        self.assertEqual([record["id"] for record in index], ["ses_root", "ses_code"])
        self.assertEqual(index[1]["parent_id"], "ses_root")
        self.assertEqual(index[1]["agent"], "code")
        self.assertEqual(index[1]["usage"]["status"], "measured")
        self.assertEqual(capture["status"], "captured")


if __name__ == "__main__":
    unittest.main()
